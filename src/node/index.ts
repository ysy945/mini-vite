import { InlineConfig } from "./config";
import { startDevServer } from "./devServer";
import { build } from "./build";

export { startDevServer, build };

export function defineConfig(config: InlineConfig) {
  return config;
}
