/* AI Council v0.1 — D1-R2
 * ProtocolSemanticValidator：对已经通过 JSON Schema 校验的 Protocol 做确定性程序语义验证。
 * 唯一职责：判断“这套会议规则逻辑上能否被会议 Runtime 执行”。
 * 不修改 Protocol、不依赖 LLM、不做结构/类型校验（那是 Schema Validator 的事）。
 * 复杂度目标 O(P + T)，使用显式 stack / Set，不递归。允许合法循环，但若无路径抵达 $end 则拒绝。
 */
(function (root) {
  "use strict";

  var D = root.AICouncil && root.AICouncil.Diagnostic;
  var C = D ? D.CODE : {};

  function raw(code, jsonPath, message, details) {
    return { code: code, jsonPath: jsonPath, message: message, details: details || null };
  }

  function validate(parsed) {
    var diagnostics = [];
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        valid: false,
        diagnostics: [raw(C.SEMANTIC_INITIAL_PHASE_NOT_FOUND || "SEMANTIC_INITIAL_PHASE_NOT_FOUND",
          "$", "Protocol 不是合法对象，无法做语义验证。")]
      };
    }

    var phases = Array.isArray(parsed.phases) ? parsed.phases : [];
    var phaseIds = Object.create(null);   // phase_id -> first index
    var phaseOrder = [];                   // 去重后的 phase_id 顺序

    /* Stage 1 — 建立索引 + Phase ID 唯一性 */
    phases.forEach(function (p, i) {
      if (!p || typeof p !== "object") return;
      var id = typeof p.phase_id === "string" ? p.phase_id : null;
      if (id === null) return;
      if (phaseIds[id] === undefined) {
        phaseIds[id] = i;
        phaseOrder.push(id);
      } else {
        diagnostics.push(raw(C.SEMANTIC_DUPLICATE_PHASE_ID, "$.phases[" + i + "].phase_id",
          "Phase ID 重复：" + id + " 已在 $.phases[" + phaseIds[id] + "] 定义。",
          { phase_id: id, firstIndex: phaseIds[id], duplicateIndex: i }));
      }
    });

    /* Stage 2 — 直接引用：initial_phase_id */
    var initialExists = false;
    var initial = typeof parsed.initial_phase_id === "string" ? parsed.initial_phase_id : null;
    if (initial !== null) {
      if (phaseIds[initial] === undefined) {
        diagnostics.push(raw(C.SEMANTIC_INITIAL_PHASE_NOT_FOUND, "$.initial_phase_id",
          "initial_phase_id 指向不存在的 Phase：" + initial + "。",
          { initial_phase_id: initial }));
      } else {
        initialExists = true;
      }
    }

    /* Stage 2 — 直接引用：transition target */
    phases.forEach(function (p, i) {
      if (!p || typeof p !== "object") return;
      var id = typeof p.phase_id === "string" ? p.phase_id : ("<phase#" + i + ">");
      var transitions = Array.isArray(p.transitions) ? p.transitions : [];
      transitions.forEach(function (t, j) {
        if (!t || typeof t !== "object") return;
        var target = typeof t.target === "string" ? t.target : null;
        if (target === null) return;
        if (target === "$end") return;                 // 合法正式终止符
        if (phaseIds[target] === undefined) {
          diagnostics.push(raw(C.SEMANTIC_TRANSITION_TARGET_NOT_FOUND, "$.phases[" + i + "].transitions[" + j + "].target",
            "Transition target 不存在：" + target + "（来自 phase " + id + "）。",
            { from: id, target: target }));
        }
      });
    });

    /* Stage 3 — Human Gate 语义 */
    phases.forEach(function (p, i) {
      if (!p || typeof p !== "object") return;
      if (p.kind !== "human_gate") return;
      var actor = (p.actor && typeof p.actor === "object") ? p.actor : {};
      if (actor.selector !== "human_arbiter") {
        diagnostics.push(raw(C.SEMANTIC_HUMAN_GATE_ACTOR_INVALID, "$.phases[" + i + "].actor.selector",
          "human_gate 的 actor.selector 必须是 human_arbiter，实际：" + String(actor.selector) + "。",
          { selector: actor.selector }));
      }
      var completion = (p.completion && typeof p.completion === "object") ? p.completion : {};
      if (completion.mode !== "human_decision") {
        diagnostics.push(raw(C.SEMANTIC_HUMAN_GATE_COMPLETION_INVALID, "$.phases[" + i + "].completion.mode",
          "human_gate 的 completion.mode 必须是 human_decision，实际：" + String(completion.mode) + "。",
          { mode: completion.mode }));
      }
    });

    /* Stage 4 — Side 数量语义 */
    var pp = (parsed.participant_policy && typeof parsed.participant_policy === "object") ? parsed.participant_policy : null;
    if (pp) {
      var sides = Array.isArray(pp.sides) ? pp.sides : [];
      var sideIds = Object.create(null);
      var sumMin = 0, sumMax = 0;
      sides.forEach(function (s, k) {
        if (!s || typeof s !== "object") return;
        var sid = typeof s.side_id === "string" ? s.side_id : null;
        if (sid !== null) {
          if (sideIds[sid] === undefined) sideIds[sid] = k;
          else diagnostics.push(raw(C.SEMANTIC_SIDE_ID_DUPLICATE, "$.participant_policy.sides[" + k + "].side_id",
            "Side ID 重复：" + sid + " 已在 $.participant_policy.sides[" + sideIds[sid] + "] 定义。",
            { side_id: sid, firstIndex: sideIds[sid], duplicateIndex: k }));
        }
        var mn = typeof s.min_members === "number" ? s.min_members : null;
        var mx = typeof s.max_members === "number" ? s.max_members : null;
        if (mn !== null) sumMin += mn;
        if (mx !== null) sumMax += mx;
        if (mn !== null && mx !== null && mn > mx) {
          diagnostics.push(raw(C.SEMANTIC_SIDE_MEMBER_RANGE_INVALID, "$.participant_policy.sides[" + k + "].min_members",
            "Side " + (sid || ("#" + k)) + " 的 min_members(" + mn + ") > max_members(" + mx + ")。",
            { side_id: sid, min_members: mn, max_members: mx }));
        }
      });
      var minAdvisors = typeof pp.min_advisors === "number" ? pp.min_advisors : null;
      var maxAdvisors = typeof pp.max_advisors === "number" ? pp.max_advisors : null;
      if (minAdvisors !== null) {
        if (sumMax < minAdvisors) {
          diagnostics.push(raw(C.SEMANTIC_SIDE_CAPACITY_INVALID, "$.participant_policy.sides",
            "所有 Side 的 max_members 总和(" + sumMax + ") < min_advisors(" + minAdvisors + ")，无法凑齐最低顾问数。",
            { sumMax: sumMax, min_advisors: minAdvisors }));
        }
        if (maxAdvisors !== null && sumMin > maxAdvisors) {
          diagnostics.push(raw(C.SEMANTIC_SIDE_CAPACITY_INVALID, "$.participant_policy.sides",
            "所有 Side 的 min_members 总和(" + sumMin + ") > max_advisors(" + maxAdvisors + ")，无法满足最低/最高约束。",
            { sumMin: sumMin, max_advisors: maxAdvisors }));
        }
      }
    }

    /* Stage 4 — Required Role 数量语义 */
    var roles = Array.isArray(parsed.required_roles) ? parsed.required_roles : [];
    var roleClasses = Object.create(null);
    roles.forEach(function (r, m) {
      if (!r || typeof r !== "object") return;
      var rc = typeof r.role_class === "string" ? r.role_class : null;
      if (rc !== null) {
        if (roleClasses[rc] === undefined) roleClasses[rc] = m;
        else diagnostics.push(raw(C.SEMANTIC_REQUIRED_ROLE_DUPLICATE, "$.required_roles[" + m + "].role_class",
          "Required Role 重复：" + rc + " 已在 $.required_roles[" + roleClasses[rc] + "] 定义。",
          { role_class: rc, firstIndex: roleClasses[rc], duplicateIndex: m }));
      }
      var rmin = typeof r.min_count === "number" ? r.min_count : null;
      var rmax = typeof r.max_count === "number" ? r.max_count : null;
      if (rmin !== null && rmax !== null && rmin > rmax) {
        diagnostics.push(raw(C.SEMANTIC_REQUIRED_ROLE_RANGE_INVALID, "$.required_roles[" + m + "].min_count",
          "Required Role " + (rc || ("#" + m)) + " 的 min_count(" + rmin + ") > max_count(" + rmax + ")。",
          { role_class: rc, min_count: rmin, max_count: rmax }));
      }
    });

    /* Stage 4 — Advisor 与 participant_policy 一致性（§23） */
    if (pp && typeof pp.min_advisors === "number" && typeof pp.max_advisors === "number") {
      var advisorIdx = -1;
      for (var m2 = 0; m2 < roles.length; m2++) {
        if (roles[m2] && roles[m2].role_class === "advisor") { advisorIdx = m2; break; }
      }
      if (advisorIdx >= 0) {
        var a = roles[advisorIdx];
        var amin = typeof a.min_count === "number" ? a.min_count : null;
        var amax = typeof a.max_count === "number" ? a.max_count : null;
        if (amin !== null && amax !== null) {
          var lo = Math.max(amin, pp.min_advisors);
          var hi = Math.min(amax, pp.max_advisors);
          if (lo > hi) {
            diagnostics.push(raw(C.SEMANTIC_ADVISOR_POLICY_CONFLICT, "$.required_roles[" + advisorIdx + "]",
              "advisor 角色区间[" + amin + "," + amax + "] 与 participant_policy 顾问数[" +
                pp.min_advisors + "," + pp.max_advisors + "] 无可行交集。",
              { advisor: [amin, amax], advisors: [pp.min_advisors, pp.max_advisors] }));
          }
        }
      }
    }

    /* Stage 4 — Default Visibility 必须被允许 */
    if (typeof parsed.default_visibility_mode === "string" && Array.isArray(parsed.allowed_visibility_modes)) {
      if (parsed.allowed_visibility_modes.indexOf(parsed.default_visibility_mode) < 0) {
        diagnostics.push(raw(C.SEMANTIC_DEFAULT_VISIBILITY_NOT_ALLOWED, "$.default_visibility_mode",
          "default_visibility_mode(" + parsed.default_visibility_mode + ") 不在 allowed_visibility_modes 中。",
          { default: parsed.default_visibility_mode, allowed: parsed.allowed_visibility_modes.slice() }));
      }
    }

    /* Stage 5/6/7 — Phase Graph 可达性（仅当 initial 存在，避免派生噪音；循环合法） */
    if (initialExists) {
      var adj = Object.create(null);       // phase_id -> [target phase_id]
      var endEdges = Object.create(null);  // phase_id -> 是否存在通往 $end 的边
      phases.forEach(function (p) {
        if (!p || typeof p.phase_id !== "string") return;
        var id = p.phase_id;
        var list = adj[id] || (adj[id] = []);
        var hasEnd = false;
        (Array.isArray(p.transitions) ? p.transitions : []).forEach(function (t) {
          if (!t || typeof t.target !== "string") return;
          if (t.target === "$end") { hasEnd = true; return; }
          if (phaseIds[t.target] !== undefined) list.push(t.target);
        });
        if (hasEnd) endEdges[id] = true;
      });

      var visited = Object.create(null);
      var stack = [initial];
      while (stack.length) {
        var cur = stack.pop();
        if (visited[cur]) continue;
        visited[cur] = true;
        (adj[cur] || []).forEach(function (nxt) { if (!visited[nxt]) stack.push(nxt); });
      }

      /* S06 — Unreachable Phase */
      phaseOrder.forEach(function (id) {
        if (!visited[id]) {
          var idx = phaseIds[id];
          diagnostics.push(raw(C.SEMANTIC_UNREACHABLE_PHASE, "$.phases[" + idx + "].phase_id",
            "Phase 不可达：" + id + " 无法从 initial_phase_id(" + initial + ") 经任何 transition 到达。",
            { phase_id: id }));
        }
      });

      /* S07 — $end Reachability（允许环，但至少要有一条路径抵达 $end） */
      var endReachable = false;
      for (var vk in visited) { if (endEdges[vk]) { endReachable = true; break; } }
      if (!endReachable) {
        diagnostics.push(raw(C.SEMANTIC_END_NOT_REACHABLE, "$.initial_phase_id",
          "从 initial_phase_id(" + initial + ") 出发不存在任何通往 $end 的路径，会议无法合法结束。",
          { initial_phase_id: initial }));
      }
    }

    return { valid: diagnostics.length === 0, diagnostics: diagnostics };
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.ProtocolSemanticValidator = Object.freeze({ validate: validate });
})(typeof globalThis !== "undefined" ? globalThis : this);
