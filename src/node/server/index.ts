import http from "http";
import { WebSocketServer } from "ws";
import { Express } from "express";
import { FSWatcher } from "chokidar";
import { ResolvedConfig } from "../config";
import { PluginContainer } from "../pluginContainer";
import {
  TransformOptions as EsbuildTransformOptions,
  TransformResult as EsbuildTransformResult,
} from "esbuild";
import { ModuleGraph } from "./moduleGraph";

export * from "./createDevHtmlTransformFn";

export declare type ServerHook = (
  server: ViteDevServer
) => (() => void) | void | Promise<(() => void) | void>;
interface Ws {
  send(payLoad: Record<string, any>): void;
  close(): void;
}

export declare interface ViteDevServer {
  config: ResolvedConfig;
  middlewares: Express;
  httpServer: http.Server | null;
  watcher: FSWatcher;
  pluginContainer: PluginContainer;
  moduleGraph: ModuleGraph;
  ws: Ws;
  transformIndexHtml(
    url: string,
    html: string,
    originalUrl?: string
  ): Promise<string>;
  restart(forceOptimize?: boolean): Promise<void>;
  close(): Promise<void>;
  //TODO 后续实现
  listen?(port?: number, isRestart?: boolean): Promise<ViteDevServer>;

  printUrls?(): void;
  transformRequest?(
    url: string,
    options?: EsbuildTransformOptions
  ): Promise<EsbuildTransformResult | null>;
}
