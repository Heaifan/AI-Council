/* AI Council v0.1 — D1-R1
 * 诊断渲染。第43题要求：文件 / Protocol ID / Version / Error Code / JSON Path / Message 必须全部可见。
 */
(function (root) {
  "use strict";

  var Dom = root.AICouncil && root.AICouncil.Dom;

  function detailsText(details) {
    if (details === null || details === undefined) return null;
    try { return JSON.stringify(details); } catch (e) { return String(details); }
  }

  function render(diagnostic) {
    var box = Dom.el("div", "diagnostic sev-" + diagnostic.severity);

    var head = Dom.el("div", "diagnostic-head");
    head.appendChild(Dom.el("span", "code", diagnostic.code));
    head.appendChild(Dom.el("span", "severity", diagnostic.severity));
    box.appendChild(head);

    box.appendChild(Dom.field("File", diagnostic.filePath));
    box.appendChild(Dom.field("Protocol ID", diagnostic.protocolId));
    box.appendChild(Dom.field("Version", diagnostic.protocolVersion));
    box.appendChild(Dom.field("Error Code", diagnostic.code));
    box.appendChild(Dom.field("JSON Path", diagnostic.jsonPath));
    box.appendChild(Dom.field("Message", diagnostic.message));

    var extra = detailsText(diagnostic.details);
    if (extra) box.appendChild(Dom.field("Details", extra));

    return box;
  }

  function renderList(diagnostics) {
    var wrap = Dom.el("div", "diagnostic-list");
    (diagnostics || []).forEach(function (d) { wrap.appendChild(render(d)); });
    return wrap;
  }

  root.AICouncil.DiagnosticView = Object.freeze({ render: render, renderList: renderList });
})(typeof globalThis !== "undefined" ? globalThis : this);
