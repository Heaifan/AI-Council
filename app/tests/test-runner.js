/* AI Council v0.1 — D1-R1 浏览器测试页驱动。 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function renderSummary(node, summary) {
    node.textContent = "总计 " + summary.total + " · 通过 " + summary.passed + " · 失败 " + summary.failed;
    node.className = "status " + (summary.failed ? "bad" : "ok");
  }

  function renderResults(node, results) {
    Dom.clear(node);
    results.forEach(function (r) {
      var row = Dom.el("div", "entry " + (r.passed ? "ok" : "bad"));
      row.appendChild(Dom.el("div", "entry-title", (r.passed ? "PASS  " : "FAIL  ") + r.id + "  " + r.name));
      if (!r.passed) row.appendChild(Dom.field("原因", r.message));
      node.appendChild(row);
    });
  }

  function start() {
    var input = document.getElementById("dir-input");
    var status = document.getElementById("status");
    var output = document.getElementById("output");

    input.addEventListener("change", function (e) {
      if (!e.target.files || !e.target.files.length) return;
      status.textContent = "正在采集正式文件…";
      status.className = "status info";
      A.SourceBundle.fromFileList(e.target.files).then(function (ctx) {
        if (ctx.missing.length) {
          status.textContent = "缺少必需文件：" + ctx.missing.join("、");
          status.className = "status bad";
          return;
        }
        return A.TestSuite.run(ctx).then(function (summary) {
          renderSummary(status, summary);
          renderResults(output, summary.results);
        });
      }).catch(function (err) {
        status.textContent = "测试执行异常：" + (err && err.message ? err.message : String(err));
        status.className = "status bad";
      }).then(function () { input.value = ""; });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})(typeof globalThis !== "undefined" ? globalThis : this);
