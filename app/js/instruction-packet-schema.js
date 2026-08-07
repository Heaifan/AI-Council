/* AI Council v0.1 — D2-R1
 * InstructionPacketSchemaValidator：用 instruction-packet.schema.json（Draft 2020-12）校验编译产物。
 *
 * 设计（对齐 D1-R4 meeting-schema-validator）：
 *  - 该 Schema 无 $ref 依赖，可单独编译进一个 Ajv 实例。
 *  - 复用 vendor/ajv2020.bundle.js（全局 AjvBundle）与 SchemaValidator.toDiagnostics 错误翻译。
 *  - Schema 缺失 $id / 编译失败 → 明确拒绝，绝不静默跳过校验。
 */
(function (root) {
  "use strict";

  var D = root.AICouncil.Diagnostic;

  function ajvConstructor() {
    var b = root.AjvBundle;
    if (!b) throw new Error("vendor/ajv2020.bundle.js 未加载");
    return b.default || b.Ajv2020 || b;
  }

  /* packetSchema：已 JSON.parse 的 instruction-packet.schema.json 对象 */
  function create(packetSchema) {
    if (!packetSchema || !packetSchema.$id) {
      return Object.freeze({
        ok: false,
        diagnostic: D.create({
          code: D.CODE.SCHEMA_SOURCE_MISSING,
          message: "InstructionPacket Schema 缺失或缺少 $id，无法编译校验器。"
        })
      });
    }

    var Ajv, ajv;
    try {
      Ajv = ajvConstructor();
      ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
      ajv.addSchema(packetSchema);
    } catch (e) {
      return Object.freeze({
        ok: false,
        diagnostic: D.create({
          code: D.CODE.SCHEMA_COMPILE_FAILED,
          message: "InstructionPacket Schema 编译失败：" + (e && e.message ? e.message : String(e))
        })
      });
    }

    var sid = packetSchema.$id;

    function validate(packet) {
      var valid = ajv.validate(sid, packet) === true;
      var errors = valid ? [] : (ajv.errors || []);
      return Object.freeze({
        ok: valid,
        diagnostics: root.AICouncil.SchemaValidator.toDiagnostics(errors, "instruction-packet.schema.json", null)
      });
    }

    return Object.freeze({ ok: true, schemaId: sid, validate: validate });
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.InstructionPacketSchemaValidator = Object.freeze({ create: create });
})(typeof globalThis !== "undefined" ? globalThis : this);
