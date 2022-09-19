import path from "path";
import fs from "fs";
import { OutputOptions, RollupWatchOptions } from "rollup";
import chalk from "chalk";
import { Plugin } from "./plugin";
import { InlineConfig, resolveConfig, ResolvedConfig } from "./config";
import {
  copyDir,
  emptyDir,
  error,
  normalizePath,
  resolveChokidarOptions,
} from "./utils";
import { optimize } from "./optimizer";

export async function build(inlineConfig: InlineConfig) {
  try {
    await doBuild(inlineConfig);
  } catch (err) {
    error(`[build] 打包失败 ${err}`);
  }
}

async function doBuild(inlineConfig: InlineConfig) {
  const config: ResolvedConfig = await resolveConfig(
    inlineConfig,
    "build",
    "production"
  ); //加载配置文件
  await optimize(config.root, config); //预构建
  const options = config.build || {};
  const resolve = (p: string) => path.resolve(config.root, p);
  const rollupOptionsInConfig = options.rollupOptions || {};
  const outDir = options.outDir!;
  const plugins = config.plugins || [];
  const userExternal = options.rollupOptions?.external;
  options.write = options.write || true; //默认自动写入
  config.root = normalizePath(config.root);
  let external = userExternal;
  const rollupOptions: RollupWatchOptions = {
    context: "globalThis",
    ...rollupOptionsInConfig,
    input: options.rollupOptions?.input || resolve("index.html"),
    plugins: plugins as Plugin[],
    external,
  };

  try {
    const buildOutputOptions = function (output: OutputOptions): OutputOptions {
      const format = output.format || "es";
      const jsExt = "js";
      return {
        dir: outDir, //默认为根目录
        // Default format is 'es' for regular and for SSR builds
        format,
        exports: "auto",
        sourcemap: options.sourcemap,
        name: undefined,
        generatedCode: "es2015",
        entryFileNames: `[name].[hash].${jsExt}`,
        chunkFileNames: `[name].[hash].${jsExt}`,
        assetFileNames: `[name].[hash].[ext]`,
        inlineDynamicImports:
          output.format === "umd" || output.format === "iife",
        ...output,
      };
    };
    const outputs = resolveBuildOutputs(rollupOptionsInConfig.output || {});
    if (options.watch) {
      console.log(chalk.cyan.bold(`😊 正在监视文件改变...`));
      const output: OutputOptions | OutputOptions[] = [];
      if (Array.isArray(outputs)) {
        for (const resolvedOutput of outputs) {
          output.push(buildOutputOptions(resolvedOutput));
        }
      } else {
        output.push(buildOutputOptions(outputs));
      }
      const resolvedChokidarOptions = resolveChokidarOptions(
        options.watch.chokidar || {}
      );
      const { watch } = await import("rollup");
      const watcher = watch({
        ...rollupOptions,
        output,
        watch: {
          ...options.watch,
          chokidar: resolvedChokidarOptions,
        },
      });
      watcher.on("event", (event) => {
        if (event.code === "BUNDLE_START") {
          console.log("🧡 " + chalk.cyan.bold(`开始打包...`));
          if (options.write) {
            prepareOutDir(outDir, options.emptyOutDir, config);
          }
        } else if (event.code === "BUNDLE_END") {
          event.result.close();
          console.log(
            "💛 " + chalk.cyan.bold(`打包消耗: "${event.duration}ms".`)
          );
        } else if (event.code === "ERROR") {
          error(`rollup监听错误: ${event.error}`);
        }
      });
      return watcher;
    }

    const { rollup } = await import("rollup");
    console.log(`😎 ${chalk.green.bold("开始进行打包...")}`);
    const bundle = await rollup(rollupOptions);

    const generate = (output = {}) => {
      const result = bundle[options.write ? "write" : "generate"](
        buildOutputOptions(output)
      );

      console.log("😎 " + chalk.green.bold("打包完成"));
      return result;
    };
    if (options.write) {
      prepareOutDir(outDir, options.emptyOutDir, config);
    }
    if (Array.isArray(outputs)) {
      const res = [];
      for (const output of outputs) {
        res.push(await generate(output));
      }
      return res;
    } else {
      return await generate(outputs);
    }
  } catch (e) {
    console.log(e);
  }
}

function prepareOutDir(
  outDir: string,
  emptyOutDir: boolean | undefined | null,
  config: ResolvedConfig
) {
  if (fs.existsSync(outDir)) {
    if (!emptyOutDir && !outDir.startsWith(config.root + "/")) {
      //默认情况下，若 outDir 在 root 目录下，则 Vite 会在构建时清空该目录。
      //若 outDir 在根目录之外则会抛出一个警告避免意外删除掉重要的文件。
      //可以设置该选项来关闭这个警告
      console.log(
        "❗ " +
          chalk.yellow.bold(
            `"outDir":"${outDir}"不在项目根目录中并且"outDir"目录将会被置空.`
          )
      );
    } else if (emptyOutDir !== false) {
      emptyDir(outDir, [".git"]);
    }
  }
  //如果设置了publicDir 讲publicDir的文件拷贝到outDir中
  if (config.publicDir && fs.existsSync(config.publicDir)) {
    copyDir(config.publicDir, outDir);
  }
}

function resolveBuildOutputs(outputs: OutputOptions | OutputOptions[]) {
  return outputs;
}
