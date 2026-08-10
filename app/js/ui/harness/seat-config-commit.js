/* AI Council v0.1 — F1 · SeatConfigCommit：席位配置「保存」提交（无 DOM）。
 * 用户 ONE-SCREEN-F1 §十：挂起式编辑 → [保存配置] → 写入席位运行配置 → 自动返回会议运行。
 * 冻结语义 §七/§八：role_class（角色身份）创建后冻结；model_ref / transport_kind / 显示名 /
 * web_url / 立场 / 备注创建后仍可改——「Freeze Meeting ≠ Freeze Seat Configuration」。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;

  function find(list, pid) {
    for (var i = 0; i < (list || []).length; i++) if (list[i].participant_id === pid) return list[i];
    return null;
  }

  function run(pid, seatId, edits) {
    var actions = A.ConsoleActions;
    var meeting = A.HarnessStore.get().meeting;

    if (meeting) {
      var mp = find(meeting.participants, pid);
      var r = A.SeatConfigRules.applyToParticipant(mp, edits, true);
      if (!r.ok) return r;
    } else {
      var dp = find(actions.getDraft().participants, pid);
      var r2 = A.SeatConfigRules.applyToParticipant(dp, edits, false);
      if (!r2.ok) return r2;
      actions.persistDraft();
    }

    /* 显示名 / 网页 URL 属于 Transport Profile；profile 不存在（如自定义 model_ref）时自动创建（F2-F1）。
     * T25-F2：model_ref 变更时显示名/URL 跟随目标 profile（默认表），未变更才用表单值——避免旧名覆盖新模型。 */
    var profiles = actions.getProfiles();
    var targetRef = (edits.model_ref || "").trim();
    var refChanged = targetRef !== (edits.origModelRef || "").trim();
    var prof = A.RelayProfiles.findByModelRef(profiles, targetRef);
    actions.setProfiles(A.RelayProfiles.upsert(profiles, {
      profile_id: prof ? prof.profile_id : ("seat-" + pid),
      display_name: refChanged ? (prof ? prof.display_name : (edits.display_name || targetRef)) : edits.display_name,
      model_ref: targetRef,
      web_url: refChanged ? (prof ? prof.web_url : (edits.web_url || "")) : edits.web_url
    }));
    A.SeatLocalConfig.setStance(pid, edits.stance);
    A.SeatLocalConfig.setNote(pid, edits.note);
    A.SeatLocalConfig.setRuntimeConfig(pid, edits.model_ref, edits.transport_kind);   /* F2-F1：席位运行配置持久化 */
    A.SeatEditDraft.clear(pid);   /* 保存成功：草稿落库并清除（G06） */
    A.WebRelayActions.say(seatId + " 配置已保存。", "ok");
    actions.setMode("run");   /* 保存后自动返回会议界面（§十） */
    A.HarnessStore.notify();
    return { ok: true };
  }

  A.SeatConfigCommit = Object.freeze({ run: run });
})(typeof globalThis !== "undefined" ? globalThis : this);
