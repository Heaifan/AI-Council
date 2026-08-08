/* AI Council v0.1 — D2-R1
 * RoleCardRegistry：Role Card 装载与按 role_class 的确定性解析。
 *
 * 设计边界（服从 D1-R4 报告 §24-1 缺口 + §27 + Role-Card-Spec）：
 *  - 与 Model Registry 解耦（Role-Card-Spec §1）：本模块只负责“角色职责卡”的查找。
 *  - 不依赖磁盘 / 浏览器 API：调用方负责把「已解析的 Role Card 对象」传入
 *    （测试注入 / 未来浏览器 loader 从 roles/ 读取后注入）。
 *  - 同一 role_class 有多张卡片时，按 role_id 升序确定性 pick 第一张，保证编译产物可复现。
 *  - 仅做轻量结构校验（role_id / role_class / name），完整 role.schema.json 校验由调用方/测试负责。
 */
(function (root) {
  "use strict";

  var D = root.AICouncil.Diagnostic;
  var C = D.CODE;
  var ROLE_CLASSES = ["advisor", "chair", "secretary", "chair_secretary"];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function makeDiag(code, message, details) {
    return D.create({ code: code, message: message, details: details || null });
  }

  function structuralValid(card) {
    if (!card || typeof card !== "object") return "Role Card 不是对象";
    if (typeof card.role_id !== "string" || !card.role_id) return "Role Card 缺少 role_id";
    if (ROLE_CLASSES.indexOf(card.role_class) < 0) return "Role Card role_class 非法：" + String(card.role_class);
    if (typeof card.name !== "string" || !card.name) return "Role Card 缺少 name";
    return null;
  }

  /* cards：已解析的 Role Card 对象数组 */
  function create(cards) {
    if (!Array.isArray(cards)) {
      return Object.freeze({ ok: false, diagnostic: makeDiag(C.ROLE_CARD_INVALID, "Role Card 列表必须是数组。") });
    }
    var byClass = Object.create(null);
    var byId = Object.create(null);
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var err = structuralValid(c);
      if (err) return Object.freeze({ ok: false, diagnostic: makeDiag(C.ROLE_CARD_INVALID, err, { index: i }) });
      var rc = c.role_class;
      if (!byClass[rc]) byClass[rc] = [];
      byClass[rc].push(c);
      if (!byId[c.role_id]) byId[c.role_id] = c; /* 同 role_id 重复时保留先到者，确定性由调用方排序保证 */
    }
    /* 每个 role_class 内按 role_id 升序，保证确定性 pick */
    Object.keys(byClass).forEach(function (k) {
      byClass[k].sort(function (a, b) {
        return a.role_id < b.role_id ? -1 : (a.role_id > b.role_id ? 1 : 0);
      });
    });

    function list() {
      return Object.keys(byClass).reduce(function (acc, k) { return acc.concat(byClass[k]); }, []);
    }
    function hasRoleClass(roleClass) {
      return Array.isArray(byClass[roleClass]) && byClass[roleClass].length > 0;
    }
    function byRoleClass(roleClass) {
      var arr = byClass[roleClass];
      if (!arr || arr.length === 0) return null;
      return clone(arr[0]); /* 确定性：取排序后第一个 */
    }
    function byRoleId(roleId) {
      var c = roleId ? byId[roleId] : null;
      return c ? clone(c) : null;
    }

    /* D2-F1：Participant → Role Card 的唯一解析入口。
     * Role ≠ Participant：Participant 是“这场会议里的人”，Role Card 是“岗位说明书”。
     * 解析顺序固定为 role_id 精确命中 → role_class 回退，便于 UI 显示解析来源。 */
    function resolveForParticipant(participant) {
      if (!participant) return null;
      var exact = byRoleId(participant.role_id);
      if (exact) return { card: exact, resolvedBy: "role_id" };
      var fallback = byRoleClass(participant.role_class);
      if (fallback) return { card: fallback, resolvedBy: "role_class" };
      return null;
    }

    return Object.freeze({
      ok: true,
      list: list,
      hasRoleClass: hasRoleClass,
      byRoleClass: byRoleClass,
      byRoleId: byRoleId,
      resolveForParticipant: resolveForParticipant
    });
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.RoleCardRegistry = Object.freeze({ create: create, ROLE_CLASSES: ROLE_CLASSES });
})(typeof globalThis !== "undefined" ? globalThis : this);
