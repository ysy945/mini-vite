import path from "path";
import { ASSET_TYPES } from "../constants";
import { Plugin } from "../plugin";
import { ViteDevServer } from "../server";

export default function assetPlugin(): Plugin {
  let serverContext: ViteDevServer;
  return {
    name: "mini-vite:asset",
    async configureServer(s) {
      serverContext = s;
    },
    async load(id) {
      //只处理静态资源文件
      //import image from "./src/assets/1.png"
      //=> 经过importAnalysis的处理已经变成了"/xxx/xxx/src/assets/1.png" => "/xxx/xxx/src/assets/1.png?import"
      //我们需要变成"xxx/xxx/src/assets/1.png?import"便于<img src="/xxx/xxx/src/assets/1.png?import">
      //服务器收到?import使用其他中间件 读取文件返回给客户端 不能使用transformMiddleware中间件
      if (ASSET_TYPES.includes(path.extname(id))) {
        return `export default "${id}?import"`; //将路径包装成一个模块
      }
    },
  };
}
