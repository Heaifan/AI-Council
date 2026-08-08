#!/usr/bin/env node
/* AI Council v0.1 — WEB_AUTOMATION · start.js：自动化模式入口（方案 §十）。
 * 用法：node automation/start.js [port]
 * 启动后：127.0.0.1:PORT 提供 AI-Council UI（同源）+ Automation API + 专用 Chrome。
 * Manual 模式（双击 app/index.html）完全不受影响。
 */
"use strict";

const { AutomationController } = require("./core/automation-controller");
const { createAutomationServer } = require("./server/automation-server");

const port = Number(process.argv[2]) || 3741;
const controller = new AutomationController({ siteId: "chatgpt", target: "https://chatgpt.com/" });
const server = createAutomationServer(controller, port);

server.on("listening", () => {
  console.log("AI 顾问委员会 · 自动化模式已启动（仅本机）");
  console.log("  UI        : http://127.0.0.1:" + port + "/");
  console.log("  健康检查  : http://127.0.0.1:" + port + "/api/health");
  console.log("  专用 Profile: runtime/browser-profile/（首次自动化请在此浏览器登录 ChatGPT）");
  console.log("  Ctrl+C 退出。");
});
server.on("error", (e) => {
  console.error("启动失败：" + e.message);
  process.exit(1);
});
