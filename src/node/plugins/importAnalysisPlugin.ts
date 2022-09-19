import path from "path";
import { parse, init } from "es-module-lexer";
import MagicString from "magic-string";
import { JS_TYPES_RE } from "../constants";
import { Plugin } from "../plugin";
import { ViteDevServer } from "../server";
import {
  AcceptedUrl,
  getRelativeRootPath,
  isCssRequest,
  lexAcceptedHmrDeps,
  normalizePath,
  osPath,
} from "../utils";
import { handlePrunedModules } from "../hmr";

//进行语法分析的插件
//1.主要将bare imports的请求转化到.vite(预构建目录下)
//TODO vite3.0中这里会再次分析语法 找寻是否有的依赖需要打包 如果有需要添加依赖在进行预构建打包
//TODO 例如在transform插件中return `import axios from "axios"`+code
//TODO 那么就动态的添加了需要构建的第三方包 预构建需要在页面加载的最后阶段进行
// /src/index.ts => absolutePath => load() => transform()/*动态添加第三方包*/
// => 最后进行importAnalysis再次分析找到新添加的依赖 => 对新增的第三方包进行esbuild打包放入.vite中
// => 重写metadata.json文件 => 最终服务器在返回转译后的文件
export default function importAnalysisPlugin(): Plugin {
  let serverContext: ViteDevServer;
  return {
    name: "mini-vite:import-analysis",
    configureServer(s) {
      serverContext = s;
    },
    //只处理js ts tsx jsx文件 .vue文件需要自己写插件
    async transform(code, id) {
      const { moduleGraph, config } = serverContext;
      const mod = moduleGraph.getModuleById(id);
      const importedModules = new Set<string>(); //存放依赖路径的集合
      if (JS_TYPES_RE.test(id) || isCssRequest(id)) {
        let isSelfAccepting = false;
        const magicString = new MagicString(code);
        const normalizedAcceptedUrls = new Set<string>();
        const acceptedUrls = new Set<AcceptedUrl>();
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
              importedModules.add("/" + importPath);
              continue;
            }
            const resolved = await this.resolve(importPath, id);

            //如果子模块引入了a文件 删除保存 在引入a文件 对于热更新来说
            //需要向a文件的末尾添加 ?t=timestamp 上次更新的时间戳
            //如果之前没有引入过b文件 也就是首次创建的 那么就不需要添加时间戳
            //所以这里需要通过分析的子路径判断当前构建的文件是否已经在moduleGraph中
            //如果存在过 则是重新在引入 需要添加时间戳 否则就不需要添加
            //自动添加依赖到moduleGraph中

            let normalizePathResolvedId = osPath(normalizePath(resolved!.id));

            const childMod = moduleGraph.getModuleById(normalizePathResolvedId);
            if (childMod && childMod.lastHMRTimestamp > 0) {
              normalizePathResolvedId =
                normalizePathResolvedId + `?t=${childMod?.lastHMRTimestamp}`;
            }
            //获取相对于根目录的文件路径 "react" => "/node_modules/.vite/react.js"
            const importedModule = getRelativeRootPath(
              resolved!.id,
              config.root
            );
            importedModules.add(importedModule); //添加依赖路径

            // console.log("resolved: ", resolved);
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
                if (code.slice(end + 4, end + 11) === ".accept") {
                  //分析的import.meta.hot.accept中 有一个是接受自我更新则isSelfAccepting = true;
                  if (
                    lexAcceptedHmrDeps(
                      code,
                      code.indexOf("(", end + 11) + 1,
                      acceptedUrls
                    )
                  ) {
                    isSelfAccepting = true;
                  }
                }
              }
            }

            //"./render.ts" => "/main/render.ts"
            for (const { url, start, end } of acceptedUrls) {
              let normalized: string = "";

              //绝对路径"/src/render.ts"
              if (path.isAbsolute(url)) {
                normalized = url;
              }
              //相对路径 "./render.ts"
              else {
                const dirname = path.dirname(id); //获取当前父路径的工作目录
                const absoluteUrl = path.resolve(dirname, url); // /xxx/xxx/src/render.ts
                // "/src/render.ts"
                normalized = getRelativeRootPath(absoluteUrl, config.root);
              }
              normalizedAcceptedUrls.add(normalized);
              magicString.overwrite(start, end, JSON.stringify(normalized), {
                contentOnly: true,
              });
            }
          }
        }

        const prunedImports = await moduleGraph.updateModuleInfo(
          mod!,
          importedModules,
          null,
          normalizedAcceptedUrls,
          null,
          isSelfAccepting
        );
        if (prunedImports) {
          handlePrunedModules(prunedImports, serverContext);
        }

        //给非第三方模块注入import.meta.hot代码
        if (!id.includes("node_modules/.vite")) {
          //获取相对于根目录的路径
          const currentModulePath = getRelativeRootPath(id, config.root);
          if (isCssRequest(id)) {
            magicString.prepend(
              `import {updateStyle,removeStyle} from "/@vite/client"`
            );
          }
          magicString.prepend(
            `import {createHotContext as __mini_vite__createHotContext} from "/@vite/client";\r\nimport.meta.hot = __mini_vite__createHotContext(${JSON.stringify(
              currentModulePath
            )});\r\n` //"virtual:@vite/client"
          );
        }
        return {
          code: magicString.toString(),
          map: magicString.generateMap(),
        };
      }
    },
  };
}
