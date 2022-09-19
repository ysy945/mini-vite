// src/client/index.ts
console.log("[mini-vite] \u8FDE\u63A5\u4E2D...");
var socket = new WebSocket(`ws://localhost:24678`, "mini-vite-hmr");
socket.addEventListener("message", async ({ data }) => {
  handleMessage(JSON.parse(data)).catch(console.error);
});
async function handleMessage(payload) {
  switch (payload.type) {
    case "connected":
      console.log(`[mini-vite] \u8FDE\u63A5\u6210\u529F`);
      setInterval(() => {
        if (socket.readyState === socket.OPEN) {
          socket.send('{"type":"ping"}');
        }
      }, 1e3);
      break;
    case "update":
      payload.updates.forEach((update) => {
        if (update.type === "js-update") {
          queueUpdate(fetchUpdate(update));
        } else if (update.type === "css-update") {
          queueUpdate(fetchUpdate(update));
        }
      });
      break;
    case "full-reload":
      document.location.reload();
      console.log(`[mini-vite]: \u9875\u9762\u91CD\u8F7D...`);
      break;
    case "log":
      console.log(payload.data);
      break;
    case "prune":
      payload.paths.forEach((path) => {
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
var hotModulesMap = /* @__PURE__ */ new Map();
var pruneMap = /* @__PURE__ */ new Map();
var disposeMap = /* @__PURE__ */ new Map();
var dataMap = /* @__PURE__ */ new Map();
var createHotContext = (ownerPath) => {
  if (!dataMap.has(ownerPath)) {
    dataMap.set(ownerPath, {});
  }
  const mod = hotModulesMap.get(ownerPath);
  if (mod) {
    mod.callbacks = [];
  }
  function acceptDeps(deps, callback) {
    const mod2 = hotModulesMap.get(ownerPath) || {
      id: ownerPath,
      callbacks: []
    };
    mod2.callbacks.push({
      deps,
      fn: callback
    });
    hotModulesMap.set(ownerPath, mod2);
  }
  return {
    get data() {
      return dataMap.get(ownerPath);
    },
    accept(deps, callback) {
      if (typeof deps === "function" || !deps) {
        acceptDeps([ownerPath], (modules) => deps && deps(modules));
      } else if (typeof deps === "string") {
        acceptDeps([deps], (modules) => callback && callback(modules));
      } else if (Array.isArray(deps)) {
        acceptDeps(deps, callback);
      } else {
        throw new Error(`invalid hot.accept() usage.`);
      }
    },
    prune(cb) {
      pruneMap.set(ownerPath, cb);
    },
    dispose(cb) {
      disposeMap.set(ownerPath, cb);
    },
    invalidate() {
      location.reload();
    }
  };
};
var sheetsMap = /* @__PURE__ */ new Map();
function updateStyle(id, code) {
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
function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
  }
  sheetsMap.delete(id);
}
async function fetchUpdate({ path, acceptedPath, timestamp }) {
  const mod = hotModulesMap.get(path);
  const moduleMap = /* @__PURE__ */ new Map();
  const isSelfUpdate = path === acceptedPath;
  const modulesToUpdate = /* @__PURE__ */ new Set();
  if (isSelfUpdate) {
    modulesToUpdate.add(path);
  } else {
    for (const { deps } of mod.callbacks) {
      deps.forEach((dep) => {
        if (acceptedPath === dep) {
          modulesToUpdate.add(dep);
        }
      });
    }
  }
  const qualifiedCallbacks = mod.callbacks.filter(({ deps }) => {
    return deps.some((dep) => modulesToUpdate.has(dep));
  });
  await Promise.all(
    Array.from(modulesToUpdate).map(async (dep) => {
      const disposer = disposeMap.get(dep);
      if (disposer)
        await disposer(dataMap.get(dep));
      const [path2, query] = dep.split(`?`);
      try {
        const importPath = path2 + `?import&t=${timestamp}${query ? `&${query}` : ""}`;
        const newMod = await import(importPath);
        moduleMap.set(dep, newMod);
      } catch (e) {
        console.log(`\u62C9\u53D6${path2}\u6A21\u5757\u5931\u8D25: ${e}`);
      }
    })
  );
  return () => {
    for (const { deps, fn } of qualifiedCallbacks) {
      fn(deps.map((dep) => moduleMap.get(dep)));
    }
    const loggedPath = isSelfUpdate ? path : `\u70ED\u6A21\u5757\u8FB9\u754C"${path}"\u66F4\u65B0\u4E86"${acceptedPath}"\u6A21\u5757`;
    console.log(`[mini-vite] \u70ED\u66F4\u65B0: ${loggedPath}`);
  };
}
var pending = false;
var queued = [];
async function queueUpdate(p) {
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
export {
  createHotContext,
  removeStyle,
  updateStyle
};
