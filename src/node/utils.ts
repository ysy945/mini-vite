import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import chalk from "chalk";
import { ResolvedConfig, WatchOptions } from "./config";
import { Plugin } from "./plugin";
import { CLIENT_PATH } from "./constants";
import { ChokidarOptions } from "rollup";

//判断文件是否存在且是否是一个文件 返回文件内容
export declare interface LookupFileOptions {
  pathOnly?: boolean;
}

export function lookupFile(
  dir: string,
  formats: string[],
  options?: LookupFileOptions
): string | undefined {
  for (const format of formats) {
    const fullPath = path.resolve(dir, format);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      if (!options?.pathOnly) {
        return fs.readFileSync(fullPath, "utf-8");
      } else {
        return fullPath;
      }
    }
  }
}

//是否是对象
export function isObject(value: unknown): value is Record<string, any> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function isArray(value: unknown): value is any[] {
  return Array.isArray(value);
}

export const isWindows = os.platform() === "win32"; //判断当前是否是windows系统

export function slash(p: string): string {
  return p.replace(/\\/g, "/"); //将\替换成/
}

export function normalizePath(id: string): string {
  return path.posix.normalize(isWindows ? slash(id) : id);
}

export function transformArray<T>(array: T) {
  return isArray(array) ? array : [array];
}

export async function asyncFlatten<T>(arr: T[]): Promise<T[]> {
  do {
    arr = (await Promise.all(arr)).flat(Infinity) as any;
  } while (arr.some((v: any) => v?.then));
  return arr;
}

export function sortUserPlugins() {}

export const dynamicImport = new Function("file", "return import(file)");

export const flattenId = (id: string) =>
  id
    .replace(/[\/:]/g, "_")
    .replace(/[\.]/g, "__")
    .replace(/(\s*>\s*)/g, "___");

export function forEach<T>(
  arr: Array<T>,
  fn: (value: T, index: number, arr: Array<T>) => any
) {
  for (let i = 0; i < arr.length; i++) {
    try {
      if (fn(arr[i], i, [...arr]) === "forEach_stop") {
        break;
      }
    } catch (e) {
      console.error(`forEach: 第${i}次调用出错. 错误信息:${e}`);
    }
  }
}

//通过合并package-lock.json和config文件得到hash值
const lockfileFormats = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
export function getDepHash(config: ResolvedConfig) {
  let content = lookupFile(config.root, lockfileFormats) || "";
  const optimizeDeps = config.optimizeDeps;
  content += JSON.stringify(
    {
      mode: process.env.NODE_ENV || config.mode,
      root: config.root,
      resolve: config.resolve,
      buildTarget: config.build?.target,
      plugins: (config.plugins as Plugin[]).map((p) => p.name),
      optimizeDeps: {
        include: optimizeDeps?.include,
        exclude: optimizeDeps?.exclude,
        esbuildOptions: {
          ...optimizeDeps?.esbuildOptions,
          plugins: optimizeDeps?.esbuildOptions?.plugins?.map((p) => p.name),
        },
      },
    },
    (_, value) => {
      if (typeof value === "function" || value instanceof RegExp) {
        return value.toString();
      }
      return value;
    }
  );
  return getHash(content);
}

export function getHash(content: string) {
  return crypto
    .createHash("sha256")
    .update(content)
    .digest("hex")
    .substring(0, 8);
}

export function getBrowserHash(
  hash: string,
  deps: Record<string, string>,
  timestamp: string = ""
) {
  return getHash(hash + JSON.stringify(deps) + timestamp);
}

/**
 *
 * @param dir 文件夹路径
 * @param skip 不需要移除的文件路径数组
 */
export function emptyDir(dir: string, skip: string[] = []) {
  for (const file of fs.readdirSync(dir)) {
    if (skip?.includes(file)) {
      continue;
    }
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true });
  }
}

export function copyDir(srcDir: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file);
    if (srcFile === destDir) {
      continue;
    }
    const destFile = path.resolve(destDir, file);
    const stat = fs.statSync(srcFile);
    if (stat.isDirectory()) {
      copyDir(srcFile, destFile);
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  }
}

export function resolveChokidarOptions(
  options: WatchOptions | ChokidarOptions
) {
  const { ignored = [], ...otherOptions } = options ?? {};
  const resolvedWatchOptions = {
    ignored: [
      "**/.git/**",
      "**/node_modules/**",
      "**/test-results/**",
      ...(isArray(ignored) ? ignored : [ignored]),
    ],
    ignoreInitial: true,
    ignorePermissionErrors: true,
    ...otherOptions,
  };
  return resolvedWatchOptions;
}

export interface ErrorOpts {
  beforeStr?: string;
  afterStr?: string;
}

export function error(err: string, opts?: ErrorOpts) {
  let str = "";

  const { beforeStr, afterStr } = opts || {};
  if (beforeStr) {
    str += beforeStr;
  }
  str += `❌ ${chalk.red.bold(err)}`;
  if (afterStr) {
    str += afterStr;
  }
  console.log(str);
}

