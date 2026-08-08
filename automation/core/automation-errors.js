/* AI Council v0.1 — WEB_AUTOMATION · AutomationErrors：自动化错误模型（用户方案 §二十八）。
 * 错误必须携带：机器代码 + 中文说明 + 当前阶段 + 截图证据路径（证据由 Controller 落盘后回填）。
 */
"use strict";

const CODES = {
  AUTOMATION_BROWSER_START_FAILED: { zh: "自动化浏览器启动失败", stage: "launching_browser" },
  AUTOMATION_LOGIN_REQUIRED: { zh: "需要人工处理：请在自动化浏览器中完成登录或验证", stage: "opening_target" },
  AUTOMATION_TARGET_NOT_FOUND: { zh: "目标页面不可用", stage: "opening_target" },
  AUTOMATION_COMPOSER_NOT_FOUND: { zh: "找不到 AI 输入区域", stage: "locating_input" },
  AUTOMATION_SEND_FAILED: { zh: "发送失败", stage: "submitting" },
  AUTOMATION_RESPONSE_TIMEOUT: { zh: "等待 AI 回答超时", stage: "waiting_response" },
  AUTOMATION_RESPONSE_EMPTY: { zh: "AI 没有返回内容", stage: "extracting" },
  AUTOMATION_EXTRACTION_FAILED: { zh: "回答提取失败", stage: "extracting" },
  AUTOMATION_CHALLENGE_DETECTED: { zh: "检测到验证/机器人检查，请人工处理", stage: "opening_target" },
  AUTOMATION_CANCELLED: { zh: "自动化已取消", stage: "cancelled" }
};

class AutomationError extends Error {
  constructor(code, detail, extra) {
    const meta = CODES[code] || { zh: "自动化未知错误", stage: "unknown" };
    super(meta.zh + (detail ? "：" + detail : ""));
    this.name = "AutomationError";
    this.code = code;
    this.zh = meta.zh;
    this.stage = meta.stage;
    this.detail = detail || "";
    this.artifactDir = (extra && extra.artifactDir) || null;
  }
  toJSON() {
    return {
      code: this.code, zh: this.zh, stage: this.stage,
      detail: this.detail, artifactDir: this.artifactDir
    };
  }
}

module.exports = { CODES, AutomationError };
