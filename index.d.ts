import { TransformOptions as EsbuildTransformOptions } from "esbuild";
import { BuildOptions as BuildOptions$1 } from "esbuild";
import { ChokidarOptions, RollupOptions, Plugin as RollupPlugin } from "rollup";
import http from "http";

interface InlineConfig extends UserConfig {
  configFile?: string | false;
  envFile?: false;
}
interface cssOptions {
  preprocessorOptions?: Record<string, any>;
}

type LibraryFormats = "es" | "cjs" | "umd" | "iife";

interface LibraryOptions {
  entry: string;
  name?: string;
  formats?: LibraryFormats[];
  fileName?: string;
}

interface WatcherOptions {
  buildDelay?: number;
  chokidar?: ChokidarOptions;
  clearScreen?: boolean;
  exclude?: string | RegExp | (string | RegExp)[];
  include?: string | RegExp | (string | RegExp)[];
  skipWrite?: boolean;
}

type AliasOptions = readonly Alias[] | { [find: string]: string };

interface Alias {
  find: string | RegExp;
  replacement: string;
}

interface HmrOptions {
  protocol?: string;
  host?: string;
  port?: number;
  clientPort?: number;
  path?: string;
  timeout?: number;
  overlay?: boolean;
  server?: http.Server;
}

type Matcher = AnyMatchPattern | AnyMatchPattern[];

type AnyMatchFn = (testString: string) => boolean;

type AnyMatchPattern = string | RegExp | AnyMatchFn;

interface WatchOptions {
  ignored?: Matcher;
  persistent?: boolean;
  ignoreInitial?: boolean;
  followSymlinks?: boolean;
  cwd?: string;
  disableGlobbing?: boolean;
  usePolling?: boolean;
  useFsEvents?: boolean;
  alwaysStat?: boolean;
  depth?: number;
  interval?: number;
  binaryInterval?: number;
  ignorePermissionErrors?: boolean;
  atomic?: boolean | number;
  awaitWriteFinish?: boolean;
}

interface BuildOptions {
  target?: "modules" | EsbuildTransformOptions["target"] | false;
  polyfillModulePreload?: boolean;
  outDir?: string;
  assetsDir?: string;
  ssr?: boolean | string;
  assetsInlineLimit?: number;
  cssCodeSplit?: boolean;
  cssTarget?: EsbuildTransformOptions["target"] | false;
  sourcemap?: boolean | "inline" | "hidden";
  minify?: boolean | "terser" | "esbuild";
  rollupOptions?: RollupOptions;
  write?: boolean;
  emptyOutDir?: boolean | null;
  manifest?: boolean | string;
  reportCompressedSize?: boolean;
  chunkSizeWarningLimit?: number;
  watch?: WatcherOptions | null;
  lib?: LibraryOptions | false;
}

type DepOptimizationOptions = DepOptimizationConfig & {
  entries?: string | string[];
  force?: boolean;
};

interface DepOptimizationConfig {
  include?: string[];
  exclude?: string[];
  needsInterop?: string[];
  esbuildOptions?: Omit<
    BuildOptions$1,
    | "bundle"
    | "entryPoints"
    | "external"
    | "write"
    | "watch"
    | "outdir"
    | "outfile"
    | "outbase"
    | "outExtension"
    | "metafile"
  >;
  extensions?: string[];
  disabled?: boolean | "build" | "dev";
}

export declare interface CommonServerOptions {
  port?: number;
  host?: string | boolean;
  open?: boolean | string;
}

interface ServerOptions extends CommonServerOptions {
  hmr?: HmrOptions | boolean;
  watch?: WatchOptions;
  middlewareMode?: boolean | "html" | "ssr";
  base?: string;
  fs?: FileSystemServeOptions;
  origin?: string;
  preTransformRequests?: boolean;
  force?: boolean;
}

interface FileSystemServeOptions {
  strict?: boolean;
  allow?: string[];
  deny?: string[];
}

interface ResolveOptions {
  mainFields?: string[];
  conditions?: string[];
  extensions?: string[];
  dedupe?: string[];
  preserveSymlinks?: boolean;
}

interface ESBuildOptions extends EsbuildTransformOptions {
  include?: string | RegExp | string[] | RegExp[];
  exclude?: string | RegExp | string[] | RegExp[];
  jsxInject?: string;
  minify?: never;
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

export type PluginOption =
  | Plugin
  | false
  | null
  | undefined
  | PluginOption[]
  | Promise<Plugin | false | null | undefined | PluginOption[]>;

export interface UserConfig {
  root?: string;
  base?: string;
  mode?: string;
  cacheDir?: string;
  plugins?: PluginOption[];
  resolve?: ResolveOptions & {
    alias: AliasOptions;
  };
  css?: cssOptions;
  clearScreen?: boolean;
  esbuild?: ESBuildOptions | false;
  server?: ServerOptions;
  optimizeDeps?: DepOptimizationOptions;
  build?: BuildOptions | null;
  publicDir?: string | false;
}

interface Vite {
  defineConfig(inlineConfig: InlineConfig): void;
  startDevServer(inlineConfig: InlineConfig = {}): Promise<void>;
  build(inlineConfig: InlineConfig = {}): void;
}

declare module "mini-vite-ysy" {
  export = vite;
}

declare var vite: Vite;
