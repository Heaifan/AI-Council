/* AI Council v0.1 — WEB_AUTOMATION · AutomationController：自动化编排（方案 §二十二/§二十七/§二十九）。
 * runInvocation：创建 Session → Driver 启动 → 打开目标 → 发送 Prompt → 条件等待 → 提取 → Result。
 * 任何失败：自动保存证据（截图/HTML/failure.json）到 runtime/automation-artifacts/<invocation-id>/，绝不静默。
 * Result 永远不自动写入会议事实（由上层 UI 人工 Accept 后才落库）。
 */
"use strict";

const { AutomationResult } = require("./automation-result");
const { AutomationError } = require("./automation-errors");
const { AutomationSession } = require("./automation-session");
const { artifactDirFor } = require("../browser/browser-profile");
const { createSiteAdapter } = require("../sites/site-adapter");
const { PlaywrightDriver } = require("../drivers/playwright-driver");

class AutomationController {
  constructor(opts) {
    this.siteId = (opts && opts.siteId) || "chatgpt";
    this.target = (opts && opts.target) || "https://chatgpt.com/";
    this.timeoutMs = (opts && opts.timeoutMs) || 120000;
    /* 站点适配器工厂（测试可注入 fake；生产默认按 siteId 创建）。 */
    this.adapterFactory = (opts && opts.adapterFactory) || (function (siteId) {
      return createSiteAdapter(siteId);
    });
    this.driverFactory = (opts && opts.driverFactory) || null;
  }
  createDriver() {
    const adapter = this.adapterFactory(this.siteId);
    return this.driverFactory ? this.driverFactory(adapter) : new PlaywrightDriver(adapter);
  }
  /* 证据落盘：截图 + 页面 HTML + failure.json（方案 §二十九）。 */
  async saveArtifacts(invocationId, error) {
    const dir = artifactDirFor(invocationId);
    const fs = require("fs");
    const path = require("path");
    try {
      if (this.driver && this.driver.page) {
        await this.driver.page.screenshot({ path: path.join(dir, "screenshot.png"), fullPage: true });
        const html = await this.driver.page.content().catch(() => "");
        if (html) fs.writeFileSync(path.join(dir, "page.html"), html, "utf8");
      }
    } catch (e) { /* 截图失败不阻断错误上报 */ }
    const payload = error && error.toJSON ? error.toJSON() : { code: "AUTOMATION_UNKNOWN", detail: String(error) };
    fs.writeFileSync(path.join(dir, "failure.json"), JSON.stringify({ invocationId, error: payload, at: new Date().toISOString() }, null, 2), "utf8");
    return dir;
  }
  async runInvocation(invocationId, prompt) {
    const started = Date.now();
    this.session = new AutomationSession(invocationId);
    this.driver = this.createDriver();
    try {
      await this.driver.start();
      await this.driver.openTarget(this.target);
      await this.driver.submitPrompt(prompt);
      const done = await this.driver.waitForResponse(this.timeoutMs);
      const text = done ? await this.driver.extractResponse() : "";
      return AutomationResult.ok(invocationId, text, { tookMs: Date.now() - started });
    } catch (e) {
      const err = e instanceof AutomationError ? e : new AutomationError("AUTOMATION_EXTRACTION_FAILED", e.message);
      const dir = await this.saveArtifacts(invocationId, err);
      err.artifactDir = dir;
      return AutomationResult.fail(invocationId, err, { artifactDir: dir, tookMs: Date.now() - started });
    } finally {
      await this.driver.shutdown().catch(() => {});
    }
  }
  getStatus() { return this.session ? this.session.toJSON() : new AutomationSession().toJSON(); }
}

module.exports = { AutomationController };
