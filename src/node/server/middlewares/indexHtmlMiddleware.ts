import path from "path";
import fs from "fs";
import chalk from "chalk";
import { cleanUrl } from "./index";
import { ViteDevServer } from "..";
import { RequestHandler } from "express";
import { error } from "../../utils";

export default function indexHtmlMiddleware(
  serverContext: ViteDevServer
): RequestHandler {
  return async function viteIndexHtmlMiddleware(req, res, next) {
    const url = req.url && cleanUrl(req.url); //清楚掉query参数 hash参数
    const { root } = serverContext.config; //获取配置的根路径
    let htmlPath = "";
    //服务器正在访问根目录返回index.html
    if (url === "/") {
      htmlPath = path.resolve(root, "index.html"); //获取存放index.html的文件路径
    }
    //http://localhost:3000/main.html
    else if (url.endsWith(".html")) {
      htmlPath = path.resolve(root, url.slice(1)); //获取存放index.html的文件路径
    }

    if (fs.existsSync(htmlPath)) {
      try {
        let html = await fs.promises.readFile(htmlPath, "utf-8"); //读取index.html文件
        //转换html
        html = await serverContext.transformIndexHtml(
          url,
          html,
          req.originalUrl
        );

        res.statusCode = 200; //找到了
        res.setHeader("content-type", "text/html"); //设置请求头
        return res.send(html); //传递给客户端
      } catch (err) {
        //报错
        error(`devServerError: 中间件[indexHtmlMiddleware]错误,${err}`);
      }
    } else {
      if (htmlPath.endsWith(".html")) {
        error(
          `devServerError: 中间件[indexHtmlMiddleware]错误,没有在"${
            serverContext.config.root
          }"找到对应的"${url.slice(1)}"文件`
        );
      }
    }
    return next();
  };
}
