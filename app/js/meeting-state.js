/* AI Council v0.1 — D1-R3
 * MeetingState：会议运行时的不可变状态常量与最小状态操作。
 * 只描述“会议现在在哪里、下一步允许什么”，不推进、不解析 Protocol、不接 LLM。
 * D1-R3 不建立完整 Persistence 数据模型（那是 D1-R4 的事）。
 */
(function (root) {
  "use strict";

  var D = root.AICouncil && root.AICouncil.Diagnostic;

  var STATUS = Object.freeze({
    INITIALIZED: "initialized",
    RUNNING: "running",
    WAITING_HUMAN: "waiting_human",
    PAUSED: "paused",
    COMPLETED: "completed",
    FAILED: "failed"
  });

  function makeDiagnostic(code, message, details, jsonPath) {
    return D.create({
      code: code,
      message: message,
      details: details || null,
      jsonPath: jsonPath || null,
      meetingId: null
    });
  }

  /* 不可恢复的 Runtime 内部错误：标记 failed、清空 pending、记录最后错误。不抛崩溃。 */
  function markFailed(meeting, code, message, details) {
    meeting.status = STATUS.FAILED;
    meeting.pendingAction = null;
    meeting.error = makeDiagnostic(code, message, details);
    return meeting.error;
  }

  /* 记录 phase 完成。completedPhaseIds 是“至少完成过一次”的唯一列表（Set 语义），
   * 不表达轮次，因此绝不阻止会议重新进入曾经完成过的 phase（合法循环）。 */
  function recordCompletion(meeting, phaseId) {
    if (meeting.completedPhaseIds.indexOf(phaseId) < 0) meeting.completedPhaseIds.push(phaseId);
  }

  function isActive(meeting) {
    return meeting.status === STATUS.RUNNING || meeting.status === STATUS.WAITING_HUMAN;
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingState = Object.freeze({
    STATUS: STATUS,
    makeDiagnostic: makeDiagnostic,
    markFailed: markFailed,
    recordCompletion: recordCompletion,
    isActive: isActive
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
