/* AI Council v0.1 — D1-R3
 * MeetingAction：Runtime 对外暴露的“待办动作”结构。
 * Runtime 只声明“外界需要完成什么”，绝不生成 Prompt（那是 D2 Instruction Compiler 的职责）。
 */
(function (root) {
  "use strict";

  var ACTION = Object.freeze({
    COLLECT_RESPONSES: "collect_responses",
    AWAIT_HUMAN_DECISION: "await_human_decision"
  });

  /* 收集一组参与者的响应（agent_turn / critique / battle / secretary_summary 共用） */
  function collectResponses(phaseId, requiredParticipantIds) {
    return {
      action_type: ACTION.COLLECT_RESPONSES,
      phaseId: phaseId,
      requiredParticipantIds: requiredParticipantIds.slice(),
      receivedParticipantIds: []
    };
  }

  /* 等待人类仲裁者决策（human_gate 使用） */
  function awaitHumanDecision(phaseId, choices) {
    return {
      action_type: ACTION.AWAIT_HUMAN_DECISION,
      phaseId: phaseId,
      choices: (choices || []).slice()
    };
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingAction = Object.freeze({
    ACTION: ACTION,
    collectResponses: collectResponses,
    awaitHumanDecision: awaitHumanDecision
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
