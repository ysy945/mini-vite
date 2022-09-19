import path from "path";
import fs from "fs";
import { ResolvedConfig } from "../config";
import { emptyDir, getDepHash, normalizePath } from "../utils";
import chalk from "chalk";

export declare interface DepOptimizationMetadata {
  hash: string;

  browserHash: string;

  optimized: Record<string, OptimizedDepInfo>;
  depInfoList: OptimizedDepInfo[];
}

export declare interface OptimizedDepInfo {
  id: string;
  file: string;
  src?: string;
  needsInterop?: boolean;
  browserHash?: string;
  fileHash?: string;
  processing?: Promise<void>;
}

export default function loadCachedDepOptimizationMetadata(
  config: ResolvedConfig
) {
  const force = config.optimizeDeps.force; //是否强制预构建
  const cachedMetadataPath = path.resolve(config.cacheDir, "_metadata.json"); //打包的元信息路径
  //进行预构建之前需要判断是否需要预构建
  //进行元信息比较
  if (!force) {
    let cachedMetadata;
    try {
      //读取json文件并进行解析
      cachedMetadata = parseDepsOptimizerMetadata(
        fs.readFileSync(cachedMetadataPath, "utf-8"),
        cachedMetadataPath
      );
    } catch (e) {}
    //hash值与之前相等不需要进行预构建
    if (cachedMetadata && cachedMetadata.hash === getDepHash(config)) {
      console.log(
        `${chalk.grey.bold(
          "-> Hash与之前相等,不在进行预构建,强制预构建请使用 --force"
        )}`
      );
      return cachedMetadata;
    }
    emptyDir(config.cacheDir); //配置已经更新需要删除.vite
  }
  //强制预构建 不进行比较
  else {
    emptyDir(config.cacheDir);
  }
}

export function parseDepsOptimizerMetadata(
  jsonMetadata: string,
  cacheDir: string
) {
  const { hash, browserHash, optimized } = JSON.parse(
    jsonMetadata,
    (key, value) => {
      if (key === "file" || key === "src") {
        return normalizePath(path.resolve(cacheDir, value));
      }
      return value;
    }
  );
  const metadata = {
    hash,
    browserHash,
    optimized: {},
    depInfoList: [],
  };
  for (const id of Object.keys(optimized)) {
    addOptimizedDepInfo(metadata, "optimized", {
      ...optimized[id],
      id,
      browserHash,
    });
  }
  return metadata;
}

function addOptimizedDepInfo(
  metadata: DepOptimizationMetadata,
  type: "hash" | "optimized" | "browserHash",
  depInfo: OptimizedDepInfo
) {
  if (typeof metadata[type] !== "string") {
    (metadata[type] as Record<string, OptimizedDepInfo>)[depInfo.id] = depInfo;
  }
  metadata.depInfoList.push(depInfo);

  return depInfo;
}
