/* AI Council v0.1 — D1-R3
 * MeetingRuntime：确定性会议状态机 / Phase 运行时。
 *
 * 职责边界（严格遵守，不越界到 D1-R4 / D2）：
 *  - 只读 Protocol，写 Meeting State；绝不修改 Protocol、绝不自动修复。
 *  - 不接 LLM、不生成 Prompt（只输出“需要谁响应 / 等待人类决策”）。
 *  - 完全确定性：相同 Protocol + 相同 State + 相同输入 → 相同结果。
 *  - 非法输入 / 内部不一致 → meeting.status = failed，返回结构化错误，不抛崩溃。
 *  - 复杂度目标 O(P + T)，使用显式 stack/Set，不递归。
 */
(function (root) {
  "use strict";

  var MS = root.AICouncil.MeetingState;
  var STATUS = MS.STATUS;
  var D = root.AICouncil.Diagnostic;
  var C = D.CODE;

  /* 同步推进安全阀：防止恶意/错误 Protocol 造成浏览器无限同步推进。这不是改 Protocol，只是保护。 */
  var MAX_INTERNAL_STEPS = 1000;

  function docOf(p) { return (p && p.document) ? p.document : p; }
  function currentPhase(meeting, pm) { return meeting.currentPhaseId ? pm[meeting.currentPhaseId] : null; }
  function diag(code, message, details, jsonPath) {
    return D.create({ code: code, message: message, details: details || null, jsonPath: jsonPath || null });
  }
  function fail(meeting, code, message, details) { return MS.markFailed(meeting, code, message, details); }

  /* 解析 transition：相同 trigger（+ 可选 choice）必须唯一，否则确定性失败（禁止偷偷选数组第一项）。 */
  function resolveTransition(phase, trigger, choice) {
    var list = (phase.transitions || []).filter(function (t) {
      if (t.trigger !== trigger) return false;
      if (trigger === "human_choice") return t.choice === choice;
      return true;
    });
    if (list.length === 0) {
      var missingCode = (trigger === "human_choice") ? C.RUNTIME_INVALID_HUMAN_CHOICE : C.RUNTIME_TRANSITION_NOT_FOUND;
      return { ok: false, diagnostic: diag(missingCode,
        "Phase " + phase.phase_id + " 不存在 trigger=" + trigger + (choice ? (" choice=" + choice) : "") + " 的 transition。") };
    }
    if (list.length > 1) {
      return { ok: false, diagnostic: diag(C.RUNTIME_AMBIGUOUS_TRANSITION,
        "Phase " + phase.phase_id + " 存在 " + list.length + " 条可匹配 trigger=" + trigger +
        (choice ? (" choice=" + choice) : "") + "，无法确定唯一 transition（禁止随机选择）。") };
    }
    return { ok: true, transition: list[0] };
  }

  /* actor.selector → 目标参与者 id 列表 */
  function resolveParticipants(actor, meeting) {
    var sel = actor && actor.selector;
    var parts = meeting.participants;
    function ids(arr) { return { ids: arr.slice() }; }
    function idsOf(pred) { return parts.filter(pred).map(function (p) { return p.participant_id; }); }
    switch (sel) {
      case "all_advisors": return ids(idsOf(function (p) { return p.role_class === "advisor"; }));
      case "side": return ids(idsOf(function (p) { return p.side_id === actor.side_id; }));
      case "role_class": return ids(idsOf(function (p) { return p.role_class === actor.role_class; }));
      case "participant_ids": {
        var list = actor.participant_ids || [];
        var missing = list.filter(function (id) { return !parts.some(function (p) { return p.participant_id === id; }); });
        if (missing.length) return { error: diag(C.RUNTIME_PARTICIPANT_NOT_FOUND,
          "actor.participant_ids 引用了不存在的参与者：" + missing.join(", ") + "。") };
        return ids(list);
      }
      case "selected_participants": {
        var key = actor.selection_key;
        var sel2 = meeting.stateData && meeting.stateData[key];
        if (!Array.isArray(sel2) || sel2.length === 0) return { error: diag(C.RUNTIME_SELECTION_NOT_FOUND,
          "stateData." + key + " 缺失或非空数组，无法解析 selected_participants。") };
        var miss = sel2.filter(function (id) { return !parts.some(function (p) { return p.participant_id === id; }); });
        if (miss.length) return { error: diag(C.RUNTIME_SELECTION_NOT_FOUND,
          "selection_key(" + key + ") 指向不存在的参与者：" + miss.join(", ") + "。") };
        return ids(sel2);
      }
      case "human_arbiter": return ids([]);
      case "system": return ids([]);
      default: return { error: diag(C.RUNTIME_INVALID_STATE, "未知 actor.selector：" + String(sel) + "。") };
    }
  }

  function enterPhase(meeting, protocol, pm, phaseId) {
    var phase = pm[phaseId];
    if (!phase) { fail(meeting, C.RUNTIME_PHASE_NOT_FOUND, "Phase 不存在：" + phaseId + "。"); return; }
    meeting.currentPhaseId = phaseId;
    meeting.lastAction = null;
    switch (phase.kind) {
      case "agent_turn":
      case "critique":
      case "battle":
      case "secretary_summary": {
        var r = resolveParticipants(phase.actor, meeting);
        if (r.error) { fail(meeting, r.error.code, r.error.message, r.error.details); return; }
        meeting.status = STATUS.RUNNING;
        meeting.pendingAction = root.AICouncil.MeetingAction.collectResponses(phaseId, r.ids);
        meeting.activeSpeakerId = r.ids.length ? r.ids[0] : null;   /* F1：本阶段游标 = roster 首位 */
        break;
      }
      case "human_gate": {
        meeting.status = STATUS.WAITING_HUMAN;
        var choices = (phase.transitions || []).filter(function (t) { return t.trigger === "human_choice"; })
          .map(function (t) { return t.choice; });
        meeting.pendingAction = root.AICouncil.MeetingAction.awaitHumanDecision(phaseId, choices);
        break;
      }
      case "system":
      case "archive": {
        meeting.status = STATUS.RUNNING;
        meeting.pendingAction = null; /* 由 drive() 自动完成 */
        break;
      }
      default:
        fail(meeting, C.RUNTIME_INVALID_STATE, "未知 phase.kind：" + String(phase.kind) + "（phase " + phaseId + "）。");
    }
    /* D1-R4 — 记录 phase_entered（含最小必要 payload，不存整个 Protocol） */
    var paType = meeting.pendingAction ? meeting.pendingAction.action_type : null;
    var selIds = (meeting.pendingAction && meeting.pendingAction.requiredParticipantIds) || null;
    root.AICouncil.MeetingEventLog.append(meeting, "phase_entered", {
      phaseId: phaseId,
      payload: { phase_kind: phase.kind, pending_action_type: paType, selected_participant_ids: selIds }
    });
    /* D1-R4 — checkpoint=true 的 Phase 进入并稳定状态后，自动建立 Checkpoint */
    if (phase.checkpoint === true) {
      root.AICouncil.MeetingCheckpoint.create(meeting, {
        phaseKind: phase.kind,
        pendingActionType: paType,
        selectedParticipantIds: selIds
      });
    }
  }

  function doEnd(meeting) {
    meeting.status = STATUS.COMPLETED;
    meeting.currentPhaseId = null;
    meeting.pendingAction = null;
    root.AICouncil.MeetingEventLog.append(meeting, "meeting_completed", { phaseId: null, payload: {} });
  }

  /* 正常完成当前 phase 并 transition（agent / secretary / battle / system）。 */
  function completeAndTransition(meeting, protocol, pm) {
    var phase = currentPhase(meeting, pm);
    if (!phase) { fail(meeting, C.RUNTIME_PHASE_NOT_FOUND, "当前 phase 不存在，无法完成。"); return true; }
    MS.recordCompletion(meeting, phase.phase_id);
    root.AICouncil.MeetingEventLog.append(meeting, "phase_completed", { phaseId: phase.phase_id, payload: { phase_id: phase.phase_id } });
    var t = resolveTransition(phase, "complete", null);
    if (!t.ok) { fail(meeting, t.diagnostic.code, t.diagnostic.message, t.diagnostic.details); return true; }
    meeting.lastTransition = { trigger: "complete", choice: null, from: phase.phase_id, target: t.transition.target };
    if (t.transition.target === "$end") { doEnd(meeting); return false; }
    enterPhase(meeting, protocol, pm, t.transition.target);
    return false;
  }

  /* 同步推进 system/archive 阶段，直到需要外部输入或结束（带步数安全阀）。 */
  function drive(meeting, protocol, pm) {
    var steps = 0;
    while (meeting.status === STATUS.RUNNING) {
      var phase = currentPhase(meeting, pm);
      if (!phase) break;
      if (phase.kind === "system" || phase.kind === "archive") {
        if (phase.completion && phase.completion.mode === "system_immediate") {
          steps++;
          if (steps > MAX_INTERNAL_STEPS) {
            fail(meeting, C.RUNTIME_STEP_LIMIT_EXCEEDED,
              "Runtime 内部同步推进超过安全阀 " + MAX_INTERNAL_STEPS + " 步，已中止以防浏览器卡死。");
            return;
          }
          var stop = completeAndTransition(meeting, protocol, pm);
          if (stop) return; /* 已 failed */
          continue;
        }
        fail(meeting, C.RUNTIME_INVALID_STATE,
          "system/archive phase(" + phase.phase_id + ") 的 completion.mode 不是 system_immediate，无法自动推进。");
        return;
      }
      break; /* agent / human_gate 需要外部输入，停止同步推进 */
    }
  }

  function start(meeting, protocol) {
    if (!meeting) return { ok: false, diagnostic: diag(C.RUNTIME_INVALID_STATE, "meeting 为空。") };
    if (meeting.status !== STATUS.INITIALIZED)
      return { ok: false, diagnostic: diag(C.RUNTIME_INVALID_STATE, "start 仅能在 initialized 状态调用（当前 " + meeting.status + "）。") };
    var doc = docOf(protocol);
    var pm = root.AICouncil.MeetingFactory.buildPhaseMap(doc);
    var initial = doc.initial_phase_id;
    if (!initial || !pm[initial]) { fail(meeting, C.RUNTIME_PHASE_NOT_FOUND, "initial_phase_id(" + initial + ") 不存在。"); return { ok: false, diagnostic: meeting.error }; }
    root.AICouncil.MeetingEventLog.append(meeting, "meeting_started", { phaseId: initial });
    enterPhase(meeting, protocol, pm, initial);
    drive(meeting, protocol, pm);
    return { ok: true };
  }

  function getNextAction(meeting) { return meeting ? meeting.pendingAction : null; }

  function submitResult(meeting, protocol, result) {
    if (!meeting) return { ok: false, diagnostic: diag(C.RUNTIME_INVALID_STATE, "meeting 为空。") };
    if (meeting.status !== STATUS.RUNNING)
      return { ok: false, diagnostic: diag(C.RUNTIME_INVALID_STATE, "当前状态 " + meeting.status + " 不接受 submitResult（需 running）。") };
    var pm = root.AICouncil.MeetingFactory.buildPhaseMap(docOf(protocol));
    var phase = currentPhase(meeting, pm);
    if (!phase) return { ok: false, diagnostic: diag(C.RUNTIME_PHASE_NOT_FOUND, "当前 phase 不存在。") };
    if (phase.kind === "human_gate")
      return { ok: false, diagnostic: diag(C.RUNTIME_INVALID_STATE, "human_gate phase 应使用 submitHumanDecision。") };
    var pa = meeting.pendingAction;
    if (!pa || pa.action_type !== root.AICouncil.MeetingAction.ACTION.COLLECT_RESPONSES)
      return { ok: false, diagnostic: diag(C.RUNTIME_INVALID_STATE, "当前无待收集的响应（pendingAction 异常）。") };

    var pid = result && (result.participant_id || result.participantId);
    if (!pid) return { ok: false, diagnostic: diag(C.RUNTIME_INVALID_RESULT, "submitResult 缺少 participant_id。") };
    if (pa.requiredParticipantIds.indexOf(pid) < 0)
      return { ok: false, diagnostic: diag(C.RUNTIME_PARTICIPANT_NOT_FOUND, "参与者 " + pid + " 不在当前 phase(" + pa.phaseId + ") 的要求集合中。") };
    if (pa.receivedParticipantIds.indexOf(pid) >= 0)
      return { ok: false, diagnostic: diag(C.RUNTIME_DUPLICATE_RESPONSE, "参与者 " + pid + " 已提交过响应，不得重复计数（phase " + pa.phaseId + "）。") };

    pa.receivedParticipantIds.push(pid);
    meeting.lastAction = { type: root.AICouncil.MeetingAction.ACTION.COLLECT_RESPONSES, phaseId: pa.phaseId, participantId: pid };
    root.AICouncil.MeetingEventLog.append(meeting, "agent_output_received", {
      phaseId: pa.phaseId, actorType: "agent", actorId: pid,
      payload: { participant_id: pid, mock: !!(result && result.mock) }
    });

    var comp = phase.completion || {};
    var mode = comp.mode;
    var need;
    if (mode === "all_selected_respond") need = pa.requiredParticipantIds.length;
    else if (mode === "any_selected_respond") need = Math.max(1, comp.min_responses || 1);
    else if (mode === "secretary_respond") need = 1;
    else return { ok: false, diagnostic: diag(C.RUNTIME_INVALID_STATE, "phase " + pa.phaseId + " 的 completion.mode(" + mode + ") 不支持响应收集。") };

    /* F1（修正 3）：达标后停在 READY_TO_ADVANCE，绝不自动切阶段——用户点击「进入下一阶段」才 advance。 */
    var TS = root.AICouncil.MeetingTurnSelector;
    var pending = TS ? TS.derivePending(meeting) : null;
    meeting.activeSpeakerId = pending && pending.length ? pending[0] : null;
    return { ok: true };
  }

  /* T25-F3：会议开始前（Preflight 未确认）勾选参会名单后，按新 participants 重解析当前阶段 roster。 */
  function reenterPhase(meeting, protocol) {
    if (meeting.stateData && meeting.stateData.preflight_confirmed)
      return { ok: false, diagnostic: diag(C.RUNTIME_INVALID_STATE, "会议已开始，本场名单已冻结。") };
    var pm = root.AICouncil.MeetingFactory.buildPhaseMap(docOf(protocol));
    var phase = pm[meeting.currentPhaseId];
    if (!phase) return { ok: false, diagnostic: diag(C.RUNTIME_PHASE_NOT_FOUND, "Phase 不存在：" + meeting.currentPhaseId + "。") };
    if (phase.kind === "human_gate") return { ok: false, diagnostic: diag(C.RUNTIME_INVALID_STATE, "当前阶段不是发言阶段，无需重解析。") };
    var r = resolveParticipants(phase.actor, meeting);
    if (r.error) return { ok: false, diagnostic: diag(r.error.code, r.error.message) };
    meeting.pendingAction = root.AICouncil.MeetingAction.collectResponses(meeting.currentPhaseId, r.ids);
    meeting.activeSpeakerId = r.ids.length ? r.ids[0] : null;
    return { ok: true, roster: r.ids };
  }

  /* F1（T15）：显式阶段推进入口——仅 phaseStatus=ready_to_advance 时允许。 */
  function advancePhase(meeting, protocol) {
    var TS = root.AICouncil.MeetingTurnSelector;
    var st = TS ? TS.phaseStatus(meeting, protocol) : null;
    if (st !== "ready_to_advance")
      return { ok: false, diagnostic: diag(C.RUNTIME_INVALID_STATE, "当前阶段尚未完成（" + (st || "无") + "），不能进入下一阶段。") };
    var pm = root.AICouncil.MeetingFactory.buildPhaseMap(docOf(protocol));
    var stop = completeAndTransition(meeting, protocol, pm);
    if (stop) return { ok: false, diagnostic: meeting.error };
    drive(meeting, protocol, pm);
    return { ok: true };
  }

  function submitHumanDecision(meeting, protocol, decision) {
    if (!meeting) return { ok: false, diagnostic: diag(C.RUNTIME_INVALID_STATE, "meeting 为空。") };
    if (meeting.status !== STATUS.WAITING_HUMAN)
      return { ok: false, diagnostic: diag(C.RUNTIME_INVALID_STATE, "当前状态 " + meeting.status + " 不接受人类决策（需 waiting_human）。") };
    var pm = root.AICouncil.MeetingFactory.buildPhaseMap(docOf(protocol));
    var phase = currentPhase(meeting, pm);
    if (!phase || phase.kind !== "human_gate")
      return { ok: false, diagnostic: diag(C.RUNTIME_INVALID_STATE, "当前 phase 不是 human_gate。") };

    var choice = decision && decision.choice;
    var t = resolveTransition(phase, "human_choice", choice);
    if (!t.ok) {
      /* 非法 choice：明确拒绝，但保持 waiting_human，绝不偷偷改 phase（§44） */
      return { ok: false, diagnostic: t.diagnostic };
    }
    MS.recordCompletion(meeting, phase.phase_id);
    root.AICouncil.MeetingEventLog.append(meeting, "human_decision", {
      phaseId: phase.phase_id, actorType: "human_arbiter", payload: { choice: choice }
    });
    root.AICouncil.MeetingEventLog.append(meeting, "phase_completed", { phaseId: phase.phase_id, payload: { phase_id: phase.phase_id } });
    meeting.lastTransition = { trigger: "human_choice", choice: choice, from: phase.phase_id, target: t.transition.target };
    if (t.transition.target === "$end") { doEnd(meeting); return { ok: true }; }
    enterPhase(meeting, protocol, pm, t.transition.target);
    drive(meeting, protocol, pm);
    return { ok: true };
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingRuntime = Object.freeze({
    MAX_INTERNAL_STEPS: MAX_INTERNAL_STEPS,
    start: start,
    getNextAction: getNextAction,
    submitResult: submitResult, reenterPhase: reenterPhase,
    advancePhase: advancePhase, submitHumanDecision: submitHumanDecision,
    /* 暴露内部助手供测试/调试 */
    _resolveParticipants: resolveParticipants,
    _resolveTransition: resolveTransition
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
