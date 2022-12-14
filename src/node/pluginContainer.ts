import path from "path";
import fs from "fs";
import {
  PluginContext as RollupPluginContext,
  ResolvedId,
  InputOptions as RollupInputOptions,
  PartialResolvedId as RollupPartialResolvedId,
  SourceDescription as RollupSourceDescription,
  LoadResult as RollupLoadResult,
  FunctionPluginHooks as RollupFunctionPluginHooks,
  NormalizedInputOptions as RollupNormalizedInputOptions,
  RollupError,
} from "rollup";
import { Parser } from "acorn";

import { Plugin, TransformResult } from "./plugin";
import { ResolvedConfig } from "./config";

export const parser = Parser;

export declare interface PluginContainer {
  options: RollupInputOptions;
  buildStart(options: RollupInputOptions): Promise<void>;
  resolveId(
    id: string,
    importer?: string,
    options?: {
      isEntry?: boolean;
      skip?: Set<Plugin>;
    }
  ): Promise<RollupPartialResolvedId | null>;
  transform(
    code: string,
    id: string,
    options?: {
      inMap?: RollupSourceDescription["map"];
      ssr?: boolean;
    }
  ): Promise<RollupSourceDescription | null>;
  load(
    id: string,
    options?: {
      ssr?: boolean;
    }
  ): Promise<RollupLoadResult | null>;
  close(): Promise<void>;
}

type PluginContext = Omit<
  RollupPluginContext,
  | "cache"
  | "emitAsset"
  | "emitChunk"
  | "getAssetFileName"
  | "getChunkFileName"
  | "isExternal"
  | "moduleIds"
  | "resolveId"
  | "load"
  | "error"
> & {
  error: (
    err: RollupError | string,
    pos?: number | { column: number; line: number }
  ) => void;
};

export async function createPluginContainer(config: ResolvedConfig) {
  const rollupOptions = config.build?.rollupOptions || {};
  const { plugins } = config;

  const rollupPkgPath = path.resolve(
    config.root,
    "node_modules/rollup",
    "package.json"
  );
  const minimalContext = {
    meta: {
      rollupVersion: JSON.parse(fs.readFileSync(rollupPkgPath, "utf-8"))
        .version,
      watchMode: true,
    },
  };

  //??????????????????????????????????????????????????? ??????????????????this(context)????????????
  class Context {
    _activePlugin: Plugin | null;
    _resolveSkips: Set<Plugin> | null;
    constructor(initialPlugin?: Plugin) {
      this._activePlugin = initialPlugin || null;
      this._resolveSkips = null;
    }
    parse(code: string, opts: any = {}) {
      return parser.parse(code, {
        sourceType: "module",
        ecmaVersion: "latest",
        locations: true,
        ...opts,
      });
    }
    async resolve(
      id: string,
      importer?: string,
      options: { isEntry?: boolean; skipSelf?: boolean } = {}
    ) {
      let skip: Set<Plugin> = new Set();
      if (options.skipSelf && this._activePlugin) {
        skip = new Set(this._resolveSkips); //????????????????????????????????????
        skip.add(this._activePlugin); //????????????????????????????????????
      }
      delete options.skipSelf; //?????????????????? ?????????????????????resolveId
      const out = await container.resolveId(id, importer, { skip, ...options });
      if (typeof out === "string") return { id: out } as unknown as ResolvedId;
      return out as ResolvedId | null;
    }
    error(
      err: RollupError | string,
      pos?: number | { column: number; line: number }
    ) {
      throw new Error(err.toString());
    }
  }
  let closed = false;
  const container: PluginContainer = {
    //options????????????rollupOptions?????????
    options: await (async function () {
      for (const plugin of plugins as Plugin[]) {
        if (!plugin.options) continue;
        const AfterRollupOptions = await (
          plugin.options &&
          (plugin.options as RollupFunctionPluginHooks["options"])
        ).call(minimalContext, rollupOptions);
        return AfterRollupOptions || {};
      }
      return rollupOptions;
    })(),
    //?????????????????????(???????????????resolveId?????????????????? ???????????????????????????)
    async resolveId(
      id,
      importer = path.resolve(config.root, "index.html"),
      options
    ) {
      const ctx = new Context();
      let resolveIdResult: RollupPartialResolvedId = { id };
      for (const plugin of plugins as Plugin[]) {
        if ((plugin as Plugin).resolveId) {
          ctx._activePlugin = plugin; //???ctx???????????????????????????????????????resolved
          //??????????????????????????????skip?????????????????????????????????
          if (options?.skip && options?.skip?.has(plugin)) {
            continue;
          }
          if (plugin.resolveId) {
            const result = await (
              plugin.resolveId as RollupFunctionPluginHooks["resolveId"]
            ).call(ctx as unknown as RollupPluginContext, id, importer, {
              isEntry: !!options?.isEntry,
            });

            if (!result) continue;
            //??????????????????????????????id???
            if (typeof result === "string") {
              resolveIdResult.id = result;
            }

            return Object.assign(resolveIdResult, result);
          }
        }
      }
      //????????????????????????resolveIdResult
      return resolveIdResult;
    },
    //???????????????????????????
    async load(id, options) {
      const ctx = new Context();
      for (const plugin of plugins as Plugin[]) {
        if (plugin.load) {
          const res = await (
            plugin.load as RollupFunctionPluginHooks["load"]
          ).call(ctx as unknown as RollupPluginContext, id);
          if (res !== null && res !== undefined) {
            return res;
          }
        }
      }
      return null;
    },
    //???????????????????????????
    async buildStart() {
      await Promise.all(
        (plugins as Plugin[]).map((p) => {
          if (p.buildStart) {
            return (
              p.buildStart &&
              (p.buildStart as RollupFunctionPluginHooks["buildStart"])
            ).call(
              new Context(p) as unknown as RollupPluginContext,
              container.options as RollupNormalizedInputOptions
            );
          }
        })
      );
    },
    //????????????code=>code
    async transform(code, id, opts) {
      const ctx = new Context();
      let source: string = code;
      for (const plugin of plugins as Plugin[]) {
        let result: TransformResult | string | undefined;
        try {
          if (plugin.transform) {
            result = await (
              plugin.transform as RollupFunctionPluginHooks["transform"]
            ).call(ctx as any, source, id);
          }
        } catch (e) {
          ctx.error(e as RollupError | string);
        }
        if (!result) continue;
        if (typeof result === "string") {
          source = result;
        } else {
          source = result.code || "";
        }
      }
      return {
        code: source,
      };
    },
    //??????buildEnd???closeBundle????????????(?????????????????????????????????)
    async close() {
      if (closed) return; //???????????????
      const ctx = new Context();
      await Promise.all(
        (plugins as Plugin[]).map(
          (p) =>
            p.buildEnd &&
            (p.buildEnd as RollupFunctionPluginHooks["buildEnd"]).call(
              ctx as unknown as RollupPluginContext
            )
        )
      );
      await Promise.all(
        (plugins as Plugin[]).map(
          (p) =>
            p.closeBundle &&
            (p.closeBundle as RollupFunctionPluginHooks["closeBundle"]).call(
              ctx as unknown as RollupPluginContext
            )
        )
      );
      closed = true;
    },
  };
  return container;
}
