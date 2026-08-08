/* AI Council v0.1 — WEB_AUTOMATION · AutomationServer：本地自动化 API（方案 §十/§十一/§三十）。
 * 只监听 127.0.0.1（绝不 0.0.0.0，不向局域网开放）。
 * 路由：
 *   GET  /            → 静态 UI（注入 automation-ui.js，同源）
 *   GET  /automation-ui.js → 注入脚本
 *   POST /api/automate     → { invocationId, prompt, siteId?, target?, timeoutMs? } → 202 { invocationId }
 *   GET  /api/status/:id   → AutomationSession JSON（轮询进度）
 *   GET  /api/result/:id   → AutomationResult JSON（一次性）
 * 同源设计：UI 与 API 无 CORS/Origin/token 负担。
 */
"use strict";

const http = require("http");
const { createStaticHandler, serveUiScript } = require("./static-server");

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

function createAutomationServer(controller, port) {
  const staticHandler = createStaticHandler(true);
  const pending = new Map();   // invocationId -> { controller, status, result, done }

  function run(payload) {
    const id = payload.invocationId || ("inv-" + Date.now());
    const entry = { controller, status: null, result: null, done: false };
    pending.set(id, entry);
    const c = new (controller.constructor)({ siteId: payload.siteId, target: payload.target, timeoutMs: payload.timeoutMs });
    entry.controller = c;
    c.runInvocation(id, payload.prompt).then((result) => {
      entry.result = result; entry.done = true;
    });
    return id;
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && u.pathname === "/automation-ui.js") { serveUiScript(req, res); return; }
    if (req.method === "GET" && u.pathname === "/api/health") { json(res, 200, { ok: true, worker: "ai-council-automation" }); return; }
    if (req.method === "POST" && u.pathname === "/api/automate") {
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}");
          if (typeof payload.prompt !== "string" || !payload.prompt.trim()) { json(res, 400, { ok: false, error: "prompt 必填" }); return; }
          const id = run(payload);
          json(res, 202, { ok: true, invocationId: id });
        } catch (e) { json(res, 400, { ok: false, error: "JSON 解析失败：" + e.message }); }
      });
      return;
    }
    const mStatus = u.pathname.match(/^\/api\/status\/([^/]+)$/);
    if (req.method === "GET" && mStatus) {
      const entry = pending.get(decodeURIComponent(mStatus[1]));
      if (!entry) { json(res, 404, { ok: false, error: "未知 invocationId" }); return; }
      json(res, 200, entry.controller.getStatus());
      return;
    }
    const mResult = u.pathname.match(/^\/api\/result\/([^/]+)$/);
    if (req.method === "GET" && mResult) {
      const entry = pending.get(decodeURIComponent(mResult[1]));
      if (!entry) { json(res, 404, { ok: false, error: "未知 invocationId" }); return; }
      if (!entry.done) { json(res, 202, { ok: false, pending: true }); return; }
      json(res, 200, entry.result.toJSON());
      return;
    }
    staticHandler(req, res, () => { json(res, 404, { ok: false, error: "not found" }); });
  });

  server.listen(port, "127.0.0.1");   // 铁律：只绑定 127.0.0.1（方案 §三十）
  return server;
}

module.exports = { createAutomationServer };
