/* AI Council v0.1 — D2-R2
 * PromptRenderer：确定性地把 InstructionPacket 渲染为人类可读的 Prompt 文本。
 *
 * 设计边界（服从 D2-R1 报告 §27 + Role-Card-Spec §4/§5 + Council-Constitution §4）：
 *  - 纯函数、100% 确定、JSON-safe（输出为 string，无 Map/Set/Function/时钟副作用）。
 *  - 严格只消费 Packet 字段，绝不回查 protocol / meeting / role 文件（Packet 即唯一事实来源）。
 *  - 不接 LLM、不接 Transport（D2-R3）、不修改 Compiler / Runtime。
 *  - 可见性（Role-Card-Spec §5 / Constitution §4）含义：
 *      · Agent 自身始终必须知道自己角色卡、阵营、任务（§4）→ 角色职责段**始终完整渲染**。
 *      · 可见性模式只控制「对外标识」段（即其他参会者能看到什么）：
 *          public           → 真实 alias / participant_id / 阵营 / 角色 全公开
 *          semi_anonymous   → 阵营 / 角色公开；个人 alias 与 participant_id 隐藏；底层模型本就不出现在 Packet 中（天然隐藏）
 *          full_anonymous   → 仅显示阵营字母（A/B）+ 确定性代号（A1…A9）；角色与 ID 隐藏
 *  - meeting.visibility_mode 为权威模式（packet 必含）；include_visibility_rules 仅控制是否渲染「可见性规则」解释段。
 */
