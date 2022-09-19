import path from "path";
import fs from "fs";
import { ViteDevServer } from "./server";
import chalk from "chalk";
import { getShortName, isOs, normalizePath, osPath } from "./utils";
import { ModuleNode } from "./server/moduleGraph";
import { Plugin } from "./plugin";

export interface HmrContext {
  file: string;
  timestamp: number;
  modules: Array<ModuleNode>;
  read: () => string | Promise<string>;
  server: ViteDevServer;
}

export interface Boundary {
  boundary: ModuleNode;
  acceptedVia: ModuleNode;
}

export async function handleHMRUpdate(
  file: string,
  serverContext: ViteDevServer
) {
  file = osPath(normalizePath(file));
  const { moduleGraph, ws, config } = serverContext;
  const basename = path.basename(file);
  const shortFile = getShortName(file, config.root);
  //如果改变的是配置文件需要重启服务器
  if (basename.startsWith("vite.config")) {
    console.clear(); //清空控制台
    console.log(
      `🔨 ${chalk.blue.bold("[hmr]:")} ${chalk.green.bold(
        `配置文件"${path.relative(
          process.cwd(),
          file
        )}" 改变了, 重启服务器中...`
      )}`
    );
    try {
      await serverContext.restart();
    } catch (err) {
      console.log(
        `😭 ${chalk.blue.bold("[hmr]:")} ${chalk.red.bold(
          `serverError: 服务器启动失败! ${err}`
        )}`
      );
    }
    return;
  }

  console.log(
    `🎈 ${chalk.blue.bold("[hmr]:")} ${chalk.green.bold(
      `"${file}"`
    )} ${chalk.gray.bold("发生了改变")}`
  );

  //处理更新逻辑
  const mods = moduleGraph.getModulesByFile(file);
  // check if any plugin wants to perform custom HMR handling
  const timestamp = Date.now();
  const hmrContext: HmrContext = {
    file, //热更新改变的文件
    timestamp, //改变的当前时间戳
    modules: mods ? [...mods] : [], //当前文件对应的模块
    read: () => readModifiedFile(file), //获取改变的文件
    server: serverContext,
  };

  //调用handleHotUpdate插件钩子
  for (const plugin of config.plugins) {
    const hook = (plugin as Plugin)?.handleHotUpdate;
    if (hook) {
      const filteredModules = await hook(hmrContext);
      if (filteredModules) {
        hmrContext.modules = filteredModules;
      }
    }
  }
  if (!hmrContext.modules.length) {
    // html文件不能被热重载
    if (file.endsWith(".html")) {
      console.log(
        `😦 ${chalk.blue.bold("[hmr]:")} ${chalk.green.bold(
          `浏览器页面重载...`
        )}`
      );
      //页面重新加载
      ws.send({
        type: "full-reload",
        path: normalizePath(path.relative(config.root, file)),
      });
    } else {
      //监听到的文件不在项目引入文件范围内
      // console.log(
      // `😦 ${chalk.blue.bold(`[hmr]:`)} ${chalk.gray.bold(
      // `没有匹配到"${shortFile}"`
      // )}`
      // );
      ws.send({
        type: "log",
        data: `[mini-vite]: "${shortFile}"不在项目引入文件范围内 不进行热更新`,
      });
    }
    return;
  }
  updateModules(shortFile, hmrContext.modules, timestamp, serverContext);
}

function updateModules(
  file: string,
  modules: ModuleNode[],
  timestamp: number,
  { config, ws }: ViteDevServer
) {
  const updates = [];
  const invalidatedModules = new Set<ModuleNode>();
  let needFullReload = false;
  for (const mod of modules) {
    invalidate(mod, timestamp, invalidatedModules);
    if (needFullReload) {
      continue;
    }
    const boundaries = new Set<Boundary>(); //模块更新边界
    const hasDeadEnd = propagateUpdate(mod, boundaries); //收集热边界
    if (hasDeadEnd) {
      needFullReload = true;
      continue;
    }
    updates.push(
      ...[...boundaries].map(({ boundary, acceptedVia }) => ({
        type: `${boundary.type}-update`,
        timestamp,
        path: boundary.url,
        acceptedPath: acceptedVia.url,
      }))
    );
  }

  //需要页面重载
  if (needFullReload) {
    console.log(
      "🎈 " +
        chalk.blue.bold("[hmr]: ") +
        chalk.green.bold(`页面重载 `) +
        chalk.dim.bold(file)
    );
    ws.send({
      type: "full-reload",
    });
    return;
  }

  if (updates.length === 0) {
    return;
  }

  //有页面需要热更新
  console.log(
    updates
      .map(
        ({ path }) =>
          "🎈 " +
          chalk.blue.bold("[hmr]: ") +
          chalk.green.bold(`热模块更新 `) +
          `"${chalk.dim.bold(path)}"`
      )
      .join("\n")
  );
  ws.send({
    type: "update",
    updates,
  });
}

//收集热边界
function propagateUpdate(
  node: ModuleNode,
  boundaries: Set<Boundary>,
  currentChain = [node]
) {
  //接受自身热更新
  if (node.isSelfAccepting) {
    boundaries.add({
      boundary: node,
      acceptedVia: node,
    });
    return false; //不需要页面刷新
  }
  //入口模块 进行页面刷新
  if (!node.importers.size) {
    return true;
  }

  for (const importer of node.importers) {
    const subChain = currentChain.concat(importer);
    if (importer.acceptedHmrDeps.has(node)) {
      boundaries.add({
        boundary: importer,
        acceptedVia: node,
      });
      continue;
    }

    //出现循环依赖 强制刷新页面
    if (currentChain.includes(importer)) {
      return true;
    }

    //递归到更上层寻找热更新边界
    if (propagateUpdate(importer, boundaries, subChain)) {
      return true;
    }
  }
  return false;
}

function invalidate(mod: ModuleNode, timestamp: number, seen: Set<ModuleNode>) {
  if (seen.has(mod)) {
    return;
  }
  seen.add(mod);
  mod.lastHMRTimestamp = timestamp;
  mod.transformResult = null;
  mod.importers.forEach((importer) => {
    if (!importer.acceptedHmrDeps.has(mod)) {
      invalidate(importer, timestamp, seen);
    }
  });
}

async function readModifiedFile(file: string) {
  return await fs.promises.readFile(file, "utf-8");
}

export function handlePrunedModules(
  mods: Set<ModuleNode>,
  { ws }: ViteDevServer
) {
  const t = Date.now();
  mods.forEach((mod) => {
    mod.lastHMRTimestamp = t;
  });
  ws.send({
    type: "prune",
    paths: [...mods].map((m) => m.url),
  });
}

//删除文件或则增加文件的时候调用
export async function handleFileAddUnlink(file: string, server: ViteDevServer) {
  //获取删除文件的modules 新增则不处理
  const modules = [...(server.moduleGraph.getModulesByFile(file) || [])];
  if (modules.length > 0) {
    updateModules(
      getShortName(file, server.config.root),
      unique(modules),
      Date.now(),
      server
    );
  }
}

//去重
function unique(arr: any[]) {
  return Array.from(new Set(arr));
}
