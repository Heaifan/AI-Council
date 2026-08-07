/* AI Council v0.1 — D1-R4
 * ProtocolFingerprint：对 Protocol 计算语义稳定的 Canonical SHA-256。
 *
 * 设计点（服从计划 §9~§12）：
 *  - 不直接对磁盘原始字节求哈希：LF / CRLF / 缩进 / 多余空格都不应改变指纹。
 *  - 先 JSON.parse 成对象，再 Canonical 序列化（对象 Key 稳定排序、Array 顺序保持、无多余空格、UTF-8）。
 *  - SHA-256 只走 Web Crypto（crypto.subtle.digest），禁止自己发明 hash 算法冒充 SHA-256。
 *  - 环境无 Web Crypto：明确抛出 PERSISTENCE_CRYPTO_UNAVAILABLE，绝不 silent fallback。
 */
(function (root) {
  "use strict";

  var C = root.AICouncil && root.AICouncil.Diagnostic && root.AICouncil.Diagnostic.CODE;

  /* 取 Web Crypto 的 SHA-256 digest 函数；缺失则明确报错 */
  function subtleSha256() {
    var c = root.crypto || (typeof globalThis !== "undefined" ? globalThis.crypto : null);
    if (!c || !c.subtle || typeof c.subtle.digest !== "function") {
      var err = new Error("Web Crypto (crypto.subtle.digest SHA-256) 不可用，无法计算 Protocol 指纹。");
      err.code = C ? C.PERSISTENCE_CRYPTO_UNAVAILABLE : "PERSISTENCE_CRYPTO_UNAVAILABLE";
      throw err;
    }
    return function (bytes) {
      return c.subtle.digest("SHA-256", bytes).then(function (buf) {
        return buf;
      });
    };
  }

  /* Canonical JSON：对象 Key 升序排序、Array 顺序保持、无多余空白 */
  function canonicalize(value) {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      var items = value.map(function (v) { return canonicalize(v); });
      return "[" + items.join(",") + "]";
    }
    var keys = Object.keys(value).sort();
    var parts = keys.map(function (k) {
      return JSON.stringify(k) + ":" + canonicalize(value[k]);
    });
    return "{" + parts.join(",") + "}";
  }

  function utf8Bytes(str) {
    /* 浏览器与 Node 通用：用 encodeURIComponent 避免依赖 TextEncoder（更稳） */
    var out = [];
    var raw = encodeURIComponent(str);
    for (var i = 0; i < raw.length; i++) {
      var ch = raw[i];
      if (ch === "%") {
        out.push(parseInt(raw.substr(i + 1, 2), 16));
        i += 2;
      } else {
        out.push(ch.charCodeAt(0));
      }
    }
    return new Uint8Array(out);
  }

  function toHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) {
      hex += ("0" + bytes[i].toString(16)).slice(-2);
    }
    return hex;
  }

  /* 对“已解析的 Protocol 对象”计算 Canonical SHA-256（异步，返回 Promise<string>）。 */
  function sha256Canonical(protocol) {
    var doc = (protocol && protocol.document) ? protocol.document : protocol;
    var digest = subtleSha256();
    var canonical = canonicalize(doc);
    return Promise.resolve(digest(utf8Bytes(canonical))).then(toHex);
  }

  /* 同步辅助：仅做 Canonical 序列化（供测试断言“不同 Key 顺序产出相同字符串”）。 */
  function canonicalJSON(protocol) {
    var doc = (protocol && protocol.document) ? protocol.document : protocol;
    return canonicalize(doc);
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.ProtocolFingerprint = Object.freeze({
    canonicalize: canonicalize,
    canonicalJSON: canonicalJSON,
    utf8Bytes: utf8Bytes,
    toHex: toHex,
    sha256Canonical: sha256Canonical
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
