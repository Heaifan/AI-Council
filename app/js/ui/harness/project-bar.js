/* AI Council v0.1 — D3 · 会议控制台 · ProjectBar：顶部项目目录条（压缩为一行）。
 * 「项目：AI-Council ✅ 已加载 [更换]」；首次：「尚未授权项目目录 [选择目录]」。
 * 记住上次项目：IndexedDB 保存 rootName（file:// 下无法自动恢复目录读取权限，
 * 浏览器安全模型禁止无用户手势读盘）→ 显示「上次项目：X [重新授权]」，点击即重新授权。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var DB_NAME = "ai-council-last-project";
  var STORE = "meta";

  function db() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === "undefined") { reject(new Error("no indexedDB")); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function readLast() {
    return db().then(function (d) {
      return new Promise(function (resolve) {
        var tx = d.transaction(STORE, "readonly");
        var r = tx.objectStore(STORE).get("rootName");
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }

  function writeLast(name) {
    return db().then(function (d) {
      return new Promise(function (resolve) {
        var tx = d.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(name, "rootName");
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    }).catch(function () { /* 存储不可用不影响主流程 */ });
  }

  /* rootName 显示名：取路径最后一段，过长省略。 */
  function shortName(name) {
    if (!name) return "（未选择）";
    var parts = String(name).replace(/[\\/]+$/, "").split(/[\\/]/);
    var last = parts[parts.length - 1] || name;
    return last.length > 24 ? last.slice(0, 24) + "…" : last;
  }

  function render(host, state, onChoose) {
    if (!host) return;
    A.Dom.clear(host);
    if (state.session && state.session.rootName) {
      host.appendChild(A.Dom.el("span", "project-name", "项目：" + shortName(state.session.rootName)));
      host.appendChild(A.Dom.el("span", "project-ok", " ✅ 已加载"));
      var chg = A.Dom.el("button", "btn secondary small", "更换");
      chg.id = "project-change";
      chg.addEventListener("click", onChoose);
      host.appendChild(chg);
      return;
    }
    readLast().then(function (last) {
      if (last) {
        host.appendChild(A.Dom.el("span", "project-name", "上次项目：" + shortName(last)));
        var re = A.Dom.el("button", "btn secondary small", "重新授权");
        re.id = "project-reauth";
        re.addEventListener("click", onChoose);
        host.appendChild(re);
      } else {
        host.appendChild(A.Dom.el("span", "project-name", "尚未授权项目目录"));
        var choose = A.Dom.el("button", "btn primary small", "选择目录");
        choose.id = "project-choose";
        choose.addEventListener("click", onChoose);
        host.appendChild(choose);
      }
    });
  }

  A.ProjectBar = Object.freeze({ render: render, writeLast: writeLast, readLast: readLast, shortName: shortName });
})(typeof globalThis !== "undefined" ? globalThis : this);
