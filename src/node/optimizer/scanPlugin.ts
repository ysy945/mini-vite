import path, { isAbsolute } from "path";
import fs from "fs";
import { parse } from "es-module-lexer";
import { Plugin } from "esbuild";
import { ResolvedConfig } from "../config";
import {
  BARE_IMPORT_RE,
  EXTERNAL_TYPES,
  htmlTypesRE,
  scriptModuleRE,
  scriptRE,
  srcRE,
  typeRE,
} from "../constants";
import { error, flattenId, getPkgModulePath } from "../utils";

//获取第三方包的依赖(esbuild预构建需要的依赖)
export function scanPlugin(
  deps: Record<string, string>, //构建依赖{'react/jsx-runtime':'实际入口路径'}
  flatIdToImports: Record<string, string>, //映射表{'react_jsx-runtime':'实际入口路径'}扁平化路径
  config: ResolvedConfig
): Plugin {
  return {
    name: "esbuild:scan-bare-imports-deps",
    setup(build) {
      //处理html vue文件
      build.onResolve({ filter: htmlTypesRE }, (info) => {
        //创建namespace
        return {
          path: info.path,
          namespace: "html",
        };
      });

      build.onLoad({ filter: htmlTypesRE, namespace: "html" }, async (info) => {
        let htmlPath: string = "";
        //传入的文件路径
        if (fs.existsSync(info.path)) {
          htmlPath = info.path;
        } else {
          htmlPath = path.resolve(config.root, info.path);
        }

        //经过处理后还是无法找到报错
        if (!fs.existsSync(htmlPath)) {
          error(`pluginError: 插件[scanPlugin]不能在根目录找到"${htmlPath}"`);
        }

        let contents = "";

        //找到正确的html文件 读取文件
        const htmlContent = await fs.promises.readFile(htmlPath, "utf-8");
        //解析html文件 读取<script type="module" src="/src/main.tsx">
        //如果是没有src的      <script type="module">{拿到这里的信息}</script>
        //如果是没有type="module"的 不做解析
        //只需要解析一层即可

        let match: RegExpExecArray | null;
        const isHtml = info.path.endsWith(".html"); //如果是html文件需要解析含有module属性的script
        const isVue = info.path.endsWith(".vue");
        const regex = isHtml ? scriptModuleRE : scriptRE;
        //处理html文件的解析
        if (isHtml) {
          while ((match = regex.exec(htmlContent))) {
            const [, openTag, content] = match;
            //还需要根据<script src="/main.js" type="module">拿到type和src
            const typeMatch = openTag.match(typeRE);
            const type =
              typeMatch && (typeMatch[1] || typeMatch[2] || typeMatch[3]);
            //如果type不是module就不做处理
            if (type !== "module") {
              continue;
            }
            //是module继续看是否有src属性
            const srcMatch = openTag.match(srcRE);
            //如果有src属性 转换为import语句添加到contents中
            const src = srcMatch && (srcMatch[1] || srcMatch[2] || srcMatch[3]);
            if (src) {
              if (src.startsWith("/")) {
                contents += `import ${JSON.stringify("." + src)}\n`;
              } else {
                contents += `import ${JSON.stringify(src)}\n`;
              }
            }
            //不存在src 分析content内容
            else {
              const [imports] = parse(content);
              for (const info of imports) {
                const { ss: variableStart, se: variableEnd } = info;
                //获取import语句 放入contents中
                contents += `${content.slice(variableStart, variableEnd)}\n`;
              }
            }
          }
        }
        //TODO 解析vue文件(vue文件可以在引vue 持续解析)
        if (isVue) {
        }
        return {
          loader: "js",
          contents,
          resolveDir: config.root,
        };
      });

      //将路径后缀名为jpg png css sass 等拦截
      build.onResolve(
        { filter: new RegExp(`\\.(${EXTERNAL_TYPES.join("|")})$`) },
        (info) => {
          return {
            path: info.path, //拦截的路径
            external: true, //是否不打包当前文件
          };
        }
      );

      //拦截第三方包
      build.onResolve({ filter: BARE_IMPORT_RE }, async (info) => {
        let external = false;
        //如果配置了exclude 需要强制排除
        if (config.optimizeDeps.exclude) {
          external = config.optimizeDeps.exclude.includes(info.path)
            ? true
            : false;
        }
        //false 表示不需要排除
        if (!external && !(await shouldExternal(config, info.path))) {
          const root = config.root;
          //重根目录寻找第三方包路径路径
          if (
            !deps[info.path] && //只有在不存在的时候才进行解析
            fs.existsSync(path.resolve(root, "node_modules"))
          ) {
            const normalizedRoot = getPkgModulePath(info.path, config.root);
            if (normalizedRoot) {
              deps[info.path] = normalizedRoot;
              flatIdToImports[flattenId(info.path)] = normalizedRoot;
            }
          }
        }
        //esbuild读取到jsx tsx文件自动打包react/jsx-runtime 需要添加react到依赖当中
        if (info.path === "react/jsx-runtime") {
          const normalizedRoot = getPkgModulePath("react", config.root);
          if (normalizedRoot) {
            deps["react"] = normalizedRoot;
            flatIdToImports["react"] = normalizedRoot;
          }
        }
        return {
          path: info.path,
          external: true,
        };
      });
    },
  };
}

async function shouldExternal(config: ResolvedConfig, path: string) {
  //1.用户可能定义了虚拟模块 "virtual:vite-module"
  if (path.startsWith("virtual")) {
    return true;
  }
  //2.用户可能配置了alias需要进行匹配
  const alias = config.resolve?.alias;
  if (alias) {
    const resolver = config.createResolver();
    const resolverId = await resolver(path); //获得解析后的路径
    //表示匹配alias 不需要被打包
    if (resolverId !== path) {
      return {
        path: path,
        external: true,
      };
    }
  }
  return false;
}
