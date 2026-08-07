/* AI Council v0.1 — D1-R4
 * MeetingSchemaValidator：用正式 meeting.schema.json（Draft 2020-12）校验存档文档。
 *
 * 设计（计划 §42~§46）：
 *  - meeting.schema 通过 $ref 引用 role/message/artifact/annotation schema，必须把依赖 Schema
 *    注册进“同一个” Ajv 实例，不能只把 meeting.schema 单独丢给 Ajv。
 *  - 复用 ProtocolSchemaValidator 的错误翻译（SCHEMA_VALIDATION_FAILED + JSON Path）。
 *  - Schema Pack 不完整（缺任一依赖）→ PERSISTENCE_SCHEMA_PACK_INCOMPLETE，禁止静默跳过 $ref。
 */
(function (root) {
  "use strict";

  var D = root.AICouncil.Diagnostic;
  var C = D.CODE;

  function ajvConstructor() {
    var b = root.AjvBundle;
    if (!b) throw new Error("vendor/ajv2020.bundle.js 未加载");
    return b.default || b.Ajv2020 || b;
  }

  /* schemaPack: { meeting, role, message, artifact, annotation }（均已 JSON.parse 的对象） */
  function create(schemaPack) {
    if (!schemaPack || !schemaPack.meeting || !schemaPack.role || !schemaPack.message ||
        !schemaPack.artifact || !schemaPack.annotation) {
      return Object.freeze({
        ok: false,
        diagnostic: D.create({
          code: C.PERSISTENCE_SCHEMA_PACK_INCOMPLETE,
          message: "Meeting Schema Pack 不完整：meeting/role/message/artifact/annotation 五个 Schema 必须齐备。"
        })
      });
    }

    var Ajv, ajv;
    try {
      Ajv = ajvConstructor();
      ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
      ajv.addSchema(schemaPack.role);
      ajv.addSchema(schemaPack.message);
      ajv.addSchema(schemaPack.artifact);
      ajv.addSchema(schemaPack.annotation);
      ajv.addSchema(schemaPack.meeting);
    } catch (e) {
      return Object.freeze({
        ok: false,
        diagnostic: D.create({
          code: C.SCHEMA_COMPILE_FAILED,
          message: "Meeting Schema Pack 编译失败：" + (e && e.message ? e.message : String(e))
        })
      });
    }

    var meetingId = schemaPack.meeting.$id;

    function validate(archive) {
      var valid = ajv.validate(meetingId, archive) === true;
      var errors = valid ? [] : (ajv.errors || []);
      return Object.freeze({
        ok: valid,
        diagnostics: root.AICouncil.SchemaValidator.toDiagnostics(errors, "meeting.schema.json", null)
      });
    }

    return Object.freeze({ ok: true, schemaId: meetingId, validate: validate });
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingSchemaValidator = Object.freeze({ create: create });
})(typeof globalThis !== "undefined" ? globalThis : this);
