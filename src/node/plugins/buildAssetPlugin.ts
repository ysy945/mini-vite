import fs from "fs";
import path from "path";
import { ResolvedConfig } from "../config";
import { ASSET_TYPES } from "../constants";
import { Plugin } from "../plugin";
import { ViteDevServer } from "../server";
import { normalizePath } from "../utils";

export default function BuildAssetPlugin(
  resolvedConfig: ResolvedConfig
): Plugin {
  let serverContext: ViteDevServer;
  return {
    name: "mini-vite:build-asset",
    async configureServer(s) {
      serverContext = s;
    },
    async load(id) {
      if (ASSET_TYPES.includes(path.extname(id))) {
        //1.修改引入资源的路径
        //2.将assets资源放入指定的位置
        const beforeId = id;
        const relativePath = normalizePath(
          path.relative(
            resolvedConfig.build!.outDir!,
            resolvedConfig.build!.assetsDir!
          )
        );
        const assetName = path.basename(beforeId);
        id = "./" + relativePath;
        id = id + "/" + assetName;
        const source = await fs.promises.readFile(beforeId, "utf-8");
        this.emitFile({
          type: "asset",
          source,
          fileName: `${relativePath}/${assetName}`,
        });

        return `export default "${id}"`;
      }
    },
  };
}
