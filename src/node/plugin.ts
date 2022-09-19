import {
  Plugin as RollupPlugin,
  PluginContext as RollupPluginContext,
  CustomPluginOptions as RollupCustomPluginOptions,
  LoadResult as RollupLoadResult,
  ResolveIdResult as RollupResolveIdResult,
  TransformPluginContext as RollupTransformPluginContext,
  SourceDescription as RollupSourceDescription,
} from "rollup";
import { ConfigEnv, ResolvedConfig, UserConfig } from "./config";
import { HmrContext } from "./hmr";
import { ServerHook, ViteDevServer } from "./server";
import { ModuleNode } from "./server/moduleGraph";

export type PluginOption =
  | Plugin
  | false
  | null
  | undefined
  | PluginOption[]
  | Promise<Plugin | false | null | undefined | PluginOption[]>;

export type TransformResult =
  | string
  | null
  | void
  | Partial<RollupSourceDescription>;

export declare type IndexHtmlTransform =
  | IndexHtmlTransformHook
  | {
      enforce?: "pre" | "post";
      transform: IndexHtmlTransformHook;
    };

export declare type IndexHtmlTransformHook = (
  html: string,
  ctx: IndexHtmlTransformContext
) => IndexHtmlTransformResult | void | Promise<IndexHtmlTransformResult | void>;

export declare type IndexHtmlTransformResult =
  | string
  | HtmlTagDescriptor[]
  | {
      html: string;
      tags: HtmlTagDescriptor[];
    };

export declare interface HtmlTagDescriptor {
  //标签类型<script> <div>
  tag: string;
  //属性<script src="xxx"></script>
  attrs?: Record<string, string | boolean | undefined>;
  //标签的children<div>xxx<div>
  children?: string | HtmlTagDescriptor[];
  //插入到哪里
  injectTo?: "head" | "body" | "head-prepend" | "body-prepend";
}

export declare interface IndexHtmlTransformContext {
  path: string;
  filename: string;
  server?: ViteDevServer;
  originalUrl?: string;
}

export interface Plugin extends RollupPlugin {
  //vite的plugin拓展基于Rollup的plugin系统
  //所有的rollup插件都可以用于vite的插件
  name: string; //插件名称

  enforce?: "pre" | "post";

  apply?: "serve" | "build" | ((config: UserConfig, env: ConfigEnv) => boolean);

  config?: (
    config: UserConfig,
    env: ConfigEnv
  ) => UserConfig | null | void | Promise<UserConfig | null | void>;

  configResolved?: (config: ResolvedConfig) => void | Promise<void>;

  configureServer?: ServerHook;
  /**
   * {
   *   string | [{tag:string,attrs:{},children,injectTo:"head" | "body" | "head-prepend" | "body-prepend"}]
   *   | {html:string,tags:[{},...,{}]}
   * }
   */
  transformIndexHtml?: IndexHtmlTransform; //返回结果可以有三种
  resolveId?: (
    this: RollupPluginContext,
    source: string,
    importer: string | undefined,
    options: {
      custom?: RollupCustomPluginOptions;
      ssr?: boolean;
      /* Excluded from this release type: scan */
      isEntry: boolean;
    }
  ) => Promise<RollupResolveIdResult> | RollupResolveIdResult;

  load?: (
    this: RollupPluginContext,
    id: string,
    options?: {
      ssr?: boolean;
    }
  ) => Promise<RollupLoadResult> | RollupLoadResult;
  transform?: (
    this: RollupTransformPluginContext,
    code: string,
    id: string,
    options?: {
      ssr?: boolean;
    }
  ) => Promise<TransformResult> | TransformResult;
  handleHotUpdate?: (
    this: void,
    hmrContext: HmrContext
  ) => Array<ModuleNode> | void | Promise<Array<ModuleNode> | void>;
}
