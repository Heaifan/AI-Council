/* automation/tests/smoke-server.js — 一次性冒烟：start.js 静态服务 + API 路由（临时脚本）。 */
"use strict";
const { AutomationController } = require("../core/automation-controller");
const { createAutomationServer } = require("../server/automation-server");
const http = require("http");

const controller = new AutomationController({ siteId: "chatgpt", target: "https://chatgpt.com/" });
const server = createAutomationServer(controller, 0);   // 随机端口
server.listen(0, "127.0.0.1", () => {
  const port = server.address().port;
  const get = (p) => new Promise((res, rej) => {
    http.get("http://127.0.0.1:" + port + p, (r) => {
      let b = ""; r.on("data", (c) => b += c); r.on("end", () => res({ code: r.statusCode, body: b }));
    }).on("error", rej);
  });
  (async () => {
    const health = await get("/api/health");
    console.log("health:", health.code, health.body);
    const index = await get("/");
    console.log("index 注入 automation-ui:", index.body.includes("/automation-ui.js"), "code", index.code);
    const ui = await get("/automation-ui.js");
    console.log("automation-ui.js:", ui.code, ui.body.length > 0 ? "OK" : "EMPTY");
    const post = await new Promise((res, rej) => {
      const req = http.request({ host: "127.0.0.1", port, path: "/api/automate", method: "POST", headers: { "content-type": "application/json" } }, (r) => {
        let b = ""; r.on("data", (c) => b += c); r.on("end", () => res({ code: r.statusCode, body: b }));
      });
      req.on("error", rej);
      req.end(JSON.stringify({ prompt: "冒烟测试" }));
    });
    console.log("automate:", post.code, post.body);
    const bad = await get("/api/status/nonexistent");
    console.log("status 404:", bad.code);
    server.close();
    process.exit(0);
  })().catch((e) => { console.error(e); process.exit(1); });
});
