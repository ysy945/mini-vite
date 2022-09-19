import path from "path";
import fs from "fs";
import mime from "mime";
import { RequestHandler } from "express";
import { isImportRequest } from "../../utils";
import { cleanUrl } from "./utils";
import { ViteDevServer } from "..";

//处理静态文件 .gif .png .jpg .svg
export default function staticMiddleware(
  serverContext: ViteDevServer
): RequestHandler {
  return async function (req, res, next) {
    //只处理静态资源
    if (!isImportRequest(req.url)) {
      return next();
    }
    //只处理通过assetPlugin处理后路径 也就是 "/xxx/xxx/src/assets/1.png?import"
    const url = decodeURIComponent(cleanUrl(req.url)); //去掉query参数 并解码

    const ext = path.extname(url); //获取后缀名.png

    const contentType = mime.getType(ext);

    res.setHeader("Content-Type", contentType!);
    res.setHeader("Cache-Control", "max-age=" + 60 * 60 * 24 + ",immutable");
    const content = await fs.promises.readFile(url); //读取文件
    res.send(content); //返回给前端
    return next();
  };
}
