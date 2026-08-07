/* AI Council v0.1 — D1-R1
 * Registry 渲染：Session 概要 + Available + Invalid(Quarantine)。
 * 这是 Developer Harness，不是正式委员会 UI。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function sessionCard(session) {
    var box = Dom.el("div", "card");
    box.appendChild(Dom.el("h2", null, "Session"));
    box.appendChild(Dom.field("Session ID", session.sessionId));
    box.appendChild(Dom.field("建立时间", session.createdAt));
    box.appendChild(Dom.field("所选目录", session.rootName));
    box.appendChild(Dom.field("快照文件总数", session.snapshot.fileCount));
    box.appendChild(Dom.field("发现 protocol.json", session.snapshot.protocolFiles.length));
    box.appendChild(Dom.field("Schema 文件", session.schema ? session.schema.filePath : "未确定"));
    box.appendChild(Dom.field("Schema 方言", session.schema ? session.schema.dialect : null));
    box.appendChild(Dom.el("p", "note", "本 Session 已冻结：磁盘上的 protocol.json 之后如何修改，都不会影响这里的结果。"));
    return box;
  }

  function availableCard(registry) {
    var box = Dom.el("div", "card");
    var h = Dom.el("h2", null, "Available Protocols");
    h.appendChild(Dom.el("span", "count ok", registry.counts.available));
    box.appendChild(h);
    if (!registry.available.length) {
      box.appendChild(Dom.el("p", "empty", "（无）"));
      return box;
    }
    registry.available.forEach(function (p) {
      var row = Dom.el("div", "entry ok");
      row.appendChild(Dom.el("div", "entry-title", p.protocolId + "  " + p.version));
      row.appendChild(Dom.field("Name", p.name));
      row.appendChild(Dom.field("File", p.filePath));
      row.appendChild(Dom.field("Phases", Array.isArray(p.document.phases) ? p.document.phases.length : "—"));
      box.appendChild(row);
    });
    return box;
  }

  function invalidEntry(entry) {
    var wrap = Dom.el("details", "entry bad");
    var summary = Dom.el("summary", null,
      (entry.protocolId || "(未知 protocol_id)") + "  " + (entry.version || "(未知 version)"));
    summary.appendChild(Dom.el("span", "code-tag", entry.diagnostics.length ? entry.diagnostics[0].code : "UNKNOWN"));
    wrap.appendChild(summary);
    wrap.appendChild(Dom.field("File", entry.filePath));
    wrap.appendChild(Dom.field("诊断条数", entry.diagnostics.length));
    wrap.appendChild(A.DiagnosticView.renderList(entry.diagnostics));
    return wrap;
  }

  function invalidCard(registry) {
    var box = Dom.el("div", "card");
    var h = Dom.el("h2", null, "Invalid Protocols (Quarantine)");
    h.appendChild(Dom.el("span", "count " + (registry.counts.invalid ? "bad" : "ok"), registry.counts.invalid));
    box.appendChild(h);
    if (!registry.invalid.length) {
      box.appendChild(Dom.el("p", "empty", "（无）"));
      return box;
    }
    registry.invalid.forEach(function (e) { box.appendChild(invalidEntry(e)); });
    return box;
  }

  function blockedCard(session) {
    var box = Dom.el("div", "card blocked");
    box.appendChild(Dom.el("h2", null, "Session 未初始化"));
    box.appendChild(A.DiagnosticView.renderList(session.diagnostics));
    return box;
  }

  function render(container, session) {
    Dom.clear(container);
    container.appendChild(sessionCard(session));
    if (!session.registry) { container.appendChild(blockedCard(session)); return; }
    if (session.diagnostics.length) container.appendChild(A.DiagnosticView.renderList(session.diagnostics));
    container.appendChild(availableCard(session.registry));
    container.appendChild(invalidCard(session.registry));
  }

  A.RegistryView = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
