import { Plugin } from "../plugin";
import { ViteDevServer } from "../server";
export default function preAliasPlugin(): Plugin {
  let serverContext: ViteDevServer;
  return {
    name: "mini-vite",
    configureServer(s) {
      serverContext = s;
    },
    async resolveId(id, importer) {
      if (id.startsWith("/virtual")) {
        return { id };
      }
      const resolved = await this.resolve(id, importer, { skipSelf: true });
      return { id: resolved!.id };
    },
  };
}
