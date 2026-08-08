/* AI Council v0.1 — D3 · 会议控制台 · RelayVerdict：校验状态行 + 折叠详情（DOM 投影）。
 * 普通状态只显示一行：校验状态：通过 ✅ / 未通过 ❌（+ 错误码）；
 * [查看校验详情 ▾] 展开后才出现 V01–V05 逐项清单。不霸占页面。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function checkList(box, check) {
    if (!check || !check.checks || !check.checks.length) return;
    var ul = Dom.el("ul", "checks");
    check.checks.forEach(function (c) {
      ul.appendChild(Dom.el("li", c.ok ? "ok" : "bad", c.id + (c.ok ? " ✅" : " ❌")));
    });
    box.appendChild(ul);
  }

  /* 返回 { summaryEl, detailsEl }，宿主决定挂载位置。 */
  function build(active, check, onToggle) {
    var wrap = Dom.el("div", "card verdict");
    var row = Dom.el("div", "verdict-row");
    var status = Dom.el("span", check ? (check.ok ? "ok" : "bad") : "muted",
      check ? (check.ok ? "校验通过 ✅" : "校验失败 ❌") : "尚未校验");
    status.id = "relay-validation";
    row.appendChild(status);
    if (check && !check.ok && check.diagnostics && check.diagnostics[0]) {
      var code = check.diagnostics[0].code;
      var e = A.UIText.error(code);
      row.appendChild(Dom.el("span", "verdict-err", e.text + "（错误代码：" + e.code + "）"));
    }
    wrap.appendChild(row);

    var details = Dom.el("details", "verdict-details");
    var sum = Dom.el("summary", null, "查看校验详情 ▾");
    sum.id = "relay-verdict-toggle";
    if (onToggle) sum.addEventListener("click", onToggle);
    details.appendChild(sum);
    checkList(details, check);
    wrap.appendChild(details);
    return wrap;
  }

  A.RelayVerdict = Object.freeze({ build: build });
})(typeof globalThis !== "undefined" ? globalThis : this);
