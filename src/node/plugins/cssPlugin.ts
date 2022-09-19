import path from "path";
import { InlineConfig, ResolvedConfig } from "../config";
import { Plugin } from "../plugin";
import { ViteDevServer } from "../server";
import {
  error,
  isCssRequest,
  getPkgModulePath,
  getRelativeRootPath,
} from "../utils";

type Styles = "scss" | "sass" | "less" | "css";

export default function cssPlugin(resolvedConfig: ResolvedConfig): Plugin {
  let serverContext: ViteDevServer;
  return {
    name: "mini-vite:css",
    configureServer(s) {
      serverContext = s;
    },
    async transform(code, id) {
      const config = serverContext ? serverContext.config : resolvedConfig;
      //如果是.css .less .sass .scss结尾
      if (isCssRequest(id)) {
        try {
          const lang: Styles = path.extname(id).slice(1) as Styles; //获取当前文件类型
          const preProcessor = preProcessors[lang]; //选择解析的处理器
          const preprocessorOptions = config.css?.preprocessorOptions || {};
          let opts = (preprocessorOptions && preprocessorOptions[lang]) || {};
          switch (lang) {
            case "scss":
            case "sass":
              opts = {
                includePaths: ["node_modules"],
                alias: config?.resolve?.alias,
                ...opts,
              };
              break;
            case "less":
              opts = {
                paths: ["node_modules"],
                alias: config?.resolve?.alias,
                ...opts,
              };
          }
          //获取转译后的css代码
          const { css: cssCode } = (await preProcessor(
            code,
            "." + lang,
            config.root,
            opts
          )) as {
            css: string;
          };
          //将css 转换为 JS文件
          const relativeId = getRelativeRootPath(id, config.root);
          const isBuild = config.command === "build"; //如果是打包模式就不需要注入热更新等代码

          let cssCodeInJs = "";
          if (isBuild) {
            cssCodeInJs = `
            const css = ${JSON.stringify(cssCode.replace(/\n/g, ""))}
            style = document.createElement("style");
            style.setAttribute("type", "text/css");
            style.innerHTML = css;
            document.head.append(style);
            `;
          } else {
            cssCodeInJs = `
            const id = "${relativeId}"
            const css = ${JSON.stringify(cssCode.replace(/\n/g, ""))}
            updateStyle(id,css)
            import.meta.hot.accept((modules)=>{
              updateStyle(id,modules[0].default)
            })
            import.meta.hot.prune(()=>removeStyle(id))
            export default css
          `;
          }

          return {
            code: cssCodeInJs,
          };
        } catch (err) {
          error(`pluginError: 插件[cssPlugin]错误,${err}`);
        }
      }
    },
  };
}

function isPreProcessor(lang: Styles) {
  return lang && lang in preProcessors;
}

async function less(
  code: string,
  id: string,
  root: string,
  opts: Record<string, any>
) {
  try {
    //只能通过绝对路径引入需要添加file协议头
    const module = await import("file://" + getPkgModulePath("less", root));
    const less = module.default ? module.default : module;
    return await less.render(code, opts);
  } catch (err) {
    error(
      `pluginError: 插件[cssPlugin]正在解析${id}文件 但没有解析到依赖 请安装less编译器npm i less -D`
    );
  }
  return { css: code };
}

async function sass(
  code: string,
  id: string,
  root: string,
  opts: Record<string, any>
) {
  try {
    const module = await import(
      "file://" + path.resolve(getPkgModulePath("sass", root))
    );
    const sass = module.default ? module.default : module;
    return await sass.compileStringAsync(code, opts);
  } catch (err) {
    error(
      `pluginError: 插件[cssPlugin]正在解析${id}文件 但没有解析到依赖 请安装sass编译器npm i sass -D`
    );
  }
  return { css: code };
}

const preProcessors = Object.freeze({
  ["less" /* less */]: less,
  ["sass" /* sass */]: sass,
  ["scss" /* scss */]: sass,
  //不用解析
  ["css" /*css*/]: (code: string) => ({
    css: code,
  }),
});
