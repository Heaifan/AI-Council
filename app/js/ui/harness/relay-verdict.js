/* AI Council v0.1 — MEETING-UX-F3 · RelayVerdict：校验降级为后台能力（方案 T03）。
 * 未校验 → 不渲染；PASS → 静默（不渲染）；FAIL → 轻提示「⚠ 回答存在校验问题 [查看详情]」。
 * 详情（V01–V05 清单）只在 FAIL 时按需展开。校验逻辑本身零改动。
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
    /* F1-B：V06 失败时展开精确原因（parser_error / missing_sections / schema_errors / additional_properties）。 */
    if (check.validation && !check.validation.is_valid) {
      var v = check.validation;
      (v.parser_error ? ["解析错误：" + v.parser_error] : [])
        .concat(v.missing_sections.length ? ["缺少小节：" + v.missing_sections.join("、")] : [])
        .concat(v.schema_errors.slice(0, 5).map(function (s) { return "Schema：" + s; }))
        .concat(v.additional_properties.length ? ["不允许的字段：" + v.additional_properties.join("、")] : [])
        .forEach(function (line) { ul.appendChild(Dom.el("li", "bad", line)); });
    }
    box.appendChild(ul);
  }

  /* T03：仅 FAIL 返回卡片；未校验与 PASS 返回 null（宿主不渲染）。 */
  function build(active, check) {
    if (!check || check.ok) return null;
    var wrap = Dom.el("div", "card verdict fail");
    var row = Dom.el("div", "verdict-row");
    var status = Dom.el("span", "bad", "⚠ 回答存在校验问题");
    status.id = "relay-validation";
    row.appendChild(status);
    if (check.diagnostics && check.diagnostics[0]) {
      var e = A.UIText.error(check.diagnostics[0].code);
      row.appendChild(Dom.el("span", "verdict-err", e.text + "（错误代码：" + e.code + "）"));
    }
    wrap.appendChild(row);
    var details = Dom.el("details", "verdict-details");
    var sum = Dom.el("summary", null, "查看详情 ▾");
    sum.id = "relay-verdict-toggle";
    details.appendChild(sum);
    checkList(details, check);
    wrap.appendChild(details);
    return wrap;
  }

  A.RelayVerdict = Object.freeze({ build: build });
})(typeof globalThis !== "undefined" ? globalThis : this);
