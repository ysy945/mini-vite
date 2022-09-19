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

  //每一个钩子都有一个自己的上下文属性 可以依次通过this(context)传递属性
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
        skip = new Set(this._resolveSkips); //保存上一次已经跳过的插件
        skip.add(this._activePlugin); //新增这一次需要跳过的插件
      }
      delete options.skipSelf; //删除这个属性 不需要传递到中resolveId
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
    //options钩子合并rollupOptions的钩子
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
    //解析路径的钩子(某个插件的resolveId一旦有返回值 则不再向下执行插件)
    async resolveId(
      id,
      importer = path.resolve(config.root, "index.html"),
      options
    ) {
      const ctx = new Context();
      let resolveIdResult: RollupPartialResolvedId = { id };
      for (const plugin of plugins as Plugin[]) {
        if ((plugin as Plugin).resolveId) {
          ctx._activePlugin = plugin; //在ctx中存储当前调用的那个钩子的resolved
          //如果当前处理的插件在skip中就跳过当前插件的处理
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
            //返回值是字符串赋值到id上
            if (typeof result === "string") {
              resolveIdResult.id = result;
            }

            return Object.assign(resolveIdResult, result);
          }
        }
      }
      //如果没有插件返回resolveIdResult
      return resolveIdResult;
    },
    //即将加载文件时调用
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
    //预构建开始之前调用
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
    //转换文件code=>code
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
    //调用buildEnd和closeBundle插件钩子(本次打包结束的时候调用)
    async close() {
      if (closed) return; //只执行一次
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
