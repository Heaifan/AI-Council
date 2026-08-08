/* AI Council v0.1 — F1 · SeatConfigRules：席位配置冻结规则（无 DOM 纯逻辑，Node 可测）。
 * 用户 ONE-SCREEN-F1 §七/§八：Freeze Meeting ≠ Freeze Seat Configuration。
 * 冻结 = 会议身份字段（role_class）；运行配置（model_ref / transport_kind）创建后仍可热改。
 * 立场/备注/显示名/web_url 属本地配置（SeatLocalConfig / RelayProfiles），永不冻结。
 */
(function (root) {
  "use strict";

  var FROZEN_FIELDS = ["role_class"];

  /* 字段级权限：冻结时仅身份字段不可编辑。 */
  function canEdit(frozen, field) {
    return !frozen || FROZEN_FIELDS.indexOf(field) < 0;
  }

  /* 把挂起编辑应用到与会者（draft 或 meeting 的 participants）。返回 {ok, message?}。 */
  function applyToParticipant(p, edits, frozen) {
    if (!p) return { ok: false, message: "找不到与会者。" };
    if (frozen) {
      if (edits.role_class && p.role_class !== edits.role_class) {
        return { ok: false, message: "会议已创建，角色身份已冻结；模型引用与传输方式仍可修改。" };
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
    FROZEN_FIELDS: FROZEN_FIELDS, canEdit: canEdit, applyToParticipant: applyToParticipant
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
