/* AI Council v0.1 — D1-R1
 * ProtocolSession：一次性把 Snapshot 编译成冻结的 Registry。
 * 第42题：Session 建立后固定不变；无轮询、无 watcher、无自动刷新、无定时重读。
 * 需要新规则 → 重新初始化整个 Session（重新选择目录或重开页面）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var D = A && A.Diagnostic;
  var seq = 0;

  function blocked(snapshot, diagnostics) {
    return Object.freeze({
      sessionId: "S" + (++seq),
      createdAt: new Date().toISOString(),
      rootName: snapshot.rootName,
      snapshot: snapshot,
      schema: null,
      registry: null,
      diagnostics: Object.freeze(diagnostics)
    });
  }

  /* 方案 A：Schema 来自用户选择的同一份磁盘文件，全程零副本，不存在第二套 Schema */
  function resolveSchema(snapshot, override) {
    if (override) return { record: override };
    var matches = snapshot.schemaMatches.filter(function (m) { return typeof m.text === "string"; });
    if (matches.length === 0) {
      return { diagnostic: D.create({
        code: D.CODE.SCHEMA_SOURCE_MISSING,
        message: "所选目录中未发现 schemas/protocol.schema.json，请用下方按钮直接指定正式 Schema 文件。"
      }) };
    }
    if (matches.length > 1) {
      return { diagnostic: D.create({
        code: D.CODE.SCHEMA_SOURCE_AMBIGUOUS,
        message: "所选目录中发现多个 protocol.schema.json，无法确定正式 Schema。",
        details: { candidates: matches.map(function (m) { return m.path; }).sort() }
      }) };
    }
    return { record: matches[0] };
  }

  function initialize(snapshot, schemaOverride) {
    var resolved = resolveSchema(snapshot, schemaOverride);
    if (resolved.diagnostic) return blocked(snapshot, [resolved.diagnostic]);

    var schemaDocument;
    try {
      schemaDocument = JSON.parse(resolved.record.text);
    } catch (e) {
      return blocked(snapshot, [D.create({
        code: D.CODE.SCHEMA_COMPILE_FAILED,
        filePath: resolved.record.path,
        message: "正式 Schema 不是合法 JSON：" + (e && e.message ? e.message : String(e))
      })]);
    }

    var validator = A.SchemaValidator.create(schemaDocument, resolved.record.path);
    if (!validator.ok) return blocked(snapshot, [validator.diagnostic]);

    var sessionDiagnostics = [];
    if (snapshot.protocolFiles.length === 0) {
      sessionDiagnostics.push(D.create({
        code: D.CODE.NO_PROTOCOL_FILE_FOUND,
        severity: D.SEVERITY.WARNING,
        message: "所选目录中未发现 protocols/**/protocol.json。"
      }));
    }

    var loadResults = A.ProtocolLoader.loadAll(snapshot.protocolFiles);
    var registry = A.ProtocolRegistry.build(loadResults, validator, A.ProtocolSemanticValidator, sessionDiagnostics);

    return Object.freeze({
      sessionId: "S" + (++seq),
      createdAt: new Date().toISOString(),
      rootName: snapshot.rootName,
      snapshot: snapshot,
      schema: Object.freeze({
        filePath: resolved.record.path,
        schemaId: validator.schemaId,
        dialect: validator.dialect
      }),
      registry: registry,
      diagnostics: Object.freeze(sessionDiagnostics)
    });
  }

  A.ProtocolSession = Object.freeze({ initialize: initialize });
})(typeof globalThis !== "undefined" ? globalThis : this);
