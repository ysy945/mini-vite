import path from "path";
import { ResolvedConfig } from "../config";
import scanDeps from "./scanDeps";
import preBundle from "./preBundle";
import loadCachedDepOptimizationMetadata from "./loadCachedDepOptimizationMetadata";
import { isArray, isObject } from "../utils";

//1.确定预构建入口
//2.扫描依赖
//3.根据依赖进行与构建 只对bare imports进行构建
export async function optimize(root: string, config: ResolvedConfig) {
  const entry = path.resolve(root, "index.html"); //默认扫描入口文件 可以调整root
  const {
    optimizeDeps: {
      entries, //这个配置就是esbuild的entries
    },
  } = config;
  const { input } = config.build?.rollupOptions ?? {};
  const entryPoints: string[] = [entry]; //需要预构建扫描的入口

  //先在optimizeDeps的entries中是否有打包的路径
  if (entries) {
    if (typeof entries === "string") {
      entryPoints[0] = entries;
    } else {
      entryPoints.pop();
      entryPoints.push(
        ...entries.map((entry) =>
          path.isAbsolute(entry) ? entry : path.resolve(root, entry)
        )
      );
    }
  }
  //在看build.rollupOptions.input中的输入
  else if (input) {
    if (typeof input === "string") {
      entryPoints[0] = input;
    } else if (isArray(input)) {
      input.map((p) => entryPoints.push(path.resolve(root, p)));
    } else if (isObject(input)) {
      Object.values(input).map((p) => entryPoints.push(path.resolve(root, p)));
    }
  }
  //存在缓存则不需要预构建 不存在则需要
  const cachedMetadata = loadCachedDepOptimizationMetadata(config);

  if (!cachedMetadata) {
    // console.log(config);
    //扫描依赖
    const [deps, flatIdToImports] = await scanDeps(config, entryPoints);
    //通过扫描获取的依赖 进行预构建打包
    await preBundle(deps, flatIdToImports, config);
  }
}
