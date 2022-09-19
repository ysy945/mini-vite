import path from "path";
import fs from "fs";
import { Plugin } from "../plugin";
import { ViteDevServer } from "../server";
import { error, flattenId, isOs, normalizePath, osPath } from "../utils";
import { BARE_IMPORT_RE, DEFAULT_EXTENSIONS } from "../constants";
import { ResolvedConfig } from "../config";

//将请求的文件转接到真实文件系统当中
//例如/src/main.js => E://xxx/xxx/xxx/src/main.js便于load钩子的执行
export default function resolvePlugin(resolvedConfig: ResolvedConfig): Plugin {
  let serverContext: ViteDevServer;
  return {
    name: "mini-vite:resolve",
    async configureServer(s) {
      serverContext = s;
    },
    //client请求路径 /index.js /main/index.js等
    async resolveId(id, importer = resolvedConfig.root) {
      const basedir = importer
        ? path.dirname(importer)
        : serverContext
        ? serverContext.config.root
        : resolvedConfig.root;
      const root = resolvedConfig.root;
      const hasExtension = path.extname(id).length > 1;
      //绝对路径
      if (path.isAbsolute(id)) {
        if (fs.existsSync(id)) {
          return { id };
        }
        //如果有拓展名
        if (hasExtension) {
          id = osPath(normalizePath(path.join(basedir, id)));

          //   console.log("absolutePath: ", id);
          if (fs.existsSync(id)) {
            return { id };
          }
        }
        //没有拓展名
        else {
          for (const ext of DEFAULT_EXTENSIONS) {
            try {
              const withExtResolved = path.join(basedir, id + ext);
              //   console.log("withExtResolved-absolute: ", withExtResolved);
              if (fs.existsSync(withExtResolved)) {
                return { id: withExtResolved };
              }
            } catch (e) {}
          }
          error(
            `pluginError: 插件[resolvePlugin]没有在"${root}"找到"${id}"文件`
          );
        }
      }
      //相对路径
      else if (id.startsWith(".")) {
        if (!importer) {
          error(
            `pluginError: 插件[resolvePlugin]的resolveId方法必须传入importer参数`
          );
          throw new Error(undefined);
        }

        let resolvedId: string = id;

        //如果有后缀名 index.js main.js等
        if (hasExtension) {
          resolvedId = path.resolve(basedir, id);
          //   console.log("resolvedId-relative: ", resolvedId);
          if (fs.existsSync(resolvedId)) {
            return { id: resolvedId };
          }
        }
        //没有后缀名 index main
        else {
          for (const ext of DEFAULT_EXTENSIONS) {
            try {
              const withExtResolved = path.resolve(basedir, resolvedId + ext);
              //   console.log("withExtResolved-relative: ", withExtResolved);
              if (fs.existsSync(withExtResolved)) {
                return { id: withExtResolved };
              }
            } catch (e) {}
          }
          //如果走到这里表示没有找到文件
          error(
            `pluginError: 插件[resolvePlugin]没有在"${root}"找到"${resolvedId}"文件`
          );
        }
      }
      //第三方包react
      else if (BARE_IMPORT_RE.test(id)) {
        //拼接bundle位置 例如: react=>E://xxx//node_modules//.vite//react
        const preBundlePath = path.resolve(
          root,
          "node_modules/.vite",
          `${flattenId(id)}.js`
        );
        if (fs.existsSync(preBundlePath)) {
          return { id: preBundlePath };
        }
      }
    },
  };
}
