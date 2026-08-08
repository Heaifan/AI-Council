/* AI Council v0.1 — D2-F1
 * CompileFlow：把 D2-R1 Compiler 与 D2-R2 Renderer 串成 Harness 的一次调用（无 DOM）。
 *
 * 数据流（本轮 D2-F1 要在网页上跑通的那条链的末段）：
 *   Meeting.currentPhaseId + 选中的 Participant
 *     → InstructionCompiler.compile → InstructionPacket
 *     → （可选）instruction-packet.schema.json 校验
 *     → PromptRenderer.render → Rendered Prompt 文本
 * 编译失败绝不静默：原样把结构化诊断交回视图显示。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;

  /* 摘要：给人看的 8 个字段，避免一上来就糊一大坨 JSON。 */
  function digest(packet) {
    return {
      packet_id: packet.packet_id,
      protocol: packet.protocol.protocol_id + "@" + packet.protocol.protocol_version,
      meeting_id: packet.meeting.meeting_id,
      phase: packet.phase.phase_id + "（" + packet.phase.phase_kind + "）",
      participant: packet.target.participant_id +
        (packet.target.alias ? "（" + packet.target.alias + "）" : ""),
      role: packet.role_card ? (packet.role_card.name + "（role_id=" + packet.role_card.role_id + "）") : "（本阶段不含 Role Card）",
      visibility: packet.meeting.visibility_mode || "（未设定）",
      task: packet.instruction.task || "（未指定任务）"
    };
  }

  function validatePacket(packet, packetSchema) {
    if (!packetSchema) return { checked: false, ok: null, message: "未发现 instruction-packet.schema.json，已跳过 Packet Schema 校验。" };
    var v = A.InstructionPacketSchemaValidator.create(packetSchema);
    if (!v.ok) return { checked: false, ok: null, message: "Packet Schema 编译失败：" + v.diagnostic.message };
    var r = v.validate(packet);
    return {
      checked: true, ok: r.ok,
      message: r.ok ? "Packet 通过 instruction-packet.schema.json 校验。"
        : ("Packet Schema 校验失败：" + r.diagnostics[0].message)
    };
  }

  /* inputs: { protocol, meeting, participantId, roleRegistry, packetSchema? } */
  function run(inputs) {
    inputs = inputs || {};
    if (!inputs.protocol || !inputs.meeting) {
      return { ok: false, stage: "input", message: "缺少 protocol 或 meeting。", diagnostics: [] };
    }
    if (!inputs.participantId) {
      return { ok: false, stage: "input", message: "未选择 Participant。", diagnostics: [] };
    }
    if (!inputs.roleRegistry || !inputs.roleRegistry.ok) {
      return { ok: false, stage: "role", message: "RoleCardRegistry 不可用（roles/*.json 未装载）。", diagnostics: [] };
    }

    var c = A.InstructionCompiler.compile({
      protocol: inputs.protocol,
      meeting: inputs.meeting,
      phaseId: inputs.meeting.currentPhaseId,
      participantId: inputs.participantId,
      roleRegistry: inputs.roleRegistry
    });
    if (!c.ok) {
      return { ok: false, stage: "compile", message: c.diagnostics[0].message, diagnostics: c.diagnostics };
    }

    var schema = validatePacket(c.packet, inputs.packetSchema);
    var r = A.PromptRenderer.render(c.packet);
    if (!r.ok) {
      return { ok: false, stage: "render", message: r.diagnostics[0].message, diagnostics: r.diagnostics, packet: c.packet };
    }

    return {
      ok: true, stage: "done",
      packet: c.packet,
      digest: digest(c.packet),
      raw: JSON.stringify(c.packet, null, 2),
      prompt: r.text,
      schemaCheck: schema
    };
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.CompileFlow = Object.freeze({ run: run, digest: digest });
})(typeof globalThis !== "undefined" ? globalThis : this);
