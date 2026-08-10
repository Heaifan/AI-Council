/* AI Council v0.1 — D2-F1 · MeetingStepFlow：Harness 会议步进流程（无 DOM）。
 * 三条硬规则：Create Demo 绝不预跑；一次点击只消费一个步骤；Human Gate 只认人工点击。 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var STATUS = A.MeetingState.STATUS;
  var ACTION = A.MeetingAction.ACTION;

  /* Demo 参与者：Chair 故意声明一个 roles/ 中不存在的 role_id，界面上展示 role_id 未命中→按 role_class 回退。 */
  function demoParticipants() {
    return [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1", role_id: "strategic-advocate" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1", role_id: "risk-challenger" },
      { participant_id: "chair-secretary-1", role_class: "chair_secretary", side_id: null, actor_type: "chair", alias: "Chair", role_id: "neutral-chair-secretary" }
    ];
  }

  function createDemo(protocol, meetingId) {
    if (!protocol) return { ok: false, message: "没有可用的 Protocol，无法创建会议。" };
    var m = A.MeetingFactory.createMeeting(protocol, {
      meetingId: meetingId || ("demo-" + Date.now().toString(36)),
      participants: demoParticipants()
    });
    if (m.status === STATUS.FAILED) return { ok: false, message: m.error ? m.error.message : "会议创建失败。" };
    var r = A.MeetingRuntime.start(m, protocol);
    if (!r.ok) return { ok: false, message: r.diagnostic ? r.diagnostic.message : "会议启动失败。" };
    m.stateData = m.stateData || {}; m.stateData.preflight_confirmed = true; m.stateData.dev_mode = true;   /* F1：demo=开发测试模式 */
    return { ok: true, meeting: m };
  }

  /* step 路由判定下沉到 RelayFlow.routeStep：web_relay 参与者必须停下交人工（绝不自动替外部 AI 推进）。 */
  function step(meeting, protocol) {
    var route = A.RelayFlow.routeStep(meeting);
    if (route && route.auto === false)
      return { ok: false, reason: "web_relay", message: route.message, participantId: route.participantId };
    return A.MockAgentRuntime.stepOnce(A.MeetingRuntime, meeting, protocol);
  }

  /* Human Gate 按钮启用规则：仅当 status = waiting_human 且当前动作确为 await_human_decision。 */
  function humanGateState(meeting) {
    var pa = meeting && meeting.pendingAction;
    var waiting = !!meeting && meeting.status === STATUS.WAITING_HUMAN &&
      !!pa && pa.action_type === ACTION.AWAIT_HUMAN_DECISION;
    return { enabled: waiting, phaseId: waiting ? pa.phaseId : null, choices: waiting ? pa.choices.slice() : [] };
  }

  /* battle 相位 actor=selected_participants(battle_participants)：D2-F1 确定性默认全部 advisor 升序，如实告知。 */
  function ensureBattleSelection(meeting) {
    var sd = meeting.stateData || (meeting.stateData = {});
    if (Array.isArray(sd.battle_participants) && sd.battle_participants.length) return null;
    sd.battle_participants = meeting.participants
      .filter(function (p) { return p.role_class === "advisor"; })
      .map(function (p) { return p.participant_id; }).sort();
    return sd.battle_participants.length ? null : "会议中没有 advisor，无法进入 Battle。";
  }

  function decide(meeting, protocol, choice) {
    var gate = humanGateState(meeting);
    if (!gate.enabled) return { ok: false, message: "当前不是 Human Gate，不接受人工决策。" };
    if (gate.choices.indexOf(choice) < 0) return { ok: false, message: "非法 choice：" + String(choice) + "。" };
    var note = null;
    if (choice === "battle") {
      var err = ensureBattleSelection(meeting);
      if (err) return { ok: false, message: err };
      note = "Battle 参与者 = " + meeting.stateData.battle_participants.join(", ") + "（Harness 确定性默认）。";
    }
    var r = A.MeetingRuntime.submitHumanDecision(meeting, protocol, { choice: choice });
    if (!r.ok) return { ok: false, message: r.diagnostic ? r.diagnostic.message : "决策提交失败。" };
    return { ok: true, choice: choice, note: note };
  }

  /* Meeting Tab 的只读投影（视图不得自行从 meeting 里翻字段拼语义）。 */
  function summary(meeting) {
    if (!meeting) return null;
    var pa = meeting.pendingAction;
    return {
      meetingId: meeting.meetingId,
      protocol: meeting.protocolId + "@" + meeting.protocolVersion,
      status: meeting.status,
      currentPhaseId: meeting.currentPhaseId,
      events: (meeting.events || []).length,
      checkpoints: (meeting.checkpoints || []).length,
      pending: pa ? {
        type: pa.action_type, phaseId: pa.phaseId,
        required: (pa.requiredParticipantIds || []).slice(),
        received: (pa.receivedParticipantIds || []).slice(),
        choices: (pa.choices || []).slice()
      } : null,
      error: meeting.error ? meeting.error.message : null
    };
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingStepFlow = Object.freeze({
    demoParticipants: demoParticipants, createDemo: createDemo, step: step,
    humanGateState: humanGateState, decide: decide, summary: summary
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
