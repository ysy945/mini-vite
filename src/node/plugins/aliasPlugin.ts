import { Alias, ResolvedConfig } from "../config";
import { Plugin } from "../plugin";
import { ViteDevServer } from "../server";
import { matches, normalizePath } from "../utils";

export default function aliasPlugin(config: ResolvedConfig): Plugin {
  let serverContext: ViteDevServer;
  return {
    name: "mini-vite:alias",
    configureServer(s) {
      serverContext = s;
    },
    async resolveId(id, importer, opts) {
      const alias = config.resolve?.alias;

      //获得能够匹配的
      if (!alias) {
        return undefined;
      }
      const matchEntries = (alias as Alias[]).find(({ find }) => {
        return matches(find, id);
      });

      if (!matchEntries) {
        return null;
      }

      const updateId = id.replace(matchEntries.find, matchEntries.replacement);

      //因为这里的id必须要返回值 但是我们后续的插件还需要继续处理 调用ctx的resolve方法并跳过当前这个插件的处理
      return await this.resolve(normalizePath(updateId), importer, {
        skipSelf: true,
        ...opts,
      });
    },
  };
}
