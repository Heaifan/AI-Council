/* AI Council v0.1 — MEETING-REPLAY-F1 · MeetingReplay：会议时间轴 / 只读回放模型（无 DOM，Node 可测）。
 * T01/T03：历史不可变，Timeline 只读；Node 只记 event_cursor，Replay State = events[0..cursor-1] 派生，
 * 不复制整份 Meeting（T02 两级：Round=phase_entered → Step=agent_output_received/human_decision/…）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;

  var KIND_LABELS = {
    phase_entered: "进入阶段", agent_output_received: "已发言", human_decision: "人工裁定",
    phase_completed: "阶段完成", meeting_started: "会议开始", meeting_completed: "会议完成",
    meeting_failed: "会议失败", checkpoint_created: "检查点" };

  /* T02：构建两级时间轴。nodes[0] 恒为「会议创建」。 */
  function buildTimeline(meeting, protocol) {
    var nodes = [{ sequence: 0, round: 0, phase_id: null, kind: "created", label: "会议创建", event_cursor: 0, timestamp: null }];
    var events = (meeting && meeting.events) || [];
    var round = 0;
    events.forEach(function (ev, i) {
      var cursor = i + 1;
      var base = { sequence: nodes.length, event_cursor: cursor, timestamp: ev.occurred_at, phase_id: ev.phase_id };
      switch (ev.event_type) {
        case "phase_entered":
          round += 1;
          nodes.push(Object.assign({}, base, { round: round, kind: "phase", label: (ev.payload && ev.payload.phase_name) || (ev.phase_id || "新阶段") }));
          break;
        case "agent_output_received":
          nodes.push(Object.assign({}, base, { round: round, kind: "step", label: (ev.actor_id || "?") + " 已发言", participant_id: ev.actor_id || null })); break;
        case "human_decision":
          nodes.push(Object.assign({}, base, { round: round, kind: "decision", label: "人工裁定：" + ((ev.payload && ev.payload.choice) || "?") })); break;
        case "phase_completed":
          nodes.push(Object.assign({}, base, { round: round, kind: "phase-done", label: (ev.phase_id || "?") + " 完成" })); break;
        case "meeting_completed":
          nodes.push(Object.assign({}, base, { round: round, kind: "end", label: "会议完成" })); break;
        case "meeting_failed":
          nodes.push(Object.assign({}, base, { round: round, kind: "end", label: "会议失败" })); break;
        default:
          nodes.push(Object.assign({}, base, { round: round, kind: ev.event_type, label: (KIND_LABELS[ev.event_type] || ev.event_type) })); break;
      }
    });
    return nodes;
  }

  /* 简化参与者解析：与 MeetingRuntime.resolveParticipants 规则一致（selected_participants 用 live stateData，battle 字段写入后稳定）。 */
  function resolveRequired(phase, meeting) {
    var parts = (meeting && meeting.participants) || [];
    var act = phase && phase.actor;
    if (!act) return [];
    var ids = [];
    function of(pred) { return parts.filter(pred).map(function (p) { return p.participant_id; }); }
    switch (act.selector) {
      case "all_advisors": ids = of(function (p) { return p.role_class === "advisor"; }); break;
      case "side": ids = of(function (p) { return p.side_id === act.side_id; }); break;
      case "role_class": ids = of(function (p) { return p.role_class === act.role_class; }); break;
      case "participant_ids": ids = (act.participant_ids || []).slice(); break;
      case "selected_participants": ids = ((meeting.stateData && meeting.stateData[act.selection_key]) || []).slice(); break;
      default: ids = [];
    }
    return ids;
  }

  /* T03/T04：Replay State = events[0..cursor-1] 派生（meeting-shaped 只读视图，供全部 UI 组件统一消费）。 */
  function replayStateAt(meeting, protocol, cursor) {
    var events = (meeting && meeting.events) || [];
    var n = Math.max(0, Math.min(cursor, events.length));
    var spoken = [], phaseId = null, round = 0, status = null, phaseDone = false, timestamp = null;
    for (var i = 0; i < n; i++) {
      var ev = events[i];
      timestamp = ev.occurred_at;
      if (ev.event_type === "phase_entered") { phaseId = ev.phase_id; round += 1; phaseDone = false; status = "running"; }
      else if (ev.event_type === "agent_output_received" && spoken.indexOf(ev.actor_id) < 0) spoken.push(ev.actor_id);
      else if (ev.event_type === "agent_output_revoked") { var ri = spoken.indexOf(ev.actor_id); if (ri >= 0) spoken.splice(ri, 1); }
      else if (ev.event_type === "phase_completed") phaseDone = true;
      else if (ev.event_type === "meeting_completed") status = "completed";
      else if (ev.event_type === "meeting_failed") status = "failed";
      else if (ev.event_type === "meeting_started" && !status) status = "running";
    }
    var pm = protocol && A.MeetingFactory ? A.MeetingFactory.buildPhaseMap(protocol.document || protocol) : null;
    var phase = pm && phaseId ? pm[phaseId] : null;
    var required = phase ? resolveRequired(phase, meeting) : [];
    var received = spoken.filter(function (id) { return required.indexOf(id) >= 0; });
    var pending = null;
    if (phase && !phaseDone) {
      if (phase.kind === "human_gate") {
        pending = { action_type: "await_human_decision", phaseId: phaseId, choices: ((phase.transitions || []).filter(function (t) { return t.trigger === "human_choice"; }).map(function (t) { return t.choice; })) };
      } else if (required.length) {
        pending = { action_type: "collect_responses", phaseId: phaseId, requiredParticipantIds: required.slice(), receivedParticipantIds: received.slice() };
      }
    }
    return {
      cursor: n, isReplay: n < events.length, phase_id: phaseId, round: round, status: status,
      phase_done: phaseDone, spoken: spoken, required: required, received: received,
      pending_action: pending, timestamp: timestamp
    };
  }

  A.MeetingReplay = Object.freeze({ buildTimeline: buildTimeline, replayStateAt: replayStateAt, resolveRequired: resolveRequired });
})(typeof globalThis !== "undefined" ? globalThis : this);
