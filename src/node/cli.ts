import { Command } from "commander";
import { startDevServer } from "./devServer";
import { build } from "./build";

const program = new Command("dev");

//创建启动mode为development的指令
program
  .version("1.0.0")
  .command("[root]", "start devServer")
  .alias("dev")
  .alias("serve")
  .option("--root, [root]", "项目根目录,默认为process.cwd()")
  .option("--mode, [mode]", "当前模式development或production")
  .option("--force, [force]", "是否强制预构建")
  .action(async function (options) {
    await startDevServer({
      root: options.root || process.cwd(),
      base: options.base,
      mode: options.mode,
      configFile: options.config,
      optimizeDeps: { force: options.force },
      server: undefined,
    });
  });

const programBuild = new Command("build");

programBuild
  .version("1.0.0")
  .command("build [root]", "start devServer")
  .option("--root, [root]", "项目根目录,默认为process.cwd()")
  .action(async function (options) {
    await build({
      root: options.root || process.cwd(),
    });
  });

//添加子命令 mini-vite build
program.addCommand(programBuild);

program.parse(process.argv);
