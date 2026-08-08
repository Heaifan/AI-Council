/* AI Council v0.1 — WEB_AUTOMATION · ChatGptSiteAdapter：ChatGPT 站点适配器（PoC 唯一站点，方案 §十六/§十七）。
 * 定位优先级：getByRole('textbox') → contenteditable=true → placeholder 语义候选 → 结构候选（带可见/尺寸验证）。
 * 健康机制：找到 ≠ 一定正确，全部候选须 visible/editable 且尺寸合理（方案 §三十四）。
 * 生成结束判定（方案 §二十三）：Stop 按钮消失（UI indicator）+ 最后回答文本 1.5s 稳定窗口（双保险，禁死等）。
 */
"use strict";

const { AutomationError } = require("../core/automation-errors");

const COMPOSER_CANDIDATES = [
  (page) => page.getByRole("textbox").first(),
  (page) => page.locator("div[contenteditable='true']").first(),
  (page) => page.locator("textarea").first()
];

const SEND_CANDIDATES = [
  (page) => page.getByRole("button", { name: /send|发送/i }).first(),
  (page) => page.locator("button[data-testid*='send']").first(),
  (page) => page.locator("form button[type='submit']").first()
];

async function pick(page, candidates, what) {
  let lastErr = null;
  for (const make of candidates) {
    try {
      const loc = make(page);
      if (await loc.count() === 0) continue;
      if (!(await loc.isVisible())) continue;
      const box = await loc.boundingBox();
      if (!box || box.width < 20 || box.height < 10) continue;   // 尺寸合理验证
      return loc;
    } catch (e) { lastErr = e; }
  }
  throw new AutomationError("AUTOMATION_COMPOSER_NOT_FOUND", what + "（已尝试 " + candidates.length + " 类候选）");
}

function createAdapter() {
  return {
    siteId: "chatgpt",
    isCurrentSite(page) { return page.url().includes("chatgpt.com") || page.url().includes("chat.openai.com"); },
    async findComposer(page) { return pick(page, COMPOSER_CANDIDATES, "输入框"); },
    async fillPrompt(page, prompt) {
      const composer = await this.findComposer(page);
      await composer.click();
      await composer.fill(prompt);
      return true;
    },
    async findSendButton(page) { return pick(page, SEND_CANDIDATES, "发送按钮"); },
    async detectGenerating(page) {
      /* 生成中：Stop 按钮可见（aria-label 含 stop，或 button 文案为方框图标）。 */
      const stop = page.locator("button[aria-label*='stop' i], button[aria-label*='停止' i], button[data-testid*='stop']").first();
      return stop.isVisible().catch(() => false);
    },
    async detectComplete(page) {
      /* UI indicator 消失 = 完成信号（再加文本稳定窗口在 Driver 侧双保险）。 */
      const stop = page.locator("button[aria-label*='stop' i], button[aria-label*='停止' i], button[data-testid*='stop']").first();
      return !(await stop.isVisible().catch(() => false));
    },
    async extractLatestResponse(page) {
      const blocks = page.locator("div[data-message-author-role='assistant']");
      if (await blocks.count() === 0) {
        const text = await page.locator("main").innerText().catch(() => "");
        if (!text || text.trim().length < 2) throw new AutomationError("AUTOMATION_RESPONSE_EMPTY", "未找到 assistant 回答");
        return text.trim();
      }
      const last = blocks.last();
      const text = (await last.innerText().catch(() => "")).trim();
      if (!text) throw new AutomationError("AUTOMATION_RESPONSE_EMPTY", "最后一条回答为空");
      return text;
    },
    async healthCheck(page) {
      const visible = await page.locator("main").count();
      return visible > 0 ? { ok: true } : { ok: false, reason: "页面没有 main 内容" };
    }
  };
}

module.exports = { createAdapter };
