import { transform } from "esbuild";
import fs from "fs";
import path from "path";
import { JS_TYPES_RE } from "../constants";
import { Plugin } from "../plugin";
import { isJSRequest } from "../server/middlewares";
import { error, isCssRequest, isVirtual } from "../utils";

//转译源代码的ts tsx jsx js文件
export default function transformPlugin(): Plugin {
  return {
    name: "mini-vite:esbuild-transform", //使用esbuild自带的转译工具transform转移jsx tsx ts文件
    async load(id) {
      //不处理虚拟模块
      if (isVirtual(id)) {
        return undefined;
      }

      //只读取css类 js类文件 静态文件不能读取
      if (isJSRequest(id) || isCssRequest(id)) {
        try {
          const code = await fs.promises.readFile(id, "utf-8");
          return code;
        } catch (err) {
          error(`pluginError: 插件[transformPlugin]读取"${id}"文件失败 ${err}`);
        }
      }
    },
    async transform(code, id) {
      //后缀是js ts jsx tsx mjs才进行转译.vue不能转译 需要单独开发插件 虚拟模块也需要转译
      if (JS_TYPES_RE.test(id) || isVirtual(id)) {
        let loader: string = "";
        //可以通过给虚拟模块开头添加/*js|ts|tsx|jsx*/告诉vite当前模块的类型便于编译
        if (isVirtual(id)) {
          //如果虚拟模块没有指定loader 则使用js
          loader = getLoader(code) || "js";
        } else {
          loader = path.extname(id).slice(1); //获取后缀名
        }

        //使用esbuild自带的transform工具转译
        const { code: transformCode, map } = await transform(code, {
          format: "esm",
          loader: loader as "js" | "ts" | "jsx" | "tsx",
          sourcemap: true,
        });
        return {
          code: transformCode,
          map,
        };
      }
    },
  };
}

function getLoader(code: string) {
  let loader = "";
  code = code.trim();
  if (code.startsWith("/*")) {
    let i = 0;
    let isStart = false;
    while (++i && i < code.length) {
      //   console.log(code[i - 1] + code[i]);
      if (code[i - 1] + code[i] === "/*") {
        isStart = true;
        continue;
      }
      if (isStart === true) {
        loader += code[i];
        if (code[i + 1] + code[i + 2] === "*/") {
          break;
        }
      }
    }
  } else return undefined;
  return loader;
}
