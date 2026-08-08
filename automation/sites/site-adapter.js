/* AI Council v0.1 — WEB_AUTOMATION · SiteAdapter：站点适配器接口契约（方案 §十六/§十七）。
 * 每个站点独立实现，防「ChatGPT 改版 → 全部自动化炸掉」。
 * 定位优先级冻结：ARIA/Role → 语义属性（placeholder/aria-label/contenteditable）→ 结构候选（带上下文验证）。
 * 禁止：body > div:nth-child(...) 这类无语义层级定位。
 * 方法：isCurrentSite / findComposer / fillPrompt / findSendButton / detectGenerating /
 *       detectComplete / extractLatestResponse / healthCheck
 */
"use strict";

/* createSiteAdapter(siteId) → SiteAdapter 实例。当前 PoC 只支持 chatgpt（方案 §八禁止 Claude/Gemini）。 */
function createSiteAdapter(siteId) {
  const map = { chatgpt: () => require("./chatgpt-adapter") };
  const factory = map[siteId];
  if (!factory) throw new Error("不支持的站点适配器：" + siteId + "（PoC 仅 chatgpt）");
  return factory().createAdapter();
}

module.exports = { createSiteAdapter };
