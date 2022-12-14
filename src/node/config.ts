import http from "http";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import { build, BuildOptions as BuildOptions$1 } from "esbuild";
import type { TransformOptions as EsbuildTransformOptions } from "esbuild";
import chalk from "chalk";
import { DEFAULT_CONFIG_FILES, ESBUILD_MODULES_TARGET } from "./constants";
import {
  dynamicImport,
  isObject,
  lookupFile,
  normalizePath,
  isArray,
  transformArray,
  asyncFlatten,
} from "./utils";
import { Plugin, PluginOption } from "./plugin";
import { ChokidarOptions, RollupOptions } from "rollup";
import {
  assetPlugin,
  preAliasPlugin,
  resolvePlugin,
  resolvePlugins,
  aliasPlugin,
  cssPlugin,
  buildGeneratePlugin,
  buildGenerateHtmlPlugin,
  BuildAssetPlugin,
} from "./plugins";
import transformPlugin from "./plugins/transformPlugin";
import importAnalysisPlugin from "./plugins/importAnalysisPlugin";
import { createPluginContainer, PluginContainer } from "./pluginContainer";
import clientInjectPlugin from "./plugins/clientInject";
import buildImportAnalysisPlugin from "./plugins/buildImportAnalysisPlugin";

type ChooseType<T> = T extends Promise<infer R> ? R : null;

export declare type ResolvedBuildOptions = ReturnType<
  typeof resolveBuildOptions
>;
export declare type ResolvedConfig = ChooseType<
  ReturnType<typeof resolveConfig>
>;

export declare interface ESBuildOptions extends EsbuildTransformOptions {
  include?: string | RegExp | string[] | RegExp[];
  exclude?: string | RegExp | string[] | RegExp[];
  jsxInject?: string;
  minify?: never;
}

export declare interface ResolveOptions {
  mainFields?: string[];
  conditions?: string[];
  extensions?: string[];
  dedupe?: string[];
  preserveSymlinks?: boolean;
}

export declare type AliasOptions =
  | readonly Alias[]
  | { [find: string]: string };

export declare interface Alias {
  find: string | RegExp;
  replacement: string;
}

export declare interface HmrOptions {
  protocol?: string;
  host?: string;
  port?: number;
  clientPort?: number;
  path?: string;
  timeout?: number;
  overlay?: boolean;
  server?: http.Server;
}

export declare type AnyMatchFn = (testString: string) => boolean;

export declare type AnyMatchPattern = string | RegExp | AnyMatchFn;

export declare type Matcher = AnyMatchPattern | AnyMatchPattern[];

