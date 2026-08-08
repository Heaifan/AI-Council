/* AI Council v0.1 — WEB_AUTOMATION · AutomationResult：一次自动化的结果（用户方案 §十五/§二十二）。
 * 成功：ok=true + state=completed + responseText（已提取的外部 AI 回答，未经校验）。
 * 失败：ok=false + error（AutomationError 结构）。Result 永远不能自动写入会议事实。
 */
"use strict";

class AutomationResult {
  constructor(opts) {
    this.invocationId = opts.invocationId || ("inv-" + Date.now());
    this.ok = !!opts.ok;
    this.state = opts.state || (opts.ok ? "completed" : "failed");
    this.responseText = opts.responseText || "";
    this.error = opts.error || null;
    this.artifactDir = opts.artifactDir || null;
    this.tookMs = opts.tookMs || 0;
  }
  toJSON() {
    return {
      invocationId: this.invocationId, ok: this.ok, state: this.state,
      responseText: this.responseText, error: this.error, artifactDir: this.artifactDir, tookMs: this.tookMs
    };
  }
}

AutomationResult.ok = function (invocationId, responseText, extra) {
  return new AutomationResult({ ok: true, invocationId, responseText, artifactDir: extra && extra.artifactDir, tookMs: extra && extra.tookMs });
};
AutomationResult.fail = function (invocationId, error, extra) {
  return new AutomationResult({ ok: false, invocationId, error: error && error.toJSON ? error.toJSON() : error, artifactDir: extra && extra.artifactDir, tookMs: extra && extra.tookMs });
};

module.exports = { AutomationResult };
