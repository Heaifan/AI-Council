/* AI Council v0.1 — WEB_AUTOMATION · AutomationSession：一次自动化调用的会话状态（方案 §二十四）。
 * 状态机：idle → launching_browser → opening_target → locating_input → submitting
 *         → waiting_response → extracting → completed
 * 异常终态：login_required / locator_not_found / response_timeout / browser_crashed /
 *          challenge_detected / cancelled（均落 errorCode 并保留中文说明）。
 */
"use strict";

const STAGES = [
  "idle", "launching_browser", "opening_target", "locating_input",
  "submitting", "waiting_response", "extracting", "completed"
];

class AutomationSession {
  constructor(invocationId) {
    this.invocationId = invocationId || ("inv-" + Date.now());
    this.stage = "idle";
    this.errorCode = null;
    this.errorZh = null;
    this.steps = [];           // 进度记录（UI 展示：✓ 浏览器已启动 / ● 等待 AI 回答 …）
  }
  setStage(stage) {
    this.stage = STAGES.indexOf(stage) >= 0 ? stage : this.stage;
    return this;
  }
  fail(code, zh) {
    this.errorCode = code;
    this.errorZh = zh;
    this.stage = "failed";
    return this;
  }
  step(text) {
    this.steps.push({ at: new Date().toISOString(), text });
    return this;
  }
  toJSON() {
    return {
      invocationId: this.invocationId, stage: this.stage,
      errorCode: this.errorCode, errorZh: this.errorZh, steps: this.steps
    };
  }
}

module.exports = { AutomationSession, STAGES };
