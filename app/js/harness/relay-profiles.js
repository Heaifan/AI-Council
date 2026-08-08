/* AI Council v0.1 — D3 · 会议控制台 · WebRelayTargetProfile：网页中继的 Transport 本地配置（无 DOM，Node 可测）。
 * 设计边界（用户方案 §7/§8/§11）：
 *  - web_url 属于「Transport 配置」，不是会议身份 → 绝不进 Participant / Meeting Schema；
 *    Participant 只引用 model_ref，UI 按 model_ref 找 web_url。
 *  - 会议创建后 web_url 仍可修改（域名变了不该让会议作废）；model_ref 冻结。
 *  - 「打开模型网页」= window.open(url)，必须用户主动点击、仅 http/https、不控制页面。
 */
(function (root) {
  "use strict";

  /* 默认 Profile 表（本地配置，可编辑；不在任何 Schema 中）。 */
  var DEFAULTS = [
    { profile_id: "chatgpt", display_name: "ChatGPT", model_ref: "chatgpt-web", web_url: "https://chatgpt.com/" },
    { profile_id: "claude", display_name: "Claude", model_ref: "claude-web", web_url: "https://claude.ai/" },
    { profile_id: "gemini", display_name: "Gemini", model_ref: "gemini-web", web_url: "https://gemini.google.com/" }
  ];

  function clone(list) { return JSON.parse(JSON.stringify(list || [])); }

  /* 仅 http/https 允许打开；空串 = 未配置。 */
  function isSafeUrl(url) {
    if (typeof url !== "string" || !url.trim()) return false;
    return /^https?:\/\//i.test(url.trim());
  }

  function validateUrl(url) {
    if (typeof url !== "string" || !url.trim()) return { ok: true, message: "" }; /* 空 = 未配置，允许 */
    if (!isSafeUrl(url)) return { ok: false, message: "模型网页必须以 http:// 或 https:// 开头。" };
    return { ok: true, message: "" };
  }

  function findByModelRef(profiles, modelRef) {
    if (!modelRef) return null;
    var list = profiles || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].model_ref === modelRef) return list[i];
    return null;
  }

  /* 按 model_ref 取 web_url；未命中返回 null（按钮 disabled）。 */
  function webUrlFor(profiles, modelRef) {
    var p = findByModelRef(profiles, modelRef);
    return p ? (p.web_url || "") : "";
  }

  function displayName(profiles, modelRef) {
    var p = findByModelRef(profiles, modelRef);
    return p ? (p.display_name || modelRef) : (modelRef || "（未指定模型）");
  }

  /* upsert：已有 model_ref 则更新，否则追加。返回新数组（不修改入参）。 */
  function upsert(profiles, profile) {
    if (!profile || !profile.model_ref) return clone(profiles);
    var out = clone(profiles);
    for (var i = 0; i < out.length; i++) {
      if (out[i].model_ref === profile.model_ref) { out[i] = profile; return out; }
    }
    out.push(profile);
    return out;
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.RelayProfiles = Object.freeze({
    DEFAULTS: clone(DEFAULTS), clone: clone, isSafeUrl: isSafeUrl, validateUrl: validateUrl,
    findByModelRef: findByModelRef, webUrlFor: webUrlFor, displayName: displayName, upsert: upsert
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
