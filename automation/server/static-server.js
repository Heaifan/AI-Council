/* AI Council v0.1 — WEB_AUTOMATION · StaticServer：本地静态文件服务（方案 §十/§十一）。
 * 只服务仓库 app/ 目录（index.html + css + js），自动化模式下在 </body> 前注入 automation-ui.js
 * （file:// 手动模式不加载，app 侧脚本无任何网络调用，保持 TEST-10 零网络纪律）。
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const APP_ROOT = path.join(__dirname, "..", "..", "app");
const UI_SCRIPT = path.join(__dirname, "..", "ui", "automation-ui.js");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

function createStaticHandler(injectUi) {
  return function (req, res, next) {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    const file = path.normalize(path.join(APP_ROOT, urlPath));
    if (!file.startsWith(APP_ROOT)) { res.writeHead(403); res.end("forbidden"); return; }
    fs.readFile(file, (err, data) => {
      if (err) { next(); return; }
      let body = data;
      if (injectUi && file.endsWith(".html")) {
        const inject = '<script src="/automation-ui.js"></script>';
        body = data.toString("utf8").replace("</body>", inject + "</body>");
      }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    });
  };
}

function serveUiScript(req, res) {
  fs.readFile(UI_SCRIPT, (err, data) => {
    if (err) { res.writeHead(404); res.end("automation-ui.js not found"); return; }
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(data);
  });
}

module.exports = { createStaticHandler, serveUiScript, APP_ROOT };
