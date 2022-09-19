import { Plugin } from "../plugin";
import fs from "fs";
import path from "path";
import { ResolvedConfig } from "../config";
import { scriptRE } from "../constants";
import chalk from "chalk";

export default function buildGenerateHtmlPlugin(
  resolvedConfig: ResolvedConfig
): Plugin {
  return {
    name: "vite:build-generate-html",
    async generateBundle(options, bundle) {
      const htmlPath = path.resolve(resolvedConfig.root, "index.html");
      const source = await fs.promises.readFile(htmlPath, "utf-8");
      const execArr = [];
      let contents = source;
      let execResult: RegExpExecArray | null;
      let modulesLength = 0;
      while ((execResult = scriptRE.exec(source))) {
        execArr.push(execResult[0]);
      }
      execArr.forEach((rp, index) => {
        if (index === execArr.length - 1) {
          const addContents: string[] = [];
          Object.keys(bundle).map((key) => {
            const fileData = bundle[key];
            if (fileData.type === "chunk") {
              //如果是chunk添加script到index.html中
              addContents.push(`<script src="./${key}"></script>`);
              //记录打包了多少个模块
              modulesLength += Object.keys(fileData.modules).length;
            }
          });
          contents = contents.replace(rp, addContents.join("\r\n"));
        } else {
          contents = contents.replace(rp, "");
        }
      });
      console.log(
        `${chalk.blue.bold(`🆗 一共打包了${modulesLength}个模块...`)}`
      );
      this.emitFile({
        type: "asset",
        fileName: "index.html",
        source: contents,
      });
    },
  };
}