export declare interface WatchOptions {
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

export declare interface FileSystemServeOptions {
  strict?: boolean;
  allow?: string[];
  deny?: string[];
}

export declare interface ServerOptions extends CommonServerOptions {
  hmr?: HmrOptions | boolean;
  watch?: WatchOptions;
  middlewareMode?: boolean | "html" | "ssr";
  base?: string;
  fs?: FileSystemServeOptions;
  origin?: string;
  preTransformRequests?: boolean;
  force?: boolean;
}

export declare interface CommonServerOptions {
  port?: number;
  host?: string | boolean;
  open?: boolean | string;
}

export declare interface InlineConfig extends UserConfig {
  configFile?: string | false;
  envFile?: false;
}

export declare interface DepOptimizationConfig {
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

export declare type DepOptimizationOptions = DepOptimizationConfig & {
  entries?: string | string[];
  force?: boolean;
};

export declare interface BuildOptions {
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
export declare type LibraryFormats = "es" | "cjs" | "umd" | "iife";

export declare interface LibraryOptions {
  entry: string;
  name?: string;
  formats?: LibraryFormats[];
  fileName?: string;
}

export interface WatcherOptions {
  buildDelay?: number;
  chokidar?: ChokidarOptions;
  clearScreen?: boolean;
  exclude?: string | RegExp | (string | RegExp)[];
  include?: string | RegExp | (string | RegExp)[];
  skipWrite?: boolean;
}

interface cssOptions {
  preprocessorOptions?: Record<string, any>;
}

export declare interface UserConfig {
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

export declare interface ConfigEnv {
  command: "build" | "serve";
  mode: string;
}

interface NodeModuleWithCompile extends NodeModule {
  _compile(code: string, filename: string): any;
}

export async function resolveConfig(
  inlineConfig: InlineConfig,
  command: "build" | "serve",
  defaultMode: "development" | "production" = "development"
) {
  let config = inlineConfig;
  let configFileDependencies: string[] = [];
  let mode = config.mode || defaultMode;
  if (mode === "production") {
    process.env.NODE_ENV = "production";
  }
  if (command === "serve" && process.env.NODE_ENV === "production") {
    process.env.NODE_ENV = "development";
  }
  const configEnv = {
    mode,
    command,
  };
  let { configFile } = config;
  if (configFile !== false) {
    //??????vite.config.xx??????
    const loadResult = await loadConfigFromFile(
      configEnv,
      configFile,
      config.root
    );
    // console.log("loadResult:", loadResult);
    if (loadResult) {
      config = mergeConfig(loadResult.config, config); //????????????config????????????config??????
      // console.log("config:", config);
      configFile = loadResult.path;
      configFileDependencies = loadResult.dependencies;
    }
  }
  mode = config.mode || mode;
  configEnv.mode = mode;
  const rawUserPlugins = (
    (await asyncFlatten(config.plugins || [])) as Plugin[]
  ).filter((p) => {
    if (!p) {
      return false;
    } else if (!p.apply) {
      return true;
    } else if (typeof p.apply === "function") {
      return p.apply({ ...config, mode }, configEnv);
    } else {
      return (p as Plugin).apply === command;
    }
  });

  //??????plugin ???enforce????????????????????????????????????????????????
  const [prePlugins, normalPlugins, postPlugins] =
    sortUserPlugins(rawUserPlugins);
  //?????????????????????
  const userPlugins = [...prePlugins, ...normalPlugins, ...postPlugins];

  //????????????????????????config??????  ???????????????????????????
  for (const p of userPlugins) {
    if (p.config) {
      const res = await p.config(config, configEnv);
      if (res) {
        config = mergeConfig(config, res);
      }
    }
  }

  //?????????????????????
  const resolvedRoot = normalizePath(
    config.root ? path.resolve(config.root) : process.cwd()
  );
  config.root = resolvedRoot;

  //???????????????????????????
  const pkgPath = lookupFile(resolvedRoot, [`package.json`], {
    pathOnly: true,
  });
  //?????????????????????
  const cacheDir = config.cacheDir
    ? path.resolve(resolvedRoot, config.cacheDir)
    : pkgPath
    ? path.join(path.dirname(pkgPath), `node_modules/.vite`) //?????????package.json?????????node_modules???
    : path.join(resolvedRoot, `.vite`); //???????????????????????????????????????
  //???????????????.vite?????? ??????
  if (!fs.existsSync(cacheDir)) {
    fs.promises.mkdir(cacheDir);
  }
  const resolvedBuildOptions = resolveBuildOptions(config.build || {}); //?????????build??????
  const { publicDir } = config;
  //????????????????????????????????????process.cwd()+public
  const resolvedPublicDir =
    publicDir !== false && publicDir !== ""
      ? path.resolve(
          resolvedRoot,
          typeof publicDir === "string" ? publicDir : "public"
        )
      : "";
  const optimizeDeps = config.optimizeDeps || {};
  //???????????????????????????????????????
  const createResolver = () => {
    let aliasContainer: PluginContainer;
    //resolve??????
    return async (id: string, importer?: string) => {
      let container;
      container =
        aliasContainer ||
        (aliasContainer = await createPluginContainer({
          ...resolved,
          plugins: [aliasPlugin(resolved)],
        }));

      return (await container.resolveId(id, importer))!.id;
    };
  };

  const isBuild = command === "build"; //???????????????
  const resolvedConfig = {
    configFile: configFile ? normalizePath(configFile) : undefined,
    configFileDependencies: (configFileDependencies as string[]).map((name) =>
      normalizePath(path.resolve(name))
    ),
    inlineConfig,
    root: resolvedRoot,
    publicDir: resolvedPublicDir,
    cacheDir,
    command,
    mode,
    createResolver,
    isWorker: false,
    mainConfig: null,
    plugins: [] as Plugin[],
    build: resolvedBuildOptions,
    packageCache: new Map(),
    optimizeDeps: {
      disabled: "build",
      ...optimizeDeps,
      esbuildOptions: {
        preserveSymlinks: config.resolve?.preserveSymlinks,
        ...optimizeDeps.esbuildOptions,
      },
    },
  };

  resolvedBuildOptions.outDir =
    resolvedBuildOptions.outDir === "dist"
      ? normalizePath(path.resolve(resolvedConfig.root, "dist"))
      : normalizePath(
          path.resolve(resolvedConfig.root, resolvedBuildOptions.outDir)
        );
  //?????????outDir
  resolvedBuildOptions.assetsDir =
    resolvedBuildOptions.assetsDir === "assets"
      ? normalizePath(path.resolve(resolvedBuildOptions.outDir, "assets"))
      : normalizePath(
          path.resolve(
            resolvedBuildOptions.outDir,
            resolvedBuildOptions.assetsDir
          )
        );

  const resolved = {
    ...resolvedConfig,
    ...config,
  };
  resolved.build = resolvedBuildOptions;

  //????????????????????????????????????
  const resolvedPlugins = resolvePlugins([
    preAliasPlugin(),
    aliasPlugin(resolved),
    ...(isBuild ? [] : [clientInjectPlugin()]),
    ...prePlugins,
    resolvePlugin(resolved),
    cssPlugin(resolved),
    transformPlugin(),
    ...(isBuild ? [BuildAssetPlugin(resolved)] : [assetPlugin()]),
    ...normalPlugins,
    ...postPlugins,
    ...(isBuild
      ? [buildImportAnalysisPlugin(resolved)]
      : [importAnalysisPlugin()]),
    ...(isBuild ? [buildGenerateHtmlPlugin(resolved)] : []),
    ...(isBuild ? [buildGeneratePlugin()] : []),
  ]);
  resolved.plugins = resolvedPlugins;
  const alias = resolved.resolve?.alias;
  //??????alias ?????????[{find,replacement}]
  const aliasArr: Alias[] = [];
  if (isArray(alias)) {
    aliasArr.push(...alias);
  } else if (isObject(alias)) {
    aliasArr.push(
      ...Object.entries(alias as Record<string, string>).map(
        ([key, value]) => ({ find: key, replacement: value })
      )
    );
  }
  //?????????resolved.resolve???????????????alias??????
  resolved.resolve && (resolved.resolve.alias = aliasArr);

  await Promise.all(userPlugins.map((p) => p.configResolved?.(resolved)));

  return resolved;
}

function resolveBuildOptions(raw: BuildOptions) {
  const resolved = {
    target: "modules",
    polyfillModulePreload: true,
    outDir: "dist",
    assetsDir: "assets",
    assetsInlineLimit: 4096,
    cssCodeSplit: !raw?.lib,
    cssTarget: false,
    sourcemap: false,
    rollupOptions: {},
    minify: raw?.ssr ? false : "esbuild",
    terserOptions: {},
    write: true,
    emptyOutDir: null,
    manifest: false,
    lib: false,
    ssr: false,
    ssrManifest: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 500,
    watch: null,
    ...raw,
  };
  if (resolved.target === "modules") {
    resolved.target = ESBUILD_MODULES_TARGET;
  } else if (resolved.target === "esnext" && resolved.minify === "terser") {
    resolved.target = "es2021";
  }
  if (!resolved.cssTarget) {
    resolved.cssTarget = resolved.target;
  }
  if (resolved.minify === "false") {
    resolved.minify = false;
  }
  if (resolved.minify === true) {
    resolved.minify = "esbuild";
  }
  return resolved;
}

//?????????????????????
function sortUserPlugins(plugins: Plugin[]) {
  const prePlugins: Plugin[] = [];
  const postPlugins: Plugin[] = [];
  const normalPlugins: Plugin[] = [];

  if (plugins) {
    plugins.forEach((p) => {
      if (p.enforce === "pre") {
        prePlugins.push(p);
      } else if (p.enforce === "post") {
        postPlugins.push(p);
      } else {
        normalPlugins.push(p);
      }
    });
  }
  return [prePlugins, postPlugins, normalPlugins];
}

//??????????????????
export function mergeConfig(
  defaults: Record<string, any>,
  overrides: Record<string, any>
) {
  const merged = { ...defaults }; //????????????????????????
  //???????????????????????????
  for (const key in overrides) {
    const val = overrides[key];
    //??????val???null??????????????????
    if (val === null || val === undefined) continue;
    const existing = merged[key];
    //??????defaults????????????key ???????????????override???????????????defaults???
    if (existing === null) {
      merged[key] = val;
      continue;
    }
    //????????????????????? ????????????
    if (isArray(existing) || isArray(val)) {
      merged[key] = [...transformArray(existing), ...transformArray(val)];
      continue;
    }

    //?????????????????? ??????????????????
    if (isObject(existing) && isObject(val)) {
      merged[key] = mergeConfig(existing, val);
      continue;
    }

    //??????????????????????????? ????????????
    merged[key] = val;
  }
  return merged;
}

export async function loadConfigFromFile(
  configEnv: ConfigEnv,
  configFile?: string,
  configRoot: string = process.cwd() //?????????process.cwd()
) {
  let resolvedPath: string | undefined;
  //??????vite.config.js????????????
  if (configFile) {
    resolvedPath = path.resolve(configFile);
  }
  //????????????????????????configFile????????????process.cwd()?????????mjs cjs mts cts js ts?????????config??????
  else {
    for (const filename of DEFAULT_CONFIG_FILES) {
      const filePath = path.resolve(configRoot, filename);
      if (!fs.existsSync(filePath)) continue;
      resolvedPath = filePath;
      break;
    }
  }

  if (!resolvedPath) {
    //????????????config??????
    console.log(chalk.red.bold("-> ????????????config??????!"));
    throw new Error();
  }

  //??????js ts ems cjs?????????config??????

  let isESM = false; //???????????????EMS??????
  //???mjs???????????????EMS??????
  if (/\.m[jt]s$/.test(resolvedPath)) {
    isESM = true;
  }
  //???cjs????????????CJS??????
  else if (/\.c[jt]s$/.test(resolvedPath)) {
    isESM = false;
  }
  //js ?????? ts????????? ????????????package.json???module?????????????????????
  else {
    try {
      const pkg = lookupFile(configRoot, ["package.json"]); //??????????????????package.json?????? ??????????????????
      isESM = !!pkg && JSON.parse(pkg).type === "module";
    } catch (e) {}
  }

  //??????config ????????????????????????????????????
  try {
    //?????????????????????js
    const bundled = await bundleConfigFile(resolvedPath, isESM);
    //??????????????????
    const userConfig = await loadConfigFromBundledFile(
      resolvedPath,
      bundled.code,
      isESM
    );
    if (!isObject(userConfig)) {
      throw new Error(`config must export or return an object.`);
    }
    return {
      path: normalizePath(resolvedPath),
      config: userConfig,
      dependencies: bundled.dependencies,
    };
  } catch (e) {
    throw e;
  }
}

async function bundleConfigFile(
  fileName: string,
  isESM: boolean
): Promise<{ code: string; dependencies: string[] }> {
  const dirnameVarName = "__vite_injected_original_dirname";
  const filenameVarName = "__vite_injected_original_filename";
  const importMetaUrlVarName = "__vite_injected_original_import_meta_url";
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: [fileName],
    outfile: "out.js",
    write: false, //??????????????? ????????????result?????????????????????????????????
    target: ["node14.18", "node16"], //????????????
    platform: "node", //????????????
    bundle: true,
    format: isESM ? "esm" : "cjs",
    sourcemap: "inline",
    metafile: true,
    define: {
      //??????????????????
      __dirname: dirnameVarName,
      __filename: filenameVarName,
      "import.meta.url": importMetaUrlVarName,
    },
    plugins: [
      {
        name: "externalize-deps", //??????????????????package??????
        setup(build) {
          build.onResolve({ filter: /.*/ }, ({ path: id, importer }) => {
            //???????????????.????????????????????? bare imports ??????????????????
            if (id[0] !== "." && !path.isAbsolute(id)) {
              return {
                external: true,
              };
            }
            const idFsPath = path.resolve(path.dirname(importer), id);
            const idPkgPath = lookupFile(idFsPath, [`package.json`], {
              pathOnly: true,
            });
            if (idPkgPath) {
              const idPkgDir = path.dirname(idPkgPath);
              if (path.relative(idPkgDir, fileName).startsWith("..")) {
                return {
                  path: isESM ? pathToFileURL(idFsPath).href : idFsPath,
                  external: true,
                };
              }
            }
          });
        },
      },
      {
        name: "inject-file-scope-variables", //??????package????????????__dirname?????????
        setup(build) {
          build.onLoad({ filter: /\.[cm]?[jt]s$/ }, async (args) => {
            const contents = await fs.promises.readFile(args.path, "utf8");
            const injectValues =
              `const ${dirnameVarName} = ${JSON.stringify(
                path.dirname(args.path)
              )};` +
              `const ${filenameVarName} = ${JSON.stringify(args.path)};` +
              `const ${importMetaUrlVarName} = ${JSON.stringify(
                pathToFileURL(args.path).href
              )};`;

            return {
              loader: args.path.endsWith("ts") ? "ts" : "js",
              contents: injectValues + contents,
            };
          });
        },
      },
    ],
  });
  const { text } = result.outputFiles[0];
  return {
    code: text,
    dependencies: result.metafile ? Object.keys(result.metafile.inputs) : [],
  };
}

async function loadConfigFromBundledFile(
  fileName: string,
  bundledCode: string,
  isESM: boolean
): Promise<UserConfig> {
  //?????????ESM?????? ?????????????????????????????????????????? ?????????import????????????
  if (isESM) {
    const fileBase = `${fileName}.timestamp-${Date.now()}`;
    const fileNameTmp = `${fileBase}.mjs`;
    const fileUrl = `${pathToFileURL(fileBase)}.mjs`;
    fs.writeFileSync(fileNameTmp, bundledCode); //????????????????????????
    try {
      return (await dynamicImport(fileUrl)).default; //??????????????????
    } finally {
      try {
        fs.unlinkSync(fileNameTmp); //????????????
      } catch {}
    }
  }
  //??????cjs?????? ????????????require.extensions['.js']??????
  else {
    const extension = path.extname(fileName); //???????????????
    const realFileName = fs.realpathSync(fileName);
    const loaderExt = extension in require.extensions ? extension : ".js";
    const defaultLoader = require.extensions[loaderExt]!; //???????????????require??????
    //node????????????module._compile?????? ????????????????????????require
    require.extensions[loaderExt] = (module: NodeModule, filename: string) => {
      if (filename === realFileName) {
        (module as NodeModuleWithCompile)._compile(bundledCode, filename);
      } else {
        defaultLoader(module, filename);
      }
    };
    //????????????
    delete require.cache[require.resolve(fileName)];
    const raw = require(fileName); //??????????????????????????????require??????
    require.extensions[loaderExt] = defaultLoader; //???????????????loader
    return raw.__esModule ? raw.default : raw; //????????????????????????
  }
}
