import fs from "fs";
import path from "path";
import { RequestHandler, Express } from "express";
import { SourceDescription as RollupSourceDescription } from "rollup";
import {
  error,
  isClient,
  isImportRequest,
  isObject,
  isOs,
  isVirtual,
  normalizePath,
  osPath,
} from "../../utils";
import { ViteDevServer } from "../index";
import { cleanUrl } from "./utils";
import { ParsedQs } from "qs";

//当浏览器发来一个请求
//依次调用plugin的 resolveId load transform方法
//通过所有插件的出路 再返回给服务器 插件需要我们自己实现
async function transformRequest(
  url: string,
  serverContext: ViteDevServer,
  query: ParsedQs
) {
  url = decodeURIComponent(cleanUrl(url)); //去掉query和hash参数
  let id = url;

  //第一次请求文件为/src/main.js 没有经过resolveId处理
  if (
    !fs.existsSync(id) &&
    !isVirtual(id) && //不是虚拟模块
    !isClient(id) //不能是客户端注入模块
  ) {
    id = osPath(normalizePath(path.join(serverContext.config.root, id)));

    // console.log(url);
    await serverContext.moduleGraph.ensureEntryFromUrl(url); //创建入口模块的moduleNode
    //经过处理后如果还是不存在 那就是路径解析错误 告诉用户
    if (!fs.existsSync(id)) {
      error(
        `pathError: "请检查导入语句的路径是否正确 根目录中无法找到"${url}"文件`
      );
    }
  }
  const transformResult = await doTransform(id, url, serverContext, query); //执行load transform方法
  //缓存转换结果到当前moduleNode中 将转换后的结果放入当前mod中

  return transformResult;
}

async function doTransform(
  id: string,
  url: string,
  serverContext: ViteDevServer,
  query: ParsedQs
) {
  //这里的resolveId的执行由插件importAnalysis处理
  //importAnalysis会处理为能直接读取文件的路径
  //为了应用alias属性 @/src/index.js会被当做bare imports打包 为了避免这种情况 只能
  //在importAnalysis中判断是否命中alias属性 然后调用完整个resolveId

  const result = await loadAndTransform(id, url, serverContext, query);
  return result; //将转后后的结果返回
}

async function loadAndTransform(
  id: string,
  url: string,
  serverContext: ViteDevServer,
  query: ParsedQs
) {
  const { pluginContainer, moduleGraph } = serverContext;
  const curMod = moduleGraph.getModuleById(id); //必须传入绝对路径
  const timestamp = parseInt(query.t as string);
  //热更新 再次发送请求的时候 已经经过转换的模块 不用再进行load transform逻辑
  if (curMod && curMod.transformResult) {
    //小于表示当前的hmr请求时最新的 需要最新的transform结果
    if (timestamp && curMod.lastHMRTimestamp < timestamp) {
      curMod.lastHMRTimestamp = timestamp;
    }
    //不携带t参数的请求
    else return curMod.transformResult;
  }

  const loadResult = await pluginContainer.load(id, { ssr: undefined });

  //执行load
  let code: string | null | void = "";
  if (isObject(loadResult)) code = loadResult.code;
  else code = loadResult;

  let transformResult: RollupSourceDescription | null = null;
  //执行transform
  if (code) {
    transformResult = (await pluginContainer.transform(code, id, {})) || {
      code,
    };
  }
  if (transformResult && curMod) {
    curMod.transformResult = transformResult;
  }

  return transformResult!;
}

export default function transformMiddleware(
  serverContext: ViteDevServer
): RequestHandler {
  return async function viteTransformMiddleware(req, res, next) {
    let { url, query } = req;
    url = decodeURIComponent(url);
    if (req.method.toLocaleLowerCase() !== "get" || !url) {
      return next(); //不是当前插件需要处理的直接跳过
    }
    //如果是import请求交给下一个中间件
    if (isImportRequest(url)) {
      return next();
    }
    //表示当前请求的是第三方包(重新预构建之后需要读取新文件)
    if (url.includes("node_modules/.vite")) {
      const maxAge = 60 * 60 * 24;
      res.setHeader("Cache-Control", "max-age=" + maxAge + ",immutable");
    }

    try {
      const transformResult = await transformRequest(url, serverContext, query);
      // console.log("transformResult: ", transformResult);
      if (!transformResult) {
        return next();
      }

      res.statusCode = 200;
      res.setHeader("content-type", "application/javascript");
      res.send(transformResult.code);
    } catch (err) {
      error(`devServerError: 中间件[transformMiddleware]错误,${err}`);
    }

    next();
  };
}
