import {
  ModuleInfo as RollupModuleInfo,
  PartialResolvedId as RollupPartialResolvedId,
  SourceDescription as RollupSourceDescription,
} from "rollup";
import { isCssRequest, isVirtual } from "../utils";
import { cleanUrl } from "./middlewares";

export type ResolvedUrl = [url: string, resolvedId: string];

export class ModuleNode {
  url: string; //传入的url
  id: string | null = null; //url的绝对路径
  file: string | null = null; //cleanUrl去除掉query hash参数的id
  type: "js" | "css"; //当前模块的类型
  info?: RollupModuleInfo; //当前模块的信息
  meta?: Record<string, any>;
  importers = new Set<ModuleNode>(); //引用过当前模块的集合
  importedModules = new Set<ModuleNode>(); //模块的依赖模块
  acceptedHmrDeps = new Set<ModuleNode>(); //接受热更新的模块
  acceptedHmrExports: Set<string> | null = null;
  importedBindings: Map<string, Set<string>> | null = null;
  isSelfAccepting?: boolean; //是否接受自身更新
  transformResult: RollupSourceDescription | null = null; //当前模块调用transform的结果
  lastHMRTimestamp = 0; //上次热更新的时间戳
  constructor(url: string, setIsSelfAccepting = true) {
    this.url = url;
    this.type = isCssRequest(url) ? "css" : "js";
    if (setIsSelfAccepting) {
      this.isSelfAccepting = false;
    }
  }
}

//module图 由moduleNode为单个元素 构成得图 moduleNode代表一个文件模块
export class ModuleGraph {
  //资源url到ModuleNode得引射表"./src/main.js"=>moduleNode
  urlToModuleMap = new Map<string, ModuleNode>();
  //资源得绝对路径与ModuleNode的映射"E:/xxx/xxx/src/main.js"=>moduleNode
  idToModuleMap = new Map<string, ModuleNode>();
  //单个文件可能对应于具有不同查询的多个模块
  fileToModulesMap = new Map<string, Set<ModuleNode>>();
  safeModulesPath = new Set<string>();

  constructor(
    private _resolveId: (url: string) => Promise<RollupPartialResolvedId | null>
  ) {
    this._resolveId = _resolveId;
  }

  //通过绝对路径获取模块
  getModuleById(id: string) {
    return this.idToModuleMap.get(id);
  }

  //解析url变为绝对路径后 获取模块
  async getModuleByUrl(id: string) {
    const [url] = await this.resolveUrl(id);
    return this.urlToModuleMap.get(url);
  }

  invalidateModule(mod: ModuleNode): void {
    mod.transformResult = null;
  }

  invalidateAll(): void {
    this.idToModuleMap.forEach((mod) => {
      this.invalidateModule(mod);
    });
  }

  getModulesByFile(file: string): Set<ModuleNode> | undefined {
    return this.fileToModulesMap.get(file);
  }

  //当文件改变的时候调用
  onFileChange(file: string): void {
    const mods = this.getModulesByFile(file); //获取改变的所有模块
    if (mods) {
      mods.forEach((mod) => {
        this.invalidateModule(mod); //初始化模块
      });
    }
  }

  //讲当前模块的信息放入ModuleGraph中
  async ensureEntryFromUrl(
    rawUrl: string,
    setIsSelfAccepting = true //是否接受自身更新
  ): Promise<ModuleNode> {
    //获取解析后的id
    const [url, resolvedId] = await this.resolveUrl(rawUrl);

    let mod = this.idToModuleMap.get(resolvedId);
    //检测当前入口是否有模块
    if (!mod) {
      mod = new ModuleNode(url, setIsSelfAccepting); //根据url创建新的模块
      this.urlToModuleMap.set(url, mod); //放入到模块集合当中
      mod.id = resolvedId; //设置id值
      this.idToModuleMap.set(resolvedId, mod); //放入到模块集合中
      const file = (mod.file = cleanUrl(resolvedId)); //设置file属性
      let fileMappedModules = this.fileToModulesMap.get(file);
      //设置fileToModulesMap
      if (!fileMappedModules) {
        fileMappedModules = new Set();
        this.fileToModulesMap.set(file, fileMappedModules);
      }
      fileMappedModules.add(mod);
    } else if (!this.urlToModuleMap.has(url)) {
      this.urlToModuleMap.set(url, mod);
    }
    return mod;
  }

  //更新模块信息
  async updateModuleInfo(
    mod: ModuleNode, //要更新的模块
    importedModules: Set<string | ModuleNode>,
    importedBindings: Map<string, Set<string>> | null = null,
    acceptedModules: Set<string | ModuleNode> = new Set(),
    acceptedExports: Set<string> | null = new Set(),
    isSelfAccepting: boolean = false
  ): Promise<Set<ModuleNode> | undefined> {
    mod.isSelfAccepting = isSelfAccepting; //更新模块的时候 必须传入是否接受自身更新
    const prevImports = mod.importedModules; //获取之前的模块依赖
    const nextImports = (mod.importedModules = new Set()); //创建更新后的模块依赖
    let noLongerImported: Set<ModuleNode> | undefined;
    //遍历传入的模块依赖
    for (const imported of importedModules) {
      //根据imported获取依赖 如果依赖存在直接返回 不存在创建新的moduleNode 并更新
      //urlToModuleMap idToModuleMap fileToModulesMap
      const dep =
        typeof imported === "string"
          ? await this.ensureEntryFromUrl(imported)
          : imported;
      dep.importers.add(mod); //依赖的引用者就是当前mod
      nextImports.add(dep); //将更新后的依赖放入到最新的容器中
    }
    // remove the importer from deps that were imported but no longer are.
    // import a from "a";import b from "b"更新后变为
    // import b from "b" 那么就会少了一个模块
    // 也就是对于a模块来说少了一个引用者 删除这个引用者 如果删除后a模块没有引用者了
    // 讲这个依赖放入noLongerImported中 表示不会再引用这个模块
    prevImports.forEach((dep) => {
      if (!nextImports.has(dep)) {
        dep.importers.delete(mod);
        if (!dep.importers.size) {
          // dependency no longer imported
          (noLongerImported || (noLongerImported = new Set())).add(dep);
        }
      }
    });
    //更新mod接受更新的模块
    const deps = (mod.acceptedHmrDeps = new Set());
    for (const accepted of acceptedModules) {
      const dep =
        typeof accepted === "string"
          ? await this.ensureEntryFromUrl(accepted)
          : accepted;
      deps.add(dep);
    }
    //更新接受的exports
    mod.acceptedHmrExports = acceptedExports;
    mod.importedBindings = importedBindings;
    return noLongerImported; //返回不在import的依赖
  }

  //调用传入的resolve函数解析路径
  async resolveUrl(url: string): Promise<ResolvedUrl> {
    let resolved: RollupPartialResolvedId | null;
    let resolvedId: string;
    //过滤掉虚拟模块
    if (isVirtual(url)) {
      resolvedId = url;
    } else {
      resolved = await this._resolveId(url);
      resolvedId = resolved?.id || url;
    }
    return [url, resolvedId];
  }
}
