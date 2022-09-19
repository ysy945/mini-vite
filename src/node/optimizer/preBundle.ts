import path from "path";
import fs from "fs";
import { build } from "esbuild";
import chalk from "chalk";
import { Metafile } from "esbuild";
import { ResolvedConfig } from "../config";

import preBundlePlugin from "./preBundlePlugin";
import {
  DepOptimizationMetadata,
  OptimizedDepInfo,
} from "./loadCachedDepOptimizationMetadata";
import {
  error,
  flattenId,
  getBrowserHash,
  getDepHash,
  normalizePath,
} from "../utils";

export default async function preBundle(
  deps: Record<string, string>,
  flatIdToImports: Record<string, string>,
  config: ResolvedConfig
) {
  const {
    cacheDir,
    optimizeDeps: { esbuildOptions },
  } = config; //获取预构建的缓存目录默认为node_modules/.vite

  const entries = Object.keys(flatIdToImports);

  //进行预构建
  try {
    const { metafile } = await build({
      entryPoints: [...entries], //这里进来的已经是flatten过后的id react react_jsx-runtime
      write: true,
      bundle: true,
      splitting: true,
      format: "esm",
      outdir: cacheDir,
      plugins: [preBundlePlugin(deps, flatIdToImports, config)],
      metafile: true, //生成metafile信息
      ...esbuildOptions,
    });
    await writeMetaFile(config, metafile, deps); //写入metaFile
  } catch (err) {
    error(`preBundleError: 预构建错误 ${err}`);
  }

  //预构建完成
  if (entries.length > 0) {
    console.log(`👌 ${chalk.green.bold("依赖预构建完成")}`);
  } else {
    console.log(
      `😀 ${chalk.green.bold(
        "没有扫描到需要预构建的第三方包 不需要进行预构建"
      )}`
    );
  }
}

async function writeMetaFile(
  config: ResolvedConfig,
  metafile: Metafile,
  deps: Record<string, string>
) {
  const mainHash = getDepHash(config);
  const dataPath = path.resolve(config.cacheDir, "_metadata.json");
  const data: DepOptimizationMetadata = {
    hash: getDepHash(config),
    browserHash: getBrowserHash(mainHash, deps),
    optimized: {},
    depInfoList: [],
  };

  for (const id in deps) {
    const entry = deps[id];
    data.optimized[id] = {
      id,
      file: normalizePath(path.resolve(config.cacheDir, flattenId(id) + ".js")),
      src: entry,
    };
  }

  await fs.promises.writeFile(dataPath, JSON.stringify(data, null, 2));
}
