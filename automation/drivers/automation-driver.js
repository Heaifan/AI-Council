/* AI Council v0.1 — WEB_AUTOMATION · AutomationDriver：驱动器接口契约（方案 §十五）。
 * 上层（WebAutomationTransport / Controller）只能依赖本接口，禁止直接 require("playwright")。
 * 实现：PlaywrightDriver（主路径）/ YingDaoDriver（仅当可行性审计通过）/ VisualDriver（fallback 占位）。
 * 方法：start / openTarget / submitPrompt / waitForResponse / extractResponse /
 *       cancel / getStatus / shutdown
 */
"use strict";

/* 接口字段（约定，供实现遵守）：
 *   start()                       → Promise<void>            启动浏览器（launchPersistentContext + 专用 Profile）
 *   openTarget(target)            → Promise<void>            打开目标站点 URL；检测登录/验证（login_required / challenge_detected）
 *   submitPrompt(prompt)          → Promise<void>            定位输入区 → 写入 → 点击发送（composer_not_found / send_failed）
 *   waitForResponse(timeoutMs)    → Promise<boolean>         条件等待生成结束（UI indicator + 文本稳定窗口，禁死等）
 *   extractResponse()             → Promise<string>          提取最后一条 assistant 回答（response_empty / extraction_failed）
 *   cancel()                      → Promise<void>            取消本次调用（cancelled）
 *   getStatus()                   → { stage, errorCode, errorZh }
 *   shutdown()                    → Promise<void>            关闭浏览器（不清理 Profile）
 */
module.exports = { INTERFACE: true };
