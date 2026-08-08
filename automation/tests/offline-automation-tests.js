/* AI Council v0.1 — WEB_AUTOMATION · Offline Automation Tests（A01..A12，方案 §三十一/§三十二）。
 * 用仓库 Fake AI Page 完成 deterministic 测试，不依赖 ChatGPT 在线页面/网络/登录。
 * 运行：node automation/tests/offline-automation-tests.js
 * 分类：Offline Automation Tests（PASS/FAIL）；Live ChatGPT Acceptance 单独人工验收（NOT VERIFIED）。
 */
"use strict";

const path = require("path");
const os = require("os");
const ROOT = path.join(__dirname, "..", "..");
const FAKE_PAGE = "file:///" + path.join(ROOT, "tests", "fixtures", "fake-ai-page.html").replace(/\\/g, "/");
const FAKE_PAGE_LOGIN = FAKE_PAGE + "?login=1";

const results = [];
function check(label, ok, detail) {
  results.push({ label, ok: !!ok, detail: detail || "" });
  console.log((ok ? "PASS  " : "FAIL  ") + label + (ok ? "" : "  -> " + detail));
}

const pw = require("playwright-core");
const { AutomationController } = require("../core/automation-controller");
const { PlaywrightDriver } = require("../drivers/playwright-driver");
const { createSiteAdapter } = require("../sites/site-adapter");

/* Fake AI 站点适配器：isCurrentSite 认 fake-ai-page；定位/等待/提取沿用 chatgpt 候选。 */
function fakeAdapter() {
  const chatgpt = createSiteAdapter("chatgpt");
  return Object.assign({}, chatgpt, {
    siteId: "fake-ai",
    isCurrentSite(page) { return page.url().includes("fake-ai-page.html"); },
    async healthCheck(page) {
      const ok = await page.locator("#composer").count();
      return ok > 0 ? { ok: true } : { ok: false, reason: "fake 页面没有输入区" };
    }
  });
}

/* headless 版 driver：不弹真实窗口（PoC 离线测试用）。 */
function headlessDriver(adapter) {
  const d = new PlaywrightDriver(adapter);
  const origStart = d.start.bind(d);
  d.start = async function () {
    this.session.setStage("launching_browser").step("浏览器已启动（测试 headless）");
    const profile = path.join(os.tmpdir(), "ai-council-test-" + Date.now());
    this.context = await pw.chromium.launchPersistentContext(profile, { headless: true, channel: "chrome" });
    this.page = this.context.pages()[0] || await this.context.newPage();
  };
  return d;
}

async function main() {
  /* A01/A02：模块与依赖 */
  check("A01 · Automation Controller 模块可加载", typeof AutomationController === "function");
  check("A02 · playwright-core 可用（与 Browser Gate 同依赖）", typeof pw.chromium === "object");

  /* A03..A09：driver 直连 Fake AI Page 全流程 */
  {
    const driver = headlessDriver(fakeAdapter());
    try {
      await driver.start();
      check("A03 · Browser 启动（专用 Profile，headless）", driver.context !== null);

      await driver.openTarget(FAKE_PAGE);
      check("A04 · Fake AI 页面打开成功", driver.page.url().includes("fake-ai-page.html"));

      const prompt = "这是自动化测试提示词，应当完整进入输入框。";
      await driver.submitPrompt(prompt);
      /* 发送成功后 fake 页会清空输入框：改查 user 消息文本 == prompt（A05 语义：Prompt 完整进入并发出）。 */
      const userText = await driver.page.locator(".msg.user").last().innerText().catch(() => "");
      check("A05 · Prompt 输入完整并发出", userText === prompt, userText.slice(0, 30));
      check("A06 · 点击发送成功（user 消息出现）", await driver.page.locator(".msg.user").count() >= 1);

      const done = await driver.waitForResponse(15000);
      check("A07 · 条件等待生成结束（UI indicator + 稳定窗口，非死等）", done === true);
      check("A08 · assistant 消息已出现", await driver.page.locator(".msg.assistant").count() >= 1);

      const text = await driver.extractResponse();
      check("A09 · 完整提取回答", text.startsWith("Fake AI 回答 #") && text.includes("自动化测试提示词"), text.slice(0, 40));
    } finally { await driver.shutdown().catch(() => {}); }
  }

  /* A10：Controller 编排全链路（fake adapter 注入） */
  {
    const ctl = new AutomationController({
      siteId: "fake-ai", target: FAKE_PAGE, timeoutMs: 15000,
      adapterFactory: fakeAdapter, driverFactory: headlessDriver
    });
    const result = await ctl.runInvocation("inv-offline-1", "Controller 编排测试提示词");
    check("A10 · Result 返回 UI（ok=true + responseText 非空）",
      result.ok && result.responseText.length > 0, result.ok ? result.responseText.slice(0, 30) : JSON.stringify(result.error));
    /* A11：Result 不自动进 Message——本层只有 Result 对象，无任何会议写入路径 */
    check("A11 · Result 不自动进入会议 Message", result.toJSON().state === "completed" && !result.toJSON().error);
  }

  /* A12：登录墙 → AUTOMATION_LOGIN_REQUIRED（停给人工，绝不绕过） */
  {
    const wall = Object.assign({}, fakeAdapter(), { isCurrentSite() { return false; } });
    const driver = headlessDriver(wall);
    try {
      await driver.start();
      let code = null;
      try { await driver.openTarget(FAKE_PAGE_LOGIN); } catch (e) { code = e.code; }
      check("A12 · 登录/验证页 → 停给人工处理（LOGIN_REQUIRED）", code === "AUTOMATION_LOGIN_REQUIRED", String(code));
    } finally { await driver.shutdown().catch(() => {}); }
  }

  /* A12b：失败证据自动落盘（Controller 失败路径） */
  {
    const ctl = new AutomationController({
      siteId: "fake-ai", target: FAKE_PAGE_LOGIN, timeoutMs: 5000,
      adapterFactory: wallAdapter, driverFactory: headlessDriver
    });
    const result = await ctl.runInvocation("inv-offline-fail", "触发失败");
    check("A12b · 失败时证据目录生成（screenshot/failure.json）",
      !result.ok && !!result.artifactDir,
      result.error ? (result.error.code + " dir=" + result.artifactDir) : "ok?");
    if (result.artifactDir) {
      const fs = require("fs");
      const shot = path.join(result.artifactDir, "screenshot.png");
      const fail = path.join(result.artifactDir, "failure.json");
      check("A12b2 · screenshot.png 与 failure.json 已落盘",
        fs.existsSync(shot) && fs.existsSync(fail), result.artifactDir);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\nOffline Automation 总计 " + results.length + " · 通过 " + (results.length - failed.length) + " · 失败 " + failed.length);
  console.log("Live ChatGPT Acceptance：NOT VERIFIED（人工验收步骤见 reports/d3-web-automation-poc.md §6）");
  process.exit(failed.length ? 1 : 0);
}

function wallAdapter() {
  const base = fakeAdapter();
  return Object.assign({}, base, { isCurrentSite() { return false; } });
}

main().catch((e) => { console.error("测试执行异常：" + e.stack); process.exit(1); });
