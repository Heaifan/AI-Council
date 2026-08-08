/* AI Council v0.1 — WEB_AUTOMATION · PlaywrightDriver：主路径驱动器（方案 §十四/§二十二/§二十三）。
 * launchPersistentContext + AI-Council 专用 Profile；禁止 connectOverCDP 控制日常 Chrome（后续可选）。
 * 生成结束 = UI indicator（Stop 消失）+ 文本稳定窗口 1.5s 双保险；全程条件等待，无死等。
 * 登录/验证码/机器人检查：一律停下交人工处理，绝不自动绕过（方案 §二十五）。
 */
"use strict";

const { AutomationError } = require("../core/automation-errors");
const { AutomationSession } = require("../core/automation-session");
const { ensureProfileDir } = require("../browser/browser-profile");

class PlaywrightDriver {
  constructor(siteAdapter) {
    this.adapter = siteAdapter;
    this.session = new AutomationSession();
    this.browser = null; this.context = null; this.page = null; this._pw = null;
  }
  async start() {
    this.session.setStage("launching_browser").step("启动专用浏览器…");
    try {
      this._pw = require("playwright-core");
      const profile = ensureProfileDir();
      this.context = await this._pw.chromium.launchPersistentContext(profile, {
        headless: false, viewport: null, channel: "chrome"
      });
      this.browser = this.context.browser();
      this.page = this.context.pages()[0] || await this.context.newPage();
      this.session.step("浏览器已启动（专用 Profile：" + profile + "）");
    } catch (e) {
      throw new AutomationError("AUTOMATION_BROWSER_START_FAILED", e.message);
    }
  }
  async openTarget(target) {
    this.session.setStage("opening_target").step("打开目标页面…");
    await this.page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });
    const url = this.page.url();
    /* 登录墙 / 验证页：停给用户，不自动处理（方案 §二十五）。 */
    if (/login|auth|signin|challenge|verify/i.test(url) && !this.adapter.isCurrentSite(this.page)) {
      throw new AutomationError("AUTOMATION_LOGIN_REQUIRED", "当前在 " + url + "，请在自动化浏览器中完成登录/验证后重试");
    }
    if (!this.adapter.isCurrentSite(this.page)) {
      throw new AutomationError("AUTOMATION_TARGET_NOT_FOUND", "打开后不在目标站点：" + url);
    }
    const h = await this.adapter.healthCheck(this.page);
    if (!h.ok) throw new AutomationError("AUTOMATION_TARGET_NOT_FOUND", h.reason);
    this.session.step("页面已打开：" + url);
  }
  async submitPrompt(prompt) {
    this.session.setStage("locating_input").step("定位输入区…");
    await this.adapter.fillPrompt(this.page, prompt);
    this.session.setStage("submitting").step("Prompt 已写入，点击发送…");
    const send = await this.adapter.findSendButton(this.page);
    try {
      await send.click({ timeout: 15000 });
    } catch (e) {
      throw new AutomationError("AUTOMATION_SEND_FAILED", e.message);
    }
    this.session.step("Prompt 已发送");
  }
  async waitForResponse(timeoutMs) {
    this.session.setStage("waiting_response").step("等待 AI 回答…");
    const deadline = Date.now() + (timeoutMs || 120000);
    let lastText = "";
    let stableSince = 0;
    while (Date.now() < deadline) {
      const generating = await this.adapter.detectGenerating(this.page).catch(() => true);
      if (!generating) {
        const text = await this.adapter.extractLatestResponse(this.page).catch(() => "");
        if (text && text === lastText && text.length > 2) {
          if (!stableSince) stableSince = Date.now();
          else if (Date.now() - stableSince >= 1500) {   // 1.5s 稳定窗口
            this.session.setStage("extracting").step("回答已稳定，提取结果…");
            return true;
          }
        } else if (text) { lastText = text; stableSince = 0; }
      } else { stableSince = 0; }
      await this._sleep(400);
    }
    throw new AutomationError("AUTOMATION_RESPONSE_TIMEOUT", "等待 " + (timeoutMs || 120000) + "ms 无稳定回答");
  }
  async extractResponse() {
    this.session.setStage("extracting");
    const text = await this.adapter.extractLatestResponse(this.page);
    this.session.setStage("completed").step("已提取回答");
    return text;
  }
  async cancel() {
    this.session.setStage("cancelled").fail("AUTOMATION_CANCELLED", "自动化已取消");
  }
  getStatus() { return this.session.toJSON(); }
  async shutdown() {
    try { if (this.context) await this.context.close(); } catch (e) { /* 忽略关闭异常 */ }
    this.context = null; this.browser = null; this.page = null;
  }
  _sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }
}

module.exports = { PlaywrightDriver };
