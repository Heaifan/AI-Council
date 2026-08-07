/* AI Council v0.1 — D1-R3
 * MockAgentRuntime：仅用于开发期测试桩。
 * 它不是一个 AI：收到 collect_responses 动作后，只为每个要求的参与者生成固定占位 Result 并回填。
 * 它不理解 Role、不生成论点、不评分、不 Battle、不总结。真实模型执行层属于后续 Compiler / Transport 集成。
 */
(function (root) {
  "use strict";

  var ACTION = root.AICouncil.MeetingAction.ACTION;

  /* 对当前 collect_responses 动作，为所有要求的参与者各提交一次 mock 响应。
   * 若完成条件为 any_selected_respond（need=1），首条响应即触发 transition，
   * 因此循环中对“pendingAction 是否仍指向同一 phase”做防御，避免向已切换的 phase 误投。 */
  function runOnce(runtime, meeting, protocol) {
    var pa = meeting.pendingAction;
    if (!pa || pa.action_type !== ACTION.COLLECT_RESPONSES) return false;
    var ids = pa.requiredParticipantIds.slice();
    for (var i = 0; i < ids.length; i++) {
      var cur = meeting.pendingAction;
      if (!cur || cur.action_type !== ACTION.COLLECT_RESPONSES || cur.phaseId !== pa.phaseId) break;
      runtime.submitResult(meeting, protocol, {
        participant_id: ids[i],
        payload: { mock: true, phaseId: pa.phaseId, participantId: ids[i] }
      });
    }
    return true;
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MockAgentRuntime = Object.freeze({ runOnce: runOnce });
})(typeof globalThis !== "undefined" ? globalThis : this);
