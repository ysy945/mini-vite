import path from "path";
import { ViteDevServer } from ".";
import {
  IndexHtmlTransformContext,
  IndexHtmlTransformHook,
  IndexHtmlTransformResult,
  Plugin,
} from "../plugin";
import { normalizePath } from "../utils";

export function createDevHtmlTransformFn(server: ViteDevServer) {
  const [preHooks, postHooks] = resolveHtmlTransforms(
    server.config.plugins as Plugin[]
  );
  //调用这个函数就可以调用所有vite插件的htmlTransform钩子(源码中内置了devHtmlHook钩子)
  return (url: string, html: string, originalUrl?: string) => {
    return applyHtmlTransforms(html, [...preHooks, ...postHooks], {
      path: url,
      server,
      filename: getHtmlFilename(url, server),
      originalUrl,
    });
  };
}

function getHtmlFilename(url: string, server: ViteDevServer) {
  return decodeURIComponent(
    normalizePath(path.resolve(server.config.root, url))
  );
}

//给插件排序 pre的放前面
function resolveHtmlTransforms(plugins: Plugin[]) {
  const preHooks = [];
  const postHooks = [];
  for (const plugin of plugins) {
    const hook = plugin.transformIndexHtml; //默认读取transformIndexHtml钩子
    if (hook) {
      if (typeof hook === "function") {
        postHooks.push(hook);
      } else if (hook.enforce === "pre") {
        preHooks.push(hook.transform); //可以是一个对象
      } else {
        postHooks.push(hook.transform);
      }
    }
  }
  return [preHooks, postHooks];
}

async function applyHtmlTransforms(
  html: string,
  hooks: IndexHtmlTransformHook[],
  opts: IndexHtmlTransformContext
) {
  let code: IndexHtmlTransformResult = html;
  //TODO 需要实现返回的是[]||{}的情况 例如[{tag,attrs,children,injectTo}]
  //当前只能返回string
  for (const hook of hooks) {
    //hook可以写异步的
    const resultCode: IndexHtmlTransformResult | void = await hook(
      code as string,
      opts
    );
    //如果钩子调用有结果才赋值 否则当前钩子无作用
    if (resultCode) {
      code = resultCode;
    }
  }
  return code as string; //目前只能处理字符串
}
