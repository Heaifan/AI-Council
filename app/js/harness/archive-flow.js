/* AI Council v0.1 — D2-F1
 * ArchiveFlow：Save / Load 的完整校验流水线（无 DOM，可在 Node 中直接测试）。
 *
 * Save：Runtime Meeting → MeetingArchive.build → meeting.schema 校验 → 交给视图落盘。
 * Load：文本 → parse → meeting.schema 校验 → Restore 语义校验（协议存在/指纹一致/状态一致）→ 原子恢复。
 * 任一环节失败都返回结构化 message，绝不产出半个会议。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;

  function schemaValidator(schemaPack) {
    if (!schemaPack) return { ok: false, message: "Schema Pack 不完整（缺 meeting/role/message/artifact/annotation 之一）。" };
    var sv = A.MeetingSchemaValidator.create(schemaPack);
    if (!sv.ok) return { ok: false, message: "Schema Pack 编译失败：" + sv.diagnostic.message };
    return { ok: true, validator: sv };
  }

  /* → Promise<{ ok, archive?, message }> */
  function buildArchive(meeting, protocol, schemaPack) {
    if (!meeting) return Promise.resolve({ ok: false, message: "没有活动会议，请先 Create Demo Meeting。" });
    var sv = schemaValidator(schemaPack);
    if (!sv.ok) return Promise.resolve({ ok: false, message: sv.message });
    return A.MeetingArchive.build(meeting, protocol).then(function (archive) {
      var res = sv.validator.validate(archive);
      if (!res.ok) return { ok: false, message: "存档 Schema 校验失败：" + res.diagnostics[0].message };
      return {
        ok: true, archive: archive,
        message: "存档已生成（Events " + archive.events.length + " · Checkpoints " + archive.checkpoints.length + "）。"
      };
    }).catch(function (e) {
      return { ok: false, message: "存档构建失败：" + (e && e.message ? e.message : String(e)) };
    });
  }

  function findProtocol(available, snap) {
    var list = available || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].protocolId === snap.protocol_id && list[i].version === snap.version) return list[i];
    }
    return null;
  }

  /* → Promise<{ ok, meeting?, protocol?, message }> */
  function restoreFrom(text, schemaPack, available) {
    var p = A.MeetingPersistence.parse(text);
    if (!p.ok) return Promise.resolve({ ok: false, message: p.diagnostic.message });
    var sv = schemaValidator(schemaPack);
    if (!sv.ok) return Promise.resolve({ ok: false, message: sv.message });
    var res = sv.validator.validate(p.value);
    if (!res.ok) return Promise.resolve({ ok: false, message: "存档 Schema 校验失败：" + res.diagnostics[0].message });

    return A.MeetingRestoreValidator.validate(p.value, available || []).then(function (rv) {
      if (!rv.ok) return { ok: false, message: "Restore 语义校验失败：" + rv.diagnostics[0].message };
      var m = A.MeetingRestore.restore(p.value);
      return {
        ok: true, meeting: m,
        protocol: findProtocol(available, p.value.protocol_snapshot),
        message: "已恢复会议：" + m.status + " / " + (m.currentPhaseId || "—") + "（原子提交）。"
      };
    }).catch(function (e) {
      return { ok: false, message: "恢复失败：" + (e && e.message ? e.message : String(e)) };
    });
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.ArchiveFlow = Object.freeze({ buildArchive: buildArchive, restoreFrom: restoreFrom });
})(typeof globalThis !== "undefined" ? globalThis : this);
