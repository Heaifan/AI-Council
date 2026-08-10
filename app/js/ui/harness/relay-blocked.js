/* AI Council v0.1 — MEETING-RUNTIME-F1 · RelayBlocked：发言人阻塞卡（T08/T09，DOM 投影）。
 * 当前发言人 Admission 失败时显示：席位 · 无法开始发言 + 原因 + [配置该席位]。
 * 绝不自动跳下一席、绝不把 Blocked 当完成（用户方案 §九）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function build(spk, adm) {
    var bk = Dom.el("div", "card blocked-card");
    bk.id = "relay-blocked";
    bk.appendChild(Dom.el("h2", null, spk + " · 无法开始发言"));
    bk.appendChild(Dom.el("p", "bad", "状态：Blocked · 原因：" + adm.reason));
    var cfg = Dom.el("button", "btn secondary", "配置该席位");
    cfg.id = "relay-blocked-config";
    cfg.addEventListener("click", function () { A.ConsoleActions.setSelectedSeat(spk); });
    bk.appendChild(cfg);
    return bk;
  }

  A.RelayBlocked = Object.freeze({ build: build });
})(typeof globalThis !== "undefined" ? globalThis : this);
