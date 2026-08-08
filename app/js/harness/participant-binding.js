/* AI Council v0.1 — D2-F1
 * ParticipantBinding：把「这场会议里的人」绑定到「岗位说明书」。
 *
 * 冻结概念（本文件是该概念的唯一落点）：
 *   Role Card  = 岗位说明书（roles/*.json，可复用、与会议无关）
 *   Participant= 这场会议中的人（meeting.participants[]，A1 / B1 / Chair）
 *   Model      = 未来的执行者（D3，本轮完全不出现）
 * 三者不得混用。Compiler 的可选对象**只能**来自 meeting.participants[]，
 * 绝不允许把 roles/*.json 当成可选 Agent。
 *
 * 无 DOM，可在 Node 中直接测试。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var STATUS = A.MeetingState.STATUS;

  function currentPhase(protocol, meeting) {
    if (!protocol || !meeting || !meeting.currentPhaseId) return null;
    var pm = A.MeetingFactory.buildPhaseMap(A.MeetingFactory.docOf(protocol));
    return pm[meeting.currentPhaseId] || null;
  }

  /* 当前 Phase 的 actor 目标集合（只读复用 Runtime 的确定性解析，不推进任何状态）。 */
  function targetedIds(protocol, meeting) {
    var phase = currentPhase(protocol, meeting);
    if (!phase || !phase.actor) return [];
    var r;
    try { r = A.MeetingRuntime._resolveParticipants(phase.actor, meeting); }
    catch (e) { return []; }
    return r.error ? [] : r.ids.slice();
  }

  /* meeting.participants[] → 下拉选项。label 形如 "A1 · 战略支持方"。 */
  function options(meeting, roleRegistry, protocol) {
    if (!meeting || !Array.isArray(meeting.participants)) return [];
    var targeted = protocol ? targetedIds(protocol, meeting) : [];
    return meeting.participants.map(function (p) {
      var resolved = (roleRegistry && roleRegistry.ok && roleRegistry.resolveForParticipant)
        ? roleRegistry.resolveForParticipant(p) : null;
      var card = resolved ? resolved.card : null;
      var alias = p.alias || p.participant_id;
      return {
        participant_id: p.participant_id,
        alias: alias,
        side_id: (p.side_id === undefined ? null : p.side_id),
        role_class: p.role_class,
        declared_role_id: p.role_id || null,
        role_id: card ? card.role_id : null,
        role_name: card ? card.name : null,
        resolved_by: resolved ? resolved.resolvedBy : "none",
        targeted: targeted.indexOf(p.participant_id) >= 0,
        label: alias + " · " + (card ? card.name : ("（" + p.role_class + "：无 Role Card）"))
      };
    });
  }

  /* Compiler Tab 是否可用。无 Meeting → 明确禁用并提示先去 Meeting 页建会。 */
  function compilerState(meeting) {
    if (!meeting) {
      return { enabled: false, reason: "请先在 Meeting 页创建 Demo Meeting。" };
    }
    if (meeting.status === STATUS.FAILED) {
      return { enabled: false, reason: "会议处于 failed 状态，无可编译的指令。" };
    }
    if (!meeting.currentPhaseId) {
      return { enabled: false, reason: "会议已结束（无当前 Phase），无可编译的指令。" };
    }
    if (!Array.isArray(meeting.participants) || meeting.participants.length === 0) {
      return { enabled: false, reason: "当前会议没有 Participant。" };
    }
    return { enabled: true, reason: null };
  }

  /* 默认选中：优先本阶段 actor 目标内的第一位，否则第一位参与者。 */
  function defaultParticipantId(opts) {
    if (!opts || !opts.length) return null;
    for (var i = 0; i < opts.length; i++) if (opts[i].targeted) return opts[i].participant_id;
    return opts[0].participant_id;
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.ParticipantBinding = Object.freeze({
    options: options,
    targetedIds: targetedIds,
    compilerState: compilerState,
    defaultParticipantId: defaultParticipantId,
    currentPhase: currentPhase
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
