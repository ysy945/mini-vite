console.log("[mini-vite] 连接中...");

interface Update {
  type: "js-update" | "css-update";
  timestamp: number;
  path: string;
  acceptedPath: string;
}

const socket = new WebSocket(`ws://localhost:24678`, "mini-vite-hmr");

socket.addEventListener("message", async ({ data }) => {
  handleMessage(JSON.parse(data)).catch(console.error);
});

async function handleMessage(payload: any) {
  switch (payload.type) {
    case "connected":
      console.log(`[mini-vite] 连接成功`);
      //每秒给服务器发送信息 确保服务器与客户端处于链接状态
      setInterval(() => {
        if (socket.readyState === socket.OPEN) {
          socket.send('{"type":"ping"}');
        }
      }, 1000);
      break;
    case "update":
      /*
      {
      type: "js-update",
      timestamp: 1564656156,
      path: "/src/main.ts",
      acceptedPath: "/src/render.ts"
      }
      */
      payload.updates.forEach((update: Update) => {
        //js更新
        if (update.type === "js-update") {
          queueUpdate(fetchUpdate(update));
        }
        //css更新
        else if (update.type === "css-update") {
          queueUpdate(fetchUpdate(update));
        }
      });
      break;
    case "full-reload":
      document.location.reload(); //刷新浏览器
      console.log(`[mini-vite]: 页面重载...`);
      break;
    case "log":
      console.log(payload.data);
      break;
    case "prune":
      payload.paths.forEach((path: any) => {
        const fn = pruneMap.get(path);
        if (fn) {
          fn(dataMap.get(path));
        }
      });
      break;
    default:
      break;
  }
}

/*ts*/
interface HotModule {
  id: string;
  callbacks: HotCallback[];
}

interface HotCallback {
  deps: string[];
  fn: (modules: object[]) => void;
}

// HMR 模块表
const hotModulesMap = new Map<string, HotModule>();
// 不在生效的模块表
const pruneMap = new Map<string, (data: any) => void | Promise<void>>();
//模块销毁的回调函数
const disposeMap = new Map<string, Function>();
//获取热更新传递的数据
const dataMap = new Map<string, any>();

export const createHotContext = (ownerPath: string) => {
  if (!dataMap.has(ownerPath)) {
    dataMap.set(ownerPath, {});
  }
  const mod = hotModulesMap.get(ownerPath); //获取缓存中的模块
  //如果存在 清空callbacks
  if (mod) {
    mod.callbacks = [];
  }
  //ownerPath:当前变动模块相对于根目录的路径/src/App.tsx
  function acceptDeps(deps: string[], callback: any) {
    const mod: HotModule = hotModulesMap.get(ownerPath) || {
      id: ownerPath,
      callbacks: [],
    };
    // callbacks 属性存放 accept 的依赖、依赖改动后对应的回调逻辑
    mod.callbacks.push({
      deps,
      fn: callback,
    });
    hotModulesMap.set(ownerPath, mod);
  }
  return {
    get data() {
      return dataMap.get(ownerPath);
    },
    //import.meta.hot.accept(["/src/render.ts","/src/main.ts"],function(modules){})
    accept(deps: any, callback?: any) {
      if (typeof deps === "function" || !deps) {
        acceptDeps([ownerPath], (modules: any) => deps && deps(modules));
      } else if (typeof deps === "string") {
        acceptDeps([deps], (modules: any) => callback && callback(modules));
      } else if (Array.isArray(deps)) {
        acceptDeps(deps, callback);
      } else {
        throw new Error(`invalid hot.accept() usage.`);
      }
    },
    // 模块不再生效的回调
    prune(cb: (data: any) => void) {
      pruneMap.set(ownerPath, cb);
    },
    //当某个模块更新 销毁的时候调用
    dispose(cb: Function) {
      disposeMap.set(ownerPath, cb);
    },
    //强制刷新页面
    invalidate() {
      location.reload();
    },
  };
};

const sheetsMap = new Map<string, HTMLElement>();

export function updateStyle(id: string, code: string) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.innerHTML = code;
    document.head.append(style);
  } else {
    style.innerHTML = code;
  }
  sheetsMap.set(id, style);
}

//TODO 如果引入了一个css文件保存 然后移除css文件
//TODO moduleGraph中也会有这个css文件的缓存 所以需要在removeStyle中通知服务端
//TODO 这个css文件当前是移除的状态
//TODO 不然会出现移除了这个css文件 但是在保存这个css文件 样式依然会应用在浏览器端
export function removeStyle(id: string) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
  }
  sheetsMap.delete(id);
}

/*
  hotModulesMap:
  {
    "/src/main.tsx":{
      id:"/src/main.tsx",
      callbacks:[
        {
          deps:["/src/render.ts","/src/App.tsx"],
          fn
        },
        {
          deps:["/src/render.ts"],
          fn
        }
      ]
    }
  }
*/

/*
      {
      type: "js-update",
      timestamp: 1564656156,
      path: "/src/main.ts",
      acceptedPath: "/src/render.ts"
      }
      */
async function fetchUpdate({ path, acceptedPath, timestamp }: Update) {
  const mod = hotModulesMap.get(path);
  const moduleMap = new Map();
  const isSelfUpdate = path === acceptedPath;

  // 1. 整理需要更新的模块集合
  const modulesToUpdate = new Set<string>();
  if (isSelfUpdate) {
    // 接受自身更新
    modulesToUpdate.add(path);
  } else {
    // 接受子模块更新
    for (const { deps } of mod!.callbacks) {
      deps.forEach((dep) => {
        if (acceptedPath === dep) {
          modulesToUpdate.add(dep);
        }
      });
    }
  }
  // 2. 整理需要执行的更新回调函数
  const qualifiedCallbacks = mod!.callbacks.filter(({ deps }) => {
    return deps.some((dep) => modulesToUpdate.has(dep));
  });
  // 3. 对将要更新的模块进行失活操作，并通过动态 import 拉取最新的模块信息
  await Promise.all(
    Array.from(modulesToUpdate).map(async (dep) => {
      const disposer = disposeMap.get(dep);
      if (disposer) await disposer(dataMap.get(dep));
      const [path, query] = dep.split(`?`);
      try {
        // /src/render.ts?import&t=123131
        const importPath =
          path + `?import&t=${timestamp}${query ? `&${query}` : ""}`;
        const newMod = await import(importPath);
        moduleMap.set(dep, newMod);
      } catch (e) {
        console.log(`拉取${path}模块失败: ${e}`);
      }
    })
  );
  // 4. 返回一个函数，用来执行所有的更新回调
  return () => {
    for (const { deps, fn } of qualifiedCallbacks) {
      fn(deps.map((dep) => moduleMap.get(dep)));
    }
    const loggedPath = isSelfUpdate
      ? path
      : `热模块边界"${path}"更新了"${acceptedPath}"模块`;
    console.log(`[mini-vite] 热更新: ${loggedPath}`);
  };
}

let pending = false;
let queued: Promise<() => void>[] = [];
async function queueUpdate(p: Promise<() => void>) {
  queued.push(p);
  if (!pending) {
    pending = true;
    await Promise.resolve();
    pending = false;
    const loading = [...queued];
    queued = [];
    (await Promise.all(loading)).forEach((fn) => fn && fn());
  }
}
