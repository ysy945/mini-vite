import http from "http";
import path from "path";
import { createServer } from "net";
import chokidar from "chokidar";
import chalk from "chalk";
import express from "express";
import { optimize } from "./optimizer";
import { InlineConfig, mergeConfig, resolveConfig } from "./config";
import { createPluginContainer } from "./pluginContainer";
import { ViteDevServer } from "./server";
import { normalizePath, resolveChokidarOptions } from "./utils";
import { createDevHtmlTransformFn } from "./server";
import { Plugin } from "./plugin";
import {
  indexHtmlMiddleware,
  staticMiddleware,
  transformMiddleware,
} from "./server/middlewares";
import { ModuleGraph } from "./server/moduleGraph";
import { createWebSocketServer } from "./ws";
import { handleFileAddUnlink, handleHMRUpdate } from "./hmr";

const { greenBright, redBright, blueBright, gray, red } = chalk;

function portIsOccupied(port: number) {
  return new Promise((resolve) => {
    const server = createServer().listen(port);

    let isOccupied = false;

    server.on("listening", function () {
      //当前端口未被占用
      server.close();
      resolve(isOccupied);
    });

    server.on("error", function (err) {
      //当前端口已被占用
      if (err.code === "EADDRINUSE") {
        isOccupied = true;
        resolve(isOccupied);
      }
    });
  });
}

export async function startDevServer(inlineConfig: InlineConfig = {}) {
  if (
    inlineConfig.clearScreen === undefined ||
    inlineConfig.clearScreen === true
  ) {
    console.clear();
  }

  //清空命令行
  //第一步: 1.将命令行中的config与vite.config.js结合
  //        2.调用config 与 resolvedConfig钩子
  //        3.重新调整config.plugins注入内置的插件
  //          例如cssPlugin ensureWatchPlugin等(未实现) 主要调用resolvePlugins函数实现
  const config = await resolveConfig(inlineConfig, "serve", "development");
  const plugins = config.plugins; //用户传入的vite插件
  const app = express(); //新建express中间件
  const ws = createWebSocketServer(app); //创建ws服务器
  const server = http.createServer(app); //创建服务器
  const root = config.root || process.cwd(); //获取根路径
  const startTime = Date.now(); //获取当前时间(用于显示开启服务器所用时间)
  const serverConfig = config.server || {};
  //有一些文件时不需要被监听的例如node_modules .git等
  const resolvedWatchOptions = resolveChokidarOptions({
    disableGlobbing: true,
    ...serverConfig.watch,
  });
  let defaultPort = 5173; //默认端口
  //用户指定了端口 则使用指定的端口即可
  // console.log(config);
  if (config.server?.port) {
    defaultPort = config.server?.port;
  }
  //判断当前端口是否被占用
  else {
    while (true) {
      const isOccupied = await portIsOccupied(defaultPort);
      if (!isOccupied) {
        //当前端口未被占用
        break;
      }
      defaultPort++; //被占用了加1继续判断下一个端口号是否被占用
      if (defaultPort >= 2 ** 16) {
        throw new Error(redBright.bold("🐢> 所有端口都已经被占用了! "));
      }
    }
  }

  const pluginContainer = await createPluginContainer(config);
  const moduleGraph = new ModuleGraph((url) => pluginContainer.resolveId(url));
  const watcher = chokidar.watch(path.resolve(root), resolvedWatchOptions);

  const restart = async (forceOptimize: boolean) => {
    let inlineConfig = config.inlineConfig;
    inlineConfig.clearScreen = false;
    //强制进行预构建 修改配置文件
    if (forceOptimize) {
      inlineConfig = mergeConfig(inlineConfig, {
        optimizeDeps: {
          force: true,
        },
      });
    }
    //关闭之前的服务器
    await serverContext.close();
    //重启服务器
    await startDevServer(inlineConfig);
  };

  const serverContext: ViteDevServer = {
    config, //用户传入的vite.config.js
    middlewares: app, //express中间件 app.use
    httpServer: server, //node的httpServer
    pluginContainer, //创建的插件容器 便于在特定时刻调用插件
    watcher, //chokidar
    transformIndexHtml: null!,
    moduleGraph,
    ws,
    restart, //重启服务器的方法
    async close() {
      //关闭所有的监听 ws服务器 http服务器 调用结束插件
      await Promise.all([
        watcher.close(),
        ws.close(),
        pluginContainer.close(),
        server.close(),
      ]);
    },
  };
  //在IndexHtmlMiddleware中直接调用转译所有的index.html文件内容
  serverContext.transformIndexHtml = createDevHtmlTransformFn(serverContext);

  //当文件改变的时候
  watcher.on("change", async (file) => {
    moduleGraph.onFileChange(file);
    if (serverConfig.hmr !== false) {
      try {
        await handleHMRUpdate(file, serverContext);
      } catch (err) {
        ws.send({
          type: "error",
          err,
        });
      }
    }
  });

  watcher.on("add", (file) => {
    handleFileAddUnlink(normalizePath(file), serverContext);
  });
  watcher.on("unlink", (file) => {
    handleFileAddUnlink(normalizePath(file), serverContext);
  });

  const postHooks = []; //用于存储后置服务器中间件
  for (const plugin of plugins as Plugin[]) {
    if (plugin.configureServer) {
      postHooks.push(await plugin.configureServer(serverContext));
    }
  }

  app.use(indexHtmlMiddleware(serverContext)); //应用html中间件
  app.use(transformMiddleware(serverContext)); //拦截类js 类css请求
  app.use(staticMiddleware(serverContext)); //拦截静态资源

  //在调用了vite内部中间件之后在调用后置中间件
  postHooks.forEach((fn) => fn && fn());

  //调用buildStart钩子
  await pluginContainer.buildStart({});
  await optimize(root, config); //预构建

  //监听端口 开启服务器
  server.listen(defaultPort, async function () {
    console.log(
      greenBright.bold("🚀 MINI-VITE v1.0.0"),
      `${gray.bold("耗时:")} ${red.bold(Date.now() - startTime + "ms")}\r\n`
    );
    console.log(
      `👉 ${gray.bold("本地访问路径: ")}` +
        blueBright.bold(`http://localhost:${defaultPort}/`)
    );
  });
}
