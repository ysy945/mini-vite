import { Plugin } from "../plugin";
import chalk from "chalk";

export default function buildGeneratePlugin(): Plugin {
  return {
    name: "vite:build-generate",
    async generateBundle(options, bundle) {
      console.log(chalk.green.bold("π ηζζδ»ΆδΏ‘ζ―:"));
      Object.keys(bundle).forEach((name) => {
        const data = bundle[name];
        const byteLength =
          Buffer.byteLength(data.type === "asset" ? data.source : data.code) /
          1000;
        console.log(`   ${chalk.green.bold(`${name}: ${byteLength}kibs`)}`);
      });
    },
  };
}
