/* AI Council v0.1 — D1-R4
 * MeetingPersistence：单 JSON 存档的序列化、反序列化，以及浏览器侧 Save / Load（无服务器）。
 *
 * 设计（计划 §61~§66）：
 *  - serialize：JSON.stringify(archive, null, 2)，人类可读。
 *  - parse：JSON.parse 失败 → PERSISTENCE_JSON_PARSE_FAILED（结构化诊断，不抛到 UI）。
 *  - Browser Save：Blob + <a download>，文件名 <meeting-id>.meeting.json。
 *  - Browser Load：<input type=file accept=.json> → File.text()，返回文本（后续交给 Schema + Restore 校验）。
 *  - 不直接用 localStorage / IndexedDB 作为正式存档（§66）。
 */
(function (root) {
  "use strict";

  var D = root.AICouncil.Diagnostic;
  var C = D.CODE;

  function serialize(archive) {
    return JSON.stringify(archive, null, 2);
  }

  /* 返回 { ok, value } 或 { ok:false, diagnostic } */
  function parse(text) {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e) {
      return { ok: false, diagnostic: D.create({
        code: C.PERSISTENCE_JSON_PARSE_FAILED,
        message: "Meeting JSON 解析失败：" + (e && e.message ? e.message : String(e))
      }) };
    }
  }

  function fileName(meetingId) {
    return (meetingId || "meeting") + ".meeting.json";
  }

  /* 上一次下载产生的 Object URL：在下一次保存时惰性回收。
   * 不使用定时器（项目静态审计禁止 setTimeout / setInterval / requestAnimationFrame），
   * 也不在 click() 之后立刻 revoke（部分浏览器会导致下载被中断）。 */
  var pendingObjectUrl = null;

  function releasePendingObjectUrl() {
    if (pendingObjectUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
      URL.revokeObjectURL(pendingObjectUrl);
    }
    pendingObjectUrl = null;
  }

  /* 浏览器：触发下载。非浏览器环境（Node 测试）调用会抛错，由调用方捕获。 */
  function browserSave(archive, meetingId) {
    if (typeof document === "undefined") throw new Error("browserSave 仅在浏览器环境可用。");
    releasePendingObjectUrl();
    var text = serialize(archive);
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    pendingObjectUrl = url;
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName(meetingId || archive.meeting_id);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /* 浏览器：弹出文件选择框，返回 Promise<text>。非浏览器环境不可用。 */
  function browserLoad() {
    if (typeof document === "undefined") return Promise.reject(new Error("browserLoad 仅在浏览器环境可用。"));
    return new Promise(function (resolve, reject) {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.addEventListener("change", function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) { reject(new Error("未选择文件。")); return; }
        f.text().then(resolve, function (err) { reject(err); });
      });
      input.click();
    });
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingPersistence = Object.freeze({
    serialize: serialize,
    parse: parse,
    fileName: fileName,
    browserSave: browserSave,
    browserLoad: browserLoad,
    releasePendingObjectUrl: releasePendingObjectUrl
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
