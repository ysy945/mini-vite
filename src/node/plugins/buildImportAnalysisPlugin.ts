import { parse, init } from "es-module-lexer";
import MagicString from "magic-string";
import { JS_TYPES_RE } from "../constants";
import { Plugin } from "../plugin";

import { isCssRequest, normalizePath, osPath } from "../utils";

import { ResolvedConfig } from "../config";

export default function buildImportAnalysisPlugin(
  resolveConfig: ResolvedConfig
): Plugin {
  return {
    name: "mini-vite:build-import-analysis",
    //只处理js ts tsx jsx文件 .vue文件需要自己写插件
    async transform(code, id) {
      const config = resolveConfig;
      if (JS_TYPES_RE.test(id) || isCssRequest(id)) {
        const magicString = new MagicString(code);
        await init;
        //使用es-module-lexer分析代码 不需要分析exports
        const [imports] = parse(code);
        for (const importInfo of imports) {
          const { s: start, e: end, n: importPath, ss, se } = importInfo;
          //如果存在则是普通的import语句
          if (importPath) {
            //如果是虚拟模块 就不走resolved 转化为/virtual
            if (importPath.startsWith("virtual")) {
              magicString.overwrite(
                start,
                end,
                normalizePath("/" + importPath)
              );
              continue;
            }
            const resolved = await this.resolve(importPath, id);
            let normalizePathResolvedId = osPath(normalizePath(resolved!.id));
            if (resolved) {
              magicString.overwrite(start, end, normalizePathResolvedId);
            }
          }
          //如果是undefined表示import.meta.hot.accept()
          else if (importPath === undefined) {
            const rawUrl = code.slice(ss, se);
            // check import.meta usage
            if (rawUrl === "import.meta") {
              const prop = code.slice(se, se + 4);
              if (prop === ".hot") {
                magicString.overwrite(ss, se + 4, "false");
              }
            }
          }
        }
        return {
          code: magicString.toString(),
          map: magicString.generateMap(),
        };
      }
    },
  };
}
