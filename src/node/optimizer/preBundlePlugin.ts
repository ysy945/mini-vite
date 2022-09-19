import path, { normalize } from "path";
import fs from "fs";
import { Plugin, Loader } from "esbuild";
import { init, parse } from "es-module-lexer";
import { BARE_IMPORT_RE } from "../constants";
import { ResolvedConfig } from "../config";

export default function preBundlePlugin(
  deps: Record<string, string>,
  flatIdToImports: Record<string, string>,
  config: ResolvedConfig
): Plugin {
  return {
    name: "esbuild:pre-bundle",
    setup(build) {
      build.onResolve(
        {
          filter: BARE_IMPORT_RE,
        },
        (info) => {
          let { path: id, importer } = info;
          const isEntry = !importer; //importer是引用当前路径的文件路径 不存在importer则说明是入口模块
          //当前模块需要进行预构建
          if (flatIdToImports[id]) {
            return isEntry //如果是入口模块添加命名空间
              ? {
                  path: id,
                  namespace: "pre-bundle-dep",
                }
              : {
                  path: flatIdToImports[id], //非入口模块 转成绝对路径 便于后续调用
                };
          }
        }
      );

      //这里的需要变为虚拟模块进行加载 直接进行打包出来的路径会有层级嵌套(扁平化预构建产物输出)
      //1.将react/jsx-dev-runtime修改为react_jsx-dev-runtime
      //2.虚拟模块代替真实模块
      //必须要虚拟模块 产物路径是根据entries 如果是react/jsx-runtime那么产物就是
      //-react
      //  -jsx-runtime.js
      //-react.js
      //-react-dom.js
      //所以需要将react/jsx-dev-runtime修改为react_jsx-dev-runtime在放入到entries中
      //但是这样会导致esbuild找不到包文件 所以需要拦截 我们手动寻找到包入口文件 进行依赖扫描 然后导出
      //其次因为使用了虚拟模块所以会导致虚拟模块解析了'react'这个包 在其他模块中又通过require('react')引入了包
      //那么就会同时打包两份相同的文件出来
      build.onLoad(
        { filter: /.*/, namespace: "pre-bundle-dep" },
        async (info) => {
          await init;
          const resolveDir = config.root; //虚拟模块的根目录
          const filePath = flatIdToImports[info.path]; //获取入口文件的路径
          const code = await fs.promises.readFile(filePath, "utf-8"); //读取入口模块的内容
          const [imports, exports] = await parse(code); //解析入口文件的import和exports语法
          const contents: string[] = []; //最终虚拟模块的返回值

          //如果没有import export 语句 commonjs规范直接require即可
          if (!imports.length && !exports.length) {
            const res = require(filePath); //读取模块{}
            const keys = Object.keys(res); //获取模块的名称
            //导出需要暴露的模块
            if (!keys.includes("default")) {
              contents.push(`export default require("${filePath}")`);
            }
            contents.push(`export {${keys.join(",")}} from "${filePath}"`);
          }
          //如果有import export语句表示是ejs模块
          else {
            contents.push(
              `import a from "${filePath}"`,
              `export default a`,
              `export * from "${filePath}"`
            );
          }

          return {
            loader: path.extname(filePath).slice(1) as Loader, //取得后缀名称 作为loader
            resolveDir, //虚拟模块的dir路径
            contents: contents.join("\r\n"), //虚拟模块的内容
          };
        }
      );
    },
  };
}
