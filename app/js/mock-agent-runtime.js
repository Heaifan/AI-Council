/* AI Council v0.1 — D1-R3
 * MockAgentRuntime：仅用于开发期测试桩。
 * 它不是一个 AI：收到 collect_responses 动作后，只为每个要求的参与者生成固定占位 Result 并回填。
 * 它不理解 Role、不生成论点、不评分、不 Battle、不总结。真实模型执行层属于后续 Compiler / Transport 集成。
 */
(function (root) {
  "use strict";

  var ACTION = root.AICouncil.MeetingAction.ACTION;
  var Log = root.AICouncil.MeetingEventLog;

  /* F1-C：mock 提交也落库 Formal Message（extensions.mock=true，无 provenance）——完成依据统一为正式消息。 */
  function mockMessage(meeting, pid) {
    var p = (meeting.participants || []).filter(function (x) { return x.participant_id === pid; })[0] || {};
    var msg = {
      schema_version: "0.1.0",
      message_id: "msg-mock-" + meeting.meetingId + "-" + meeting.currentPhaseId + "-" + pid,
      meeting_id: meeting.meetingId,
      phase_id: meeting.currentPhaseId,
      sender: { actor_type: p.actor_type || "agent", actor_id: pid, role_id: p.role_id || null, alias: p.alias || pid },
      recipients: { scope: "meeting" },
      content: { raw_text: "（模拟回答 " + pid + "）", content_type: "text" },
      validation: { status: "valid", errors: [] },
      accepted_by_runtime: true,
      request_id: null, result_id: null,
      created_at: Log.now(),
      extensions: { mock: true, turn: (meeting.pendingAction && meeting.pendingAction.phase_entry) || 1 }
    };
    /* F2-B1：battle_round 仅 Battle 使用（Runtime-owned，非 Battle 阶段不写） */
    if (meeting.pendingAction && typeof meeting.pendingAction.battle_round === "number")
      msg.extensions.battle_round = meeting.pendingAction.battle_round;
    return msg;
  }
  function commitMock(meeting, pid) {
    var MC = root.AICouncil.MessageCommit;
    if (MC && meeting) MC.commit(meeting, mockMessage(meeting, pid));
  }

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
      commitMock(meeting, ids[i]);   /* F1-C：mock 响应落库正式消息 */
    }
    /* F1（修正 3）：响应收齐后停在 READY_TO_ADVANCE；测试辅助自动模拟「进入下一阶段」继续（正式 UI 不自动）。 */
    var TS = root.AICouncil.MeetingTurnSelector;
    if (TS && TS.phaseStatus(meeting, protocol) === "ready_to_advance") {
      var ad = runtime.advancePhase(meeting, protocol);
      if (ad && ad.ok) return runOnce(runtime, meeting, protocol);
    }
    return true;
  }

  /* D2-F1 —「执行下一步 Mock」的唯一语义：只消费当前 Pending Action 的一个确定性步骤。
   * 即：为 requiredParticipantIds 中第一个尚未响应的参与者提交一次 Mock 响应，然后立即停手。
   * 绝不循环、绝不自动越过 Human Gate（await_human_decision 一律拒绝，交回人工按钮）。 */
  function stepOnce(runtime, meeting, protocol) {
    var pa = meeting && meeting.pendingAction;
    if (!pa) return { ok: false, reason: "no_pending_action", message: "当前没有待办动作（会议可能已结束或失败）。" };
    if (pa.action_type === ACTION.AWAIT_HUMAN_DECISION) {
      return { ok: false, reason: "human_gate",
        message: "当前停在 Human Gate，Mock 不得替人类决策，请点击 Finish / Continue / Battle。" };
    }
    if (pa.action_type !== ACTION.COLLECT_RESPONSES) {
      return { ok: false, reason: "unsupported_action", message: "不支持的待办动作类型：" + String(pa.action_type) + "。" };
    }
    var next = null;
    /* F1：调度目标 = activeSpeaker 优先（撤回后保持当前轮），否则 roster 序 pending 首位。 */
    var TS = root.AICouncil.MeetingTurnSelector;
    var target = TS ? TS.nextTarget(meeting) : null;
    if (target && pa.receivedParticipantIds.indexOf(target) < 0) next = target;
    if (next === null) {
      for (var i = 0; i < pa.requiredParticipantIds.length && next === null; i++) {
        var id = pa.requiredParticipantIds[i];
        if (pa.receivedParticipantIds.indexOf(id) < 0) next = id;
      }
    }
    if (next === null) return { ok: false, reason: "no_pending_participant", message: "当前 Pending Action 的响应已收齐。" };

    var phaseId = pa.phaseId;
    var r = runtime.submitResult(meeting, protocol, {
      participant_id: next, payload: { mock: true, phaseId: phaseId, participantId: next }
    });
    if (!r.ok) return { ok: false, reason: "submit_failed", message: r.diagnostic.message, diagnostic: r.diagnostic };
    commitMock(meeting, next);   /* F1-C：mock 响应落库正式消息（slot satisfied 统一依据） */
    return { ok: true, participantId: next, phaseId: phaseId };
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MockAgentRuntime = Object.freeze({ runOnce: runOnce, stepOnce: stepOnce, mockMessage: mockMessage });
})(typeof globalThis !== "undefined" ? globalThis : this);
