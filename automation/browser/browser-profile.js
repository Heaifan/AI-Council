/* AI Council v0.1 — WEB_AUTOMATION · BrowserProfile：专用浏览器 Profile（方案 §十三/§三十）。
 * 铁律：只使用 runtime/browser-profile（首次自动化时人工登录，之后复用）；
 * 禁止控制日常 Chrome 默认 Profile；目录已被 .gitignore（cookies/会话永不入库）。
 */
"use strict";

const path = require("path");
const fs = require("fs");

const RUNTIME_ROOT = path.join(__dirname, "..", "..", "runtime");
const PROFILE_DIR = path.join(RUNTIME_ROOT, "browser-profile");
const ARTIFACT_ROOT = path.join(RUNTIME_ROOT, "automation-artifacts");

function ensureProfileDir() {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  return PROFILE_DIR;
}
function ensureArtifactRoot() {
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
  return ARTIFACT_ROOT;
}
function artifactDirFor(invocationId) {
  const dir = path.join(ARTIFACT_ROOT, invocationId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function profileDir() { return PROFILE_DIR; }
function artifactRoot() { return ARTIFACT_ROOT; }

module.exports = {
  profileDir, ensureProfileDir, artifactRoot, ensureArtifactRoot, artifactDirFor
};