(function (root) {
  "use strict";

  var D = root.AICouncil.Diagnostic;
  var C = D.CODE;

  var RENDERER_VERSION = "0.1.0";
  var KNOWN_MODES = ["public", "semi_anonymous", "full_anonymous"];

  function di(code, message, details) {
    return D.create({ code: code, message: message, details: details || null });
  }

  /* FNV-1a 32-bit，纯 JS，与编译器同源算法，保证浏览器/Node 同结果（仅用于 full_anonymous 代号派生）。 */
  function fnv1a32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function isObj(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }
  function safeArr(a) { return Array.isArray(a) ? a : []; }
  function esc(s) {
    if (typeof s === "string") return s;
    if (s === null || s === undefined) return "";
    return String(s);
  }

  /* ---------- 段落构造（均为纯函数，输入 Packet 片段，输出字符串） ---------- */

  function header(p) {
    var lines = [];
    lines.push("# AI 顾问委员会 · 指令提示（Instruction Prompt）");
    lines.push("");
    lines.push("## 协议 / 会议 / 阶段");
    lines.push("- 协议：" + esc(p.protocol.protocol_id) + " @ " + esc(p.protocol.protocol_version));
    lines.push("- 会议：" + esc(p.meeting.meeting_id));
    lines.push("- 阶段：" + esc(p.phase.phase_name) + "（" + esc(p.phase.phase_kind) +
      "，phase_id=" + esc(p.phase.phase_id) + "）");
    return lines.join("\n");
  }

  function selfLabel(p) {
    var t = p.target || {};
    var mode = (p.meeting && p.meeting.visibility_mode) || "public";
    var alias = esc(t.alias);
    var pid = esc(t.participant_id);
    var side = esc(t.side_id);
    var rc = t.role_class ? esc(t.role_class) : "";
    var roleName = (p.role_card && p.role_card.name) ? esc(p.role_card.name) : "";
    var label;
    if (mode === "public") {
      label = "对外标识：" + (alias ? alias + "（" : "") + "participant_id=" + pid + (alias ? "）" : "") +
        " · 阵营 " + (side || "?") + " · 角色 " + (roleName ? roleName + "（" + rc + "）" : rc);
    } else if (mode === "semi_anonymous") {
      label = "对外标识：阵营 " + (side || "?") + " · 角色 " + (roleName ? roleName + "（" + rc + "）" : rc) +
        " · （个人代号/ID 不公开，底层模型身份隐藏）";
    } else if (mode === "full_anonymous") {
      var sideLetter = (side && side.length) ? side.charAt(0).toUpperCase() : "X";
      var idx = (fnv1a32(pid || side || "x") % 9) + 1;
      label = "对外标识：代号 " + sideLetter + idx +
        "（阵营仅以 " + sideLetter + " 表示；角色与 ID 不公开）";
    } else {
      /* null 或未知 → 按 public 兜底（未知串由 render 入口拦截，不会到此处） */
      label = "对外标识：" + (alias ? alias + "（" : "") + "participant_id=" + pid + (alias ? "）" : "") +
        " · 阵营 " + (side || "?") + " · 角色 " + (roleName ? roleName + "（" + rc + "）" : rc);
    }
    return "## 你的身份（对外标识）\n" + label;
  }

  function roleCardSection(p) {
    var rc = p.role_card;
    if (!rc) return null; /* include_role_card=false → 不渲染角色段 */
    var lines = [];
    lines.push("## 你的角色职责（始终可见）");
    lines.push("- 名称：" + esc(rc.name) + "（" + esc(rc.role_class) + "，role_id=" + esc(rc.role_id) + "）");
    if (rc.description) lines.push("- 描述：" + esc(rc.description));
    if (rc.responsibilities && rc.responsibilities.length) {
      lines.push("- 职责：");
      rc.responsibilities.forEach(function (r) { lines.push("  - " + esc(r)); });
    }
    if (rc.focus_areas && rc.focus_areas.length) {
      lines.push("- 关注维度：" + rc.focus_areas.map(esc).join("、"));
    }
    if (rc.behavioral_constraints && rc.behavioral_constraints.length) {
      lines.push("- 行为约束：");
      rc.behavioral_constraints.forEach(function (b) { lines.push("  - " + esc(b)); });
    }
    if (rc.task_guidance && rc.task_guidance.length) {
      lines.push("- 任务指引：");
      rc.task_guidance.forEach(function (g) { lines.push("  - " + esc(g)); });
    }
    return lines.join("\n");
  }

  function taskSection(p) {
    var instr = p.instruction || {};
    return ["## 本阶段任务", esc(instr.task) || "（未指定任务）"].join("\n");
  }

  /* 议题（meeting.topic）：会议核心事实，经 Compiler 编入 packet.meeting.topic 后原样呈现。 */
  function topicSection(p) {
    var t = p.meeting && p.meeting.topic;
    if (typeof t !== "string" || !t.trim()) return null;
    return "## 会议议题\n" + t.trim();
  }

  function contextSection(p) {
    var instr = p.instruction || {};
    var scope = instr.context_scope || "none";
    var lines = ["## 上下文范围", "- 范围：" + esc(scope)];
    if (scope === "none") {
      lines.push("- 本阶段不共享额外上下文。");
    } else {
      var keys = safeArr(instr.context_keys);
      lines.push(keys.length ? "- 共享键：" + keys.map(esc).join("、") : "- 共享键：（无指定键）");
    }
    return lines.join("\n");
  }

  function visibilitySection(p) {
    if (!(p.instruction && p.instruction.include_visibility_rules === true)) return null;
    var v = p.visibility;
    if (!v) return null;
    var modeText = {
      public: "公开（public）",
      semi_anonymous: "半匿名（semi_anonymous）",
      full_anonymous: "完全匿名（full_anonymous）"
    };
    var matrix = {
      public: "阵营：公开；角色：公开；底层模型：公开",
      semi_anonymous: "阵营：公开；角色：公开；底层模型：隐藏",
      full_anonymous: "阵营：仅显示 A/B；角色：隐藏；底层模型：隐藏"
    };
    var lines = ["## 可见性规则"];
    lines.push("- 模式：" + (modeText[v.mode] || v.mode));
    lines.push("- 披露：" + (matrix[v.mode] || "（未定义）"));
    if (Array.isArray(v.allowed_modes) && v.allowed_modes.length) {
      lines.push("- 允许模式：" + v.allowed_modes.join("、"));
    }
    lines.push("- 注意：不得泄露其他参会者被本模式禁止获得的隐私（见行为约束）。");
    return lines.join("\n");
  }

  function outputSection(p) {
    var oc = p.output_contract || { mode: "text" };
    var mode = oc.mode || "text";
    var lines = ["## 输出合同", "- 模式：" + esc(mode)];
    if (mode === "structured_json") {
      var secs = safeArr(oc.required_sections);
      if (secs.length) lines.push("- 必填字段：" + secs.map(esc).join("、"));
      var schema = oc.json_schema;
      if (schema && typeof schema === "object") {
        var pretty = JSON.stringify(schema, null, 2);
        lines.push("- JSON 骨架：");
        lines.push("  " + pretty.split("\n").join("\n  "));
      } else {
        lines.push("- JSON 骨架（通用）：");
        lines.push('  {\n    "content": "...",\n    "confidence": 0\n  }');
      }
    } else {
      var rs = safeArr(oc.required_sections);
      lines.push(rs.length ? "- 必填小节：" + rs.map(esc).join("、")
        : "- 必填小节：（未指定，建议包含：判断 / 理由 / 风险 / 假设）");
    }
    return lines.join("\n");
  }

  function actorSection(p) {
    var a = p.actor || {};
    var lines = ["## 选中原因", "- actor.selector = " + esc(a.selector || "?")];
    if (a.side_id) lines.push("- 阵营限定：" + esc(a.side_id));
    if (a.role_class) lines.push("- 角色限定：" + esc(a.role_class));
    if (Array.isArray(a.participant_ids) && a.participant_ids.length) {
      lines.push("- 指定参与者：" + a.participant_ids.map(esc).join("、"));
    }
    if (a.selection_key) lines.push("- 选择键：" + esc(a.selection_key));
    return lines.join("\n");
  }

  function footer(p) {
    return "---" +
      "\npacket_id: " + esc(p.packet_id) +
      " · compiler " + esc(p.compiler_version) +
      " · renderer " + RENDERER_VERSION +
      " · deterministic · generated_at " + esc(p.generated_at);
  }

  /* F5：上一阶段正式发言（秘书中立汇总的输入，保留来源引用） */
  function previousSection(list) {
    var lines = ["## 上一阶段正式发言（中立汇总的输入，保留来源）"];
    list.forEach(function (r) {
      lines.push("- " + (r.alias || r.participant_id) + "（" + r.participant_id + "，source=" + r.responseId + "）：");
      lines.push("  " + String(r.text || "").split("\n").join("\n  "));
    });
    return lines.join("\n");
  }

  /* F5：秘书正式汇总——下一阶段所有委员共享的公共上下文（同一份） */
  function secretarySection(s) {
    return ["## 上一阶段秘书汇总（本阶段公共上下文）", String(s.text || "")].join("\n");
  }

  /* ---------- 渲染入口 ---------- */

  /* packet：经 InstructionCompiler 产出的 InstructionPacket（或等价结构）；extras：{previousResponses?, secretarySummary?} F5 上下文注入 */
  function render(packet, extras) {
    if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
      return { ok: false, diagnostics: [di(C.RENDERER_PACKET_INVALID, "PromptRenderer 需要合法的 InstructionPacket 对象。")] };
    }
    /* 必填顶层字段（role_card / visibility 允许为 null，单独处理） */
    var required = ["schema_version", "packet_id", "compiler_version", "protocol", "meeting",
      "phase", "target", "instruction", "output_contract", "actor", "generated_at", "deterministic"];
    for (var i = 0; i < required.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(packet, required[i])) {
        return { ok: false, diagnostics: [di(C.RENDERER_PACKET_INVALID, "InstructionPacket 缺少必填字段：" + required[i])] };
      }
    }
    /* 结构对象必须存在（非 null） */
    var objFields = ["protocol", "meeting", "phase", "target", "instruction", "output_contract", "actor"];
    for (var j = 0; j < objFields.length; j++) {
      if (!isObj(packet[objFields[j]])) {
        return { ok: false, diagnostics: [di(C.RENDERER_PACKET_INVALID, "InstructionPacket 字段应为对象：" + objFields[j])] };
      }
    }
    /* 可见性模式守卫：未知字符串模式直接拒绝（保护红化契约） */
    var mode = packet.meeting.visibility_mode;
    if (typeof mode === "string" && KNOWN_MODES.indexOf(mode) < 0) {
      return { ok: false, diagnostics: [di(C.RENDERER_PACKET_INVALID, "未知的可见性模式：" + mode)] };
    }

    var parts = [
      header(packet),
      topicSection(packet),
      selfLabel(packet),
      roleCardSection(packet),
      taskSection(packet),
      contextSection(packet),
      visibilitySection(packet),
      outputSection(packet),
      actorSection(packet),
      footer(packet)
    ].filter(function (x) { return x !== null; });
    if (extras && extras.previousResponses && extras.previousResponses.length) parts.push(previousSection(extras.previousResponses));
    if (extras && extras.secretarySummary) parts.push(secretarySection(extras.secretarySummary));

    return Object.freeze({ ok: true, text: parts.join("\n\n") + "\n" });
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.PromptRenderer = Object.freeze({
    render: render,
    RENDERER_VERSION: RENDERER_VERSION,
    KNOWN_MODES: KNOWN_MODES
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
