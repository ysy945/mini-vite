import { Plugin } from "../plugin";
import resolvePlugin from "./resolvePlugin";
import cssPlugin from "./cssPlugin";
import importAnalysisPlugin from "./importAnalysisPlugin";
import assetPlugin from "./assetPlugin";
import preAliasPlugin from "./preAliasPlugin";
import aliasPlugin from "./aliasPlugin";
import buildGenerateHtmlPlugin from "./buildGenerateHtmlPlugin";
import buildGeneratePlugin from "./buildGeneratePlugin";
import BuildAssetPlugin from "./buildAssetPlugin";

export function resolvePlugins(plugins: Plugin[]): Plugin[] {
  return plugins;
}

export {
  resolvePlugin,
  cssPlugin,
  importAnalysisPlugin,
  assetPlugin,
  preAliasPlugin,
  aliasPlugin,
  buildGeneratePlugin,
  buildGenerateHtmlPlugin,
  BuildAssetPlugin,
};
