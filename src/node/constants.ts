export const DEFAULT_CONFIG_FILES = [
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.ts",
  "vite.config.cjs",
  "vite.config.mts",
  "vite.config.cts",
];

export const ESBUILD_MODULES_TARGET = [
  "es2020",
  "edge88",
  "firefox78",
  "chrome87",
  "safari13",
];

//不需要进行打包的拓展名
export const EXTERNAL_TYPES = [
  "css",
  "sass",
  "scss",
  "less",
  "jpg",
  "png",
  "svg",
  "gif",
  "ico",
];

export const ASSET_TYPES = [".jpg", ".png", ".svg", ".gif", ".ico"];

//默认搜索的拓展名
export const DEFAULT_EXTENSIONS = [
  ".mjs",
  ".js",
  ".mts",
  ".ts",
  ".jsx",
  ".tsx",
  ".json",
  ".vue",
];

export const BARE_IMPORT_RE = /^[\w@][^:]/;
export const queryRE = /\?.*$/s;
export const hashRE = /#.*$/s;
export const JS_TYPES_RE = /\.(?:j|t)sx?$|\.mjs$/;
export const knownJsSrcRE = /\.((j|t)sx?|m[jt]s|vue|marko|svelte|astro)($|\?)/;
export const htmlTypesRE = /\.(html|vue)$/;
export const scriptModuleRE =
  /(<script\b[^>]*type\s*=\s*(?:"module"|'module')[^>]*>)(.*?)<\/script>/gims;
export const scriptRE = /(<script\b(?:\s[^>]*>|>))(.*?)<\/script>/gims;
export const srcRE = /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s'">]+))/im;
export const typeRE = /\btype\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s'">]+))/im;
export const langRE = /\blang\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s'">]+))/im;
export const contextRE =
  /\bcontext\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s'">]+))/im;
export const HMR_PORT = 24678;

export const CLIENT_PATH = "/@vite/client";
