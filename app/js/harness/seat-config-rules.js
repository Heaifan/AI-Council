/* AI Council v0.1 — F1 · SeatConfigRules：席位配置字段权限（无 DOM 纯逻辑，Node 可测）。
 * F2-F1 定稿：单一字段权限表 FIELD_POLICY（T04 单一来源）——
 *   identity 字段（seatId/camp/roleId）= 会议身份/协议快照 → 运行中锁定；
 *   runtime 字段（modelName/modelRef/modelUrl/transport/stance/note）= 模型运行配置 → 运行中仍可编辑。
 * stance 经核实不进 Participant Schema / meeting snapshot（SeatLocalConfig 覆盖表应用），故归 runtime。
 * 「Freeze Meeting ≠ Freeze Seat Configuration」。
 */
(function (root) {
  "use strict";

  var FIELD_POLICY = {
    seatId: "identity", camp: "identity", roleId: "identity",
    modelName: "runtime", modelRef: "runtime", modelUrl: "runtime",
    transport: "runtime", stance: "runtime", note: "runtime"
  };

  var FROZEN_FIELDS = ["role_class"];

  /* participant 字段名 → FIELD_POLICY key 别名（UI/动作层以 participant 字段名调用）。 */
  var FIELD_ALIAS = {
    role_class: "roleId", model_ref: "modelRef", transport_kind: "transport",
    display_name: "modelName", web_url: "modelUrl", stance: "stance", note: "note"
  };

  /* 字段级权限：identity 字段冻结时锁定；runtime 字段恒可编辑。UI 仅消费本函数（T04）。 */
  function canEdit(frozen, field) {
    var key = FIELD_ALIAS[field] || field;
    return FIELD_POLICY[key] !== "identity" || !frozen;
  }

  /* 把挂起编辑应用到与会者（draft 或 meeting 的 participants）。返回 {ok, message?}。 */
  function applyToParticipant(p, edits, frozen) {
    if (!p) return { ok: false, message: "找不到与会者。" };
    if (frozen) {
      if (edits.role_class && p.role_class !== edits.role_class) {
        return { ok: false, message: "会议已创建，角色身份已冻结；模型名称/引用/传输/网页/立场/备注仍可修改。" };
      }
    } else if (edits.role_class) {
      p.role_class = edits.role_class;
    }
    p.model_ref = edits.model_ref;
    p.transport_kind = edits.transport_kind;
    return { ok: true };
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.SeatConfigRules = Object.freeze({
    FIELD_POLICY: FIELD_POLICY, FROZEN_FIELDS: FROZEN_FIELDS,
    canEdit: canEdit, applyToParticipant: applyToParticipant
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
