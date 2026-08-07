/* AI Council v0.1 — D2-R1
 * InstructionCompiler：确定性地把 (Protocol, Meeting, Phase, Participant) 编译成 InstructionPacket。
 *
 * 设计边界（服从 D1-R4 报告 §27 + D2 计划）：
 *  - 纯函数、100% 确定、JSON-safe（无 Map / Set / Function / Promise / 时钟副作用）。
 *  - 不接 LLM、不渲染 Prompt 文本（Prompt 渲染是 D2-R2）、不接 Transport（D2-R3）。
 *  - 不修改 Protocol / Meeting / Runtime；运行时仍只产出 pendingAction，编译器是解耦的只读产出。
 *  - 解析 actor 目标参与者时复用 Runtime 的确定性 _resolveParticipants（只读，不调用任何推进逻辑）。
 *  - Role Card 解析经 RoleCardRegistry（按 role_class 确定性 pick）；协议要求包含却缺卡 → 明确拒绝。
 *  - packet_id 由「内容」Canonical JSON 求 FNV-1a，内容寻址、稳定可复现；generated_at 为时间元数据不计入。
 */
(function (root) {
  "use strict";

  var D = root.AICouncil.Diagnostic;
  var C = D.CODE;
  var FP = root.AICouncil.ProtocolFingerprint;

  var COMPILER_VERSION = "0.1.0";
  var DETERMINISTIC_NOW = "0001-01-01T00:00:00+00:00";
  var _clock = function () { return DETERMINISTIC_NOW; };

  function setClock(fn) {
    if (typeof fn === "function") _clock = fn;
    else if (fn === null || fn === undefined) _clock = function () { return DETERMINISTIC_NOW; };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function docOf(p) { return (p && p.document) ? p.document : p; }
  function diag(code, message, details) { return D.create({ code: code, message: message, details: details || null }); }

  /* FNV-1a 32-bit，纯 JS，浏览器/Node 同结果（不依赖 Crypto，保证可测试确定性）。 */
  function fnv1a32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function contentHash(packet) {
    /* 对“内容”求稳定标识；排除 packet_id 自身与 generated_at（时间元数据）。 */
    var content = {
      c: COMPILER_VERSION,
      protocol: packet.protocol,
      meeting: packet.meeting,
      phase: packet.phase,
      target: packet.target,
      instruction: packet.instruction,
      role_card: packet.role_card,
      visibility: packet.visibility,
      output_contract: packet.output_contract,
      actor: packet.actor
    };
    return "ip-" + fnv1a32(FP.canonicalize(content));
  }

  function resolveParticipant(meeting, id) {
    var parts = meeting.participants || [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].participant_id === id) return parts[i];
    }
    return null;
  }

  /* inputs: { protocol, meeting, phaseId, participantId, roleRegistry } */
  function compile(inputs) {
    inputs = inputs || {};
    var protocol = inputs.protocol;
    var meeting = inputs.meeting;
    var phaseId = inputs.phaseId;
    var participantId = inputs.participantId;
    var registry = inputs.roleRegistry || null;

    if (!protocol || !meeting) {
      return { ok: false, diagnostics: [diag(C.COMPILER_PROTOCOL_INVALID, "compile 需要 protocol 与 meeting。")] };
    }
    var doc = docOf(protocol);
    if (!doc || !Array.isArray(doc.phases)) {
      return { ok: false, diagnostics: [diag(C.COMPILER_PROTOCOL_INVALID, "protocol 没有可用的 document/phases。")] };
    }

    /* 轻量 phase map（不与 Runtime 共享实例，避免耦合） */
    var pm = Object.create(null);
    doc.phases.forEach(function (p) { if (p && p.phase_id) pm[p.phase_id] = p; });
    var phase = pm[phaseId];
    if (!phase) {
      return { ok: false, diagnostics: [diag(C.COMPILER_PHASE_NOT_FOUND, "Phase 不存在：" + String(phaseId) + "。")] };
    }

    var participant = resolveParticipant(meeting, participantId);
    if (!participant) {
      return { ok: false, diagnostics: [diag(C.COMPILER_PARTICIPANT_NOT_FOUND, "参与者不存在：" + String(participantId) + "。")] };
    }

    var selector = phase.actor ? phase.actor.selector : null;
    if (selector === "human_arbiter" || selector === "system") {
      return { ok: false, diagnostics: [diag(C.COMPILER_NO_AGENT_TARGET,
        "Phase " + phaseId + " 的 actor.selector=" + selector + "，没有可供编译的 Agent 目标（人类/系统指令在后续轮次处理）。")] };
    }

    /* 复用 Runtime 的确定性参与者解析，确认该 participant 确为本 phase 目标 */
    var resolved;
    try {
      resolved = root.AICouncil.MeetingRuntime._resolveParticipants(phase.actor, meeting);
    } catch (e) {
      resolved = { error: diag(C.RUNTIME_INVALID_STATE, "参与者解析异常：" + (e && e.message ? e.message : String(e))) };
    }
    if (resolved.error) return { ok: false, diagnostics: [resolved.error] };
    if (resolved.ids.indexOf(participantId) < 0) {
      return { ok: false, diagnostics: [diag(C.COMPILER_PARTICIPANT_NOT_TARGETED,
        "参与者 " + participantId + " 不在 Phase " + phaseId + " 的 actor 目标集合内。")] };
    }

    var instr = phase.instruction || {};
    var includeRoleCard = instr.include_role_card === true;
    var includeVisibility = instr.include_visibility_rules === true;

    /* Role Card 解析 */
    var roleCard = null;
    if (includeRoleCard) {
      if (!registry) {
        return { ok: false, diagnostics: [diag(C.ROLE_CARD_NOT_FOUND, "协议要求包含 Role Card，但未提供 RoleCardRegistry。")] };
      }
      roleCard = registry.byRoleClass(participant.role_class);
      if (!roleCard) {
        return { ok: false, diagnostics: [diag(C.ROLE_CARD_NOT_FOUND,
          "RoleCardRegistry 中找不到 role_class=" + String(participant.role_class) + " 的 Role Card。")] };
      }
      roleCard = clone(roleCard);
    }

    /* Visibility 解析 */
    var visibility = null;
    if (includeVisibility) {
      var mode = meeting.visibilityMode || doc.default_visibility_mode || null;
      var allowed = Array.isArray(doc.allowed_visibility_modes) ? doc.allowed_visibility_modes.slice() : [];
      visibility = {
        mode: mode,
        allowed_modes: allowed,
        anonymous: mode === "full_anonymous",
        rules_included: true
      };
    }

    var packet = {
      schema_version: "0.1.0",
      packet_id: "ip-00000000", /* 占位，稍后回填内容哈希 */
      compiler_version: COMPILER_VERSION,
      protocol: { protocol_id: doc.protocol_id, protocol_version: doc.version },
      meeting: { meeting_id: meeting.meetingId, visibility_mode: (meeting.visibilityMode === undefined ? null : meeting.visibilityMode) },
      phase: { phase_id: phase.phase_id, phase_kind: phase.kind, phase_name: phase.name },
      target: {
        participant_id: participant.participant_id,
        role_class: participant.role_class,
        side_id: (participant.side_id === undefined ? null : participant.side_id),
        alias: (participant.alias === undefined ? null : participant.alias)
      },
      instruction: {
        task: instr.task || "",
        context_scope: instr.context_scope || "none",
        context_keys: Array.isArray(instr.context_keys) ? instr.context_keys.slice() : null,
        include_role_card: includeRoleCard,
        include_visibility_rules: includeVisibility
      },
      role_card: roleCard,
      visibility: visibility,
      output_contract: clone(phase.output_contract || { mode: "text" }),
      actor: clone(phase.actor || { selector: selector }),
      generated_at: _clock(),
      deterministic: true
    };
    packet.packet_id = contentHash(packet);
    return { ok: true, packet: packet };
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.InstructionCompiler = Object.freeze({
    compile: compile,
    setClock: setClock,
    COMPILER_VERSION: COMPILER_VERSION
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