//返回第三方包的路径
export function getPkgModulePath(moduleName: string, root: string) {
  //处理react/jsx-runtime
  if (moduleName.includes("/")) {
    let ext = "";
    const resolvedRoot = path.resolve(root, "node_modules", moduleName);
    //如果不是.js或则.ts结尾需要添加
    if (!resolvedRoot.endsWith(".ts") && !resolvedRoot.endsWith(".js")) {
      if (fs.existsSync(resolvedRoot + ".js")) {
        ext = ".js";
      } else if (fs.existsSync(resolvedRoot + ".ts")) {
        ext = ".ts";
      }
    }
    const normalizedRoot = normalizePath(resolvedRoot + ext); //后续做虚拟模块的时候 使用\\这个斜杠会报错改成/
    return normalizedRoot;
  }
  //处理react vue情况
  const pkg = lookupFile(root, [`./node_modules/${moduleName}/package.json`]);
  if (pkg) {
    const json = JSON.parse(pkg);
    const main = json.main.endsWith(".js") ? json.main : json.main + ".js";
    const packageRoot = main ? main : "index.js";
    const resolvedRoot = path.resolve(
      root,
      "node_modules",
      moduleName,
      packageRoot
    );
    const normalizedRoot = normalizePath(resolvedRoot);
    return normalizedRoot;
  } else {
    throw new Error(chalk.red.bold(`❌: can not find module ${moduleName}`));
  }
}

export const cssLangs = `\\.(css|less|sass|scss)($|\\?)`;
export const cssLangRE = new RegExp(cssLangs);

export const isCssRequest = (path: string) => cssLangRE.test(path);

export const isImportRequest = (url: string) => url.endsWith("?import");

//判断当前alias是否需要替换
export function matches(pattern: string | RegExp, importee: string) {
  if (pattern instanceof RegExp) {
    return pattern.test(importee);
  }
  if (importee.length < pattern.length) {
    return false;
  }
  if (importee === pattern) {
    return true;
  }
  return importee.startsWith(pattern + "/");
}

export function isVirtual(str: string) {
  return str.startsWith("/virtual");
}

export function isClient(str: string) {
  return str === CLIENT_PATH;
}

export function getShortName(file: string, root: string) {
  return file.startsWith(root + "/") ? path.posix.relative(root, file) : file;
}

export interface AcceptedUrl {
  url: string;
  start: number;
  end: number;
}

export function lexAcceptedHmrDeps(
  code: string,
  start: number,
  urls: Set<AcceptedUrl>
) {
  let state = 0; /* inCall */
  // the state can only be 2 levels deep so no need for a stack
  let prevState = 0; /* inCall */
  let currentDep = "";
  function addDep(index: number) {
    urls.add({
      url: currentDep,
      start: index - currentDep.length - 1,
      end: index + 1,
    });
    currentDep = "";
  }
  for (let i = start; i < code.length; i++) {
    const char = code.charAt(i);
    switch (state) {
      case 0 /* inCall */:
      case 4 /* inArray */:
        if (char === `'`) {
          prevState = state;
          state = 1 /* inSingleQuoteString */;
        } else if (char === `"`) {
          prevState = state;
          state = 2 /* inDoubleQuoteString */;
        } else if (char === "`") {
          prevState = state;
          state = 3 /* inTemplateString */;
        } else if (/\s/.test(char)) {
          continue;
        } else {
          if (state === 0 /* inCall */) {
            if (char === `[`) {
              state = 4 /* inArray */;
            } else {
              return true;
            }
          } else if (state === 4 /* inArray */) {
            if (char === `]`) {
              return false;
            } else if (char === ",") {
              continue;
            } else {
              error$1();
            }
          }
        }
        break;
      case 1 /* inSingleQuoteString */:
        if (char === `'`) {
          addDep(i);
          if (prevState === 0 /* inCall */) {
            return false;
          } else {
            state = prevState;
          }
        } else {
          currentDep += char;
        }
        break;
      case 2 /* inDoubleQuoteString */:
        if (char === `"`) {
          addDep(i);
          if (prevState === 0 /* inCall */) {
            return false;
          } else {
            state = prevState;
          }
        } else {
          currentDep += char;
        }
        break;
      case 3 /* inTemplateString */:
        if (char === "`") {
          addDep(i);
          if (prevState === 0 /* inCall */) {
            return false;
          } else {
            state = prevState;
          }
        } else if (char === "$" && code.charAt(i + 1) === "{") {
          error$1();
        } else {
          currentDep += char;
        }
        break;
      default:
        throw new Error("unknown import.meta.hot lexer state");
    }
  }
  return false;
}

function error$1() {
  const err = new Error(
    `import.meta.hot.accept() can only accept string literals or an ` +
      `Array of string literals.`
  );
  throw err;
}

export function getRelativeRootPath(url: string, rootUrl: string) {
  return "/" + normalizePath(path.relative(rootUrl, url));
}

export function getQuery(url: string) {
  const returnQuery: Record<string, string | number> = {};
  //["http://xxx/","import&t=1564651"]
  const [, queries] = url.split("?"); //分割url和query参数
  const query = queries.split("&"); //获取每一组query的值
  //import t=1564651
  query.forEach((val) => {
    //如果不包含=表示值为undefined
    if (!val.includes("=")) {
      returnQuery[val] = "";
    } else {
      const [key, value] = val.split("=");
      returnQuery[key] = value;
    }
  });
  return returnQuery;
}

//判断当前系统是不是苹果系统
export function isOs() {
  return process.platform === "darwin";
}

export function osPath(path: string) {
  if (isOs()) {
    return path;
  }
  return path.slice(2);
}
