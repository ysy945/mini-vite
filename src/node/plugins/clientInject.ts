import fs from "fs";
import path from "path";
import { CLIENT_PATH } from "../constants";
import { Plugin } from "../plugin";
import { ViteDevServer } from "../server";

export default function clientInjectPlugin(): Plugin {
  let serverContext: ViteDevServer;
  return {
    name: "mini-vite:client-inject",
    configureServer(s) {
      serverContext = s;
    },
    resolveId(id) {
      if (id === CLIENT_PATH) {
        return id;
      }
    },
    async load(id) {
      if (id === CLIENT_PATH) {
        //获取client代码路径
        const clientPath = path.resolve(
          serverContext.config.root,
          "node_modules/mini-vite-ysy/dist/client/index.js"
        );

        const code = await fs.promises.readFile(clientPath, "utf-8");

        return { code };
      }
    },
    async transformIndexHtml(htmlCode) {
      return htmlCode.replace(
        /(<head[^>]*>)/i,
        `$1<script type="module" src="${CLIENT_PATH}"></script>`
      );
    },
  };
}
