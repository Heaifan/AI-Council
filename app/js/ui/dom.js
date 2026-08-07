/* AI Council v0.1 — D1-R1
 * 最小 DOM 构造原语。全部使用 textContent，规则文件内容永不作为 HTML 注入。
 */
(function (root) {
  "use strict";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /* 一行 "标签 / 值" */
  function field(label, value) {
    var row = el("div", "field");
    row.appendChild(el("span", "field-key", label));
    row.appendChild(el("span", "field-value", value === null || value === undefined || value === "" ? "—" : value));
    return row;
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.Dom = Object.freeze({ el: el, clear: clear, field: field });
})(typeof globalThis !== "undefined" ? globalThis : this);
