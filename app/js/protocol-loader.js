/* AI Council v0.1 — D1-R1
 * ProtocolLoader：File 文本 → JSON.parse → Parsed Object。
 * 唯一职责：读取与解析。不做 Schema 校验、不做语义校验、不碰 Runtime / UI。
 */
(function (root) {
  "use strict";

  var D = root.AICouncil && root.AICouncil.Diagnostic;

  /* 解析失败时也要尽量给出可读的身份信息，因此做防御式取值 */
  function readIdentity(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { protocolId: null, version: null, name: null, schemaVersion: null };
    }
    return {
      protocolId: typeof parsed.protocol_id === "string" ? parsed.protocol_id : null,
      version: typeof parsed.version === "string" ? parsed.version : null,
      name: typeof parsed.name === "string" ? parsed.name : null,
      schemaVersion: typeof parsed.schema_version === "string" ? parsed.schema_version : null
    };
  }

  function fail(filePath, code, message, details) {
    return Object.freeze({
      ok: false,
      filePath: filePath,
      parsed: null,
      identity: readIdentity(null),
      diagnostics: Object.freeze([
        D.create({ code: code, severity: D.SEVERITY.ERROR, filePath: filePath, jsonPath: "$", message: message, details: details || null })
      ])
    });
  }

  /* 输入：Snapshot 中的 protocolFile 记录 {path, text, readError} */
  function load(record) {
    if (record.readError) {
      return fail(record.path, D.CODE.FILE_READ_FAILED, "无法读取文件：" + record.readError);
    }
    var parsed;
    try {
      parsed = JSON.parse(record.text);
    } catch (e) {
      return fail(record.path, D.CODE.JSON_PARSE_FAILED, "JSON 解析失败：" + (e && e.message ? e.message : String(e)));
    }
    return Object.freeze({
      ok: true,
      filePath: record.path,
      parsed: parsed,
      identity: Object.freeze(readIdentity(parsed)),
      diagnostics: Object.freeze([])
    });
  }

  function loadAll(records) {
    return Object.freeze((records || []).map(load));
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.ProtocolLoader = Object.freeze({ load: load, loadAll: loadAll, readIdentity: readIdentity });
})(typeof globalThis !== "undefined" ? globalThis : this);
