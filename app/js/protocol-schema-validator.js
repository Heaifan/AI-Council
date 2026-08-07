/* AI Council v0.1 — D1-R1
 * ProtocolSchemaValidator：用正式 protocol.schema.json（Draft 2020-12）真实校验。
 * 唯一职责：编译正式 Schema、执行校验、把 Ajv 错误翻译成 ProtocolDiagnostic。
 * 不允许手写 if (!protocol.version) 之类的假校验，也不允许改写正式 Schema。
 */
(function (root) {
  "use strict";

  var D = root.AICouncil && root.AICouncil.Diagnostic;
  var SUPPORTED_SCHEMA_VERSION = "0.1.0";

  function ajvConstructor() {
    var b = root.AjvBundle;
    if (!b) throw new Error("vendor/ajv2020.bundle.js 未加载");
    return b.default || b.Ajv2020 || b;
  }

  /* 输入：已经 JSON.parse 过的正式 Schema 文档 */
  function create(schemaDocument, sourcePath) {
    var compiled, Ajv;
    try {
      Ajv = ajvConstructor();
      var ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
      compiled = ajv.compile(schemaDocument);
    } catch (e) {
      return Object.freeze({
        ok: false,
        sourcePath: sourcePath || null,
        diagnostic: D.create({
          code: D.CODE.SCHEMA_COMPILE_FAILED,
          filePath: sourcePath || null,
          message: "正式 Schema 编译失败：" + (e && e.message ? e.message : String(e))
        })
      });
    }

    function validate(document) {
      var valid = compiled(document) === true;
      var errors = valid ? [] : (compiled.errors || []);
      return Object.freeze({ valid: valid, errors: Object.freeze(errors.slice()) });
    }

    return Object.freeze({
      ok: true,
      sourcePath: sourcePath || null,
      schemaId: schemaDocument && schemaDocument.$id ? schemaDocument.$id : null,
      dialect: schemaDocument && schemaDocument.$schema ? schemaDocument.$schema : null,
      validate: validate
    });
  }

  /* Ajv 可能一次返回多条错误，必须全部保留，不能只显示第一条 */
  function toDiagnostics(errors, filePath, identity) {
    return (errors || []).map(function (err) {
      return D.create({
        code: D.CODE.SCHEMA_VALIDATION_FAILED,
        severity: D.SEVERITY.ERROR,
        filePath: filePath,
        protocolId: identity ? identity.protocolId : null,
        protocolVersion: identity ? identity.version : null,
        jsonPath: D.pointerToJsonPath(err.instancePath),
        message: err.message || "schema violation",
        details: {
          keyword: err.keyword,
          schemaPath: err.schemaPath,
          params: err.params || null
        }
      });
    });
  }

  /* schema_version 与正式机器合同版本不一致时，不应假装能用当前 Schema 判定它 */
  function checkSchemaVersion(identity, filePath) {
    if (!identity || identity.schemaVersion === null) return null;
    if (identity.schemaVersion === SUPPORTED_SCHEMA_VERSION) return null;
    return D.create({
      code: D.CODE.UNSUPPORTED_SCHEMA_VERSION,
      filePath: filePath,
      protocolId: identity.protocolId,
      protocolVersion: identity.version,
      jsonPath: "$.schema_version",
      message: "不支持的 schema_version：" + identity.schemaVersion + "（当前仅支持 " + SUPPORTED_SCHEMA_VERSION + "）",
      details: { expected: SUPPORTED_SCHEMA_VERSION, actual: identity.schemaVersion }
    });
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.SchemaValidator = Object.freeze({
    SUPPORTED_SCHEMA_VERSION: SUPPORTED_SCHEMA_VERSION,
    create: create,
    toDiagnostics: toDiagnostics,
    checkSchemaVersion: checkSchemaVersion
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
