import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { HMR_PORT } from "./constants";
import { error } from "./utils";

export function createWebSocketServer(server: express.Express) {
  let ws: WebSocketServer;
  ws = new WebSocketServer({ port: HMR_PORT });

  const _ws = {
    //给所有客服端发送信息
    send(payLoad: {}) {
      const str = JSON.stringify(payLoad);
      ws.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(str);
        }
      });
    },

    //关闭ws服务器
    close() {
      ws.close();
    },
  };
  //监听连接  连接成功给客户端发送成功消息
  ws.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "connected" }));
  });

  //监听错误
  ws.on("error", (e: any) => {
    if (e.code === "EADDRINUSE") {
      error(`wsError: websocket服务器失败 ${e}`);
    }
  });
  return _ws;
}
