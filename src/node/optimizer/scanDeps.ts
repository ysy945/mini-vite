import { build } from "esbuild";
import chalk from "chalk";
import { scanPlugin } from "./scanPlugin";
import { ResolvedConfig } from "../config";
import { error, flattenId, forEach, getPkgModulePath } from "../utils";
const { green } = chalk;

export default async function scanDeps(
  config: ResolvedConfig,
  entryPoints: string[]
) {
  let depsString: string = ""; //输出的需要打包哪些预构建内容

  if (!config.optimizeDeps.exclude) {
    config.optimizeDeps.exclude = [];
  }
  const deps: Record<string, string> = {}; //没有flat过的映射表
  const flatIdToImports: Record<string, string> = {}; //key被flat过的映射表
  const { plugins = [], ...esbuildOptions } =
    config.optimizeDeps?.esbuildOptions ?? {};
  //进行依赖扫描
  try {
    await build({
      entryPoints,
      bundle: true,
      write: false,
      plugins: [...plugins, scanPlugin(deps, flatIdToImports, config)], //(esbuild会记录所有的依赖 但是有些依赖并不需要 只需要保留bare imports依赖即可 所以需要scan插件)
      external: [...config.optimizeDeps.exclude], //强制排除不需要的构建
      ...esbuildOptions,
    });
  } catch (err) {
    error(`scanDepsError: 扫描阶段错误 ${err}`);
  }

  //如果有include参数 需要添加到依赖当中
  const include = config.optimizeDeps.include || [];
  for (const moduleName of include) {
    const normalizedRoot = getPkgModulePath(moduleName, config.root);
    if (normalizedRoot) {
      deps[moduleName] = normalizedRoot;
      flatIdToImports[flattenId(moduleName)] = normalizedRoot;
    }
  }

  const keys = Object.keys(deps);
  forEach(keys, (val, index) => {
    if (index > 5) {
      const more = keys.length - index - 1;
      more > 0 && (depsString += `(... ${more} more)`);
      return "forEach_stop"; //停止遍历
    }
    depsString += val + "\r\n    ";
  });
  // console.log(deps);
  if (keys.length > 0) {
    console.log(
      `😊 ${
        green.bold("需要进行预构建的依赖:") +
        "\r\n    " +
        green.bold(depsString)
      }`
    );
  }
  return [deps, flatIdToImports];
}
