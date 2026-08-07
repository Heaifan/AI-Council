/* AI Council v0.1 — D1-R1
 * ProtocolDiagnostic：统一的规则加载/校验诊断记录。
 * 唯一职责：定义诊断代码、严重度与不可变诊断对象。禁止静默忽略任何失败。
 */
(function (root) {
  "use strict";

  var CODE = Object.freeze({
    FILE_READ_FAILED: "FILE_READ_FAILED",
    JSON_PARSE_FAILED: "JSON_PARSE_FAILED",
    SCHEMA_VALIDATION_FAILED: "SCHEMA_VALIDATION_FAILED",
    UNSUPPORTED_SCHEMA_VERSION: "UNSUPPORTED_SCHEMA_VERSION",
    DUPLICATE_PROTOCOL: "DUPLICATE_PROTOCOL",
    SCHEMA_SOURCE_MISSING: "SCHEMA_SOURCE_MISSING",
    SCHEMA_SOURCE_AMBIGUOUS: "SCHEMA_SOURCE_AMBIGUOUS",
    SCHEMA_COMPILE_FAILED: "SCHEMA_COMPILE_FAILED",
    NO_PROTOCOL_FILE_FOUND: "NO_PROTOCOL_FILE_FOUND"
  });

  var SEVERITY = Object.freeze({ ERROR: "error", WARNING: "warning", INFO: "info" });

  function create(fields) {
    return Object.freeze({
      code: fields.code,
      severity: fields.severity || SEVERITY.ERROR,
      filePath: fields.filePath === undefined ? null : fields.filePath,
      protocolId: fields.protocolId === undefined ? null : fields.protocolId,
      protocolVersion: fields.protocolVersion === undefined ? null : fields.protocolVersion,
      jsonPath: fields.jsonPath === undefined ? null : fields.jsonPath,
      message: fields.message || "",
      details: fields.details === undefined ? null : fields.details
    });
  }

  var SAFE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

  /* JSON Pointer（Ajv instancePath）→ JSON Path，例如 /phases/0/actor → $.phases[0].actor */
  function pointerToJsonPath(pointer) {
    if (!pointer) return "$";
    var out = "$";
    var tokens = String(pointer).split("/");
    for (var i = 1; i < tokens.length; i++) {
      var t = tokens[i].replace(/~1/g, "/").replace(/~0/g, "~");
      if (/^\d+$/.test(t)) out += "[" + t + "]";
      else if (SAFE_KEY.test(t)) out += "." + t;
      else out += '["' + t.replace(/"/g, '\\"') + '"]';
    }
    return out;
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.Diagnostic = Object.freeze({
    CODE: CODE,
    SEVERITY: SEVERITY,
    create: create,
    pointerToJsonPath: pointerToJsonPath
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
