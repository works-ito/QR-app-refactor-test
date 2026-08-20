/*
 * イレギュラー受付：登録可否共通ガード（開発版 v43）
 *
 * GASは変更しない。
 * 複数選択時は全件判定し、1件でもNGなら追加全体を停止する。
 * NG管理番号は赤表示し、管理番号ごとの理由を画面内に表示する。
 * 簡易個体だけ4桁ゼロ埋めIDと正式IDを照合して現在状態を参照する。
 */
(function() {
  "use strict";

  const STYLE_ID = "irregularRegistrationGuardDevStyle";

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #irregularMasterPickerDev .irregularMasterChoice.isBlocked {
        border-color:#dc2626 !important;
        background:#fef2f2 !important;
        color:#b91c1c !important;
        box-shadow:inset 0 0 0 1px #dc2626 !important;
      }
      #irregularMasterPickerDev .irregularMasterChoice.isBlocked small {
        color:#b91c1c !important;
      }
      #irregularMasterValidationErrors {
        margin:10px 0;
        padding:10px 11px;
        border:1px solid #fecaca;
        border-radius:10px;
        background:#fef2f2;
        color:#991b1b;
        font-size:12px;
        line-height:1.55;
        white-space:pre-line;
      }
      #irregularMasterValidationErrors strong {
        display:block;
        margin-bottom:4px;
        font-size:13px;
      }
    `;
    document.head.appendChild(style);
  }

  function normalize(text) {
    return String(text == null ? "" : text).trim();
  }

  function currentMode() {
    const mode = document.getElementById("mode");
    return normalize(mode && mode.value);
  }

  function getFirstValue(item, keys) {
    if (!item) return "";
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(item, key)) {
        const found = item[key];
        if (found !== undefined && found !== null && found !== "") return normalize(found);
      }
    }
    return "";
  }

  function managedIdOf(item) {
    return getFirstValue(item,["管理ID","管理番号","managedId","managementId","machineId","id"]);
  }

  function stateOf(item) {
    return getFirstValue(item,["現在状態","最新状態","状態","管理状態","作業区分","status","currentStatus"]);
  }

  function allManagedSourceItems() {
    const rows = [];
    try {
      if (typeof simpleItems !== "undefined" && Array.isArray(simpleItems)) rows.push(...simpleItems);
      if (typeof individualItems !== "undefined" && Array.isArray(individualItems)) rows.push(...individualItems);
      if (typeof recItems !== "undefined" && Array.isArray(recItems)) rows.push(...recItems);
      if (typeof managedMasterItems !== "undefined" && Array.isArray(managedMasterItems)) rows.push(...managedMasterItems);
    } catch (error) {
      console.warn("開発版ガード：現在状態データの参照に失敗しました",error);
    }
    return rows;
  }

  function findManagedItem(managedId) {
    const target = normalize(managedId);
    if (!target) return null;

    const exact = allManagedSourceItems().find(function(item){
      return managedIdOf(item) === target;
    }) || null;

    try {
      if (typeof window.getIrregularSimpleAliasRecord === "function") {
        const alias = window.getIrregularSimpleAliasRecord(target);
        if (alias && alias.item) return alias.item;
      }
    } catch (error) {
      console.warn("開発版ガード：簡易個体IDの照合に失敗しました",error);
    }

    return exact;
  }

  function queueContainsManagedId(managedId) {
    const target = normalize(managedId);
    if (!target) return false;
    const list = document.getElementById("irregularMasterQueueList");
    if (!list) return false;
    return Array.from(list.querySelectorAll(".irregularMasterQueueMain")).some(function(el){
      return normalize(el.textContent) === target;
    });
  }

  function recentWorkBlocked(managedId,mode) {
    try {
      if (typeof isRecentSuccessfulWork === "function") return Boolean(isRecentSuccessfulWork(managedId,mode));
    } catch (error) {
      console.warn("開発版ガード：直近送信判定を参照できませんでした",error);
    }
    return false;
  }

  function validateTransition(currentState,mode) {
    try {
      if (typeof validateStateTransition === "function") return validateStateTransition(currentState,mode);
    } catch (error) {
      console.warn("開発版ガード：既存状態遷移判定を参照できませんでした",error);
    }
    return {ok:true,warning:true,message:"既存の状態遷移判定を取得できないため、開発版では判定を保留しました。"};
  }

  function canAddIrregularItem(record,options) {
    const data = record || {};
    const config = options || {};
    const mode = normalize(config.mode || currentMode());

    if (data.type === "quantity") {
      return {ok:true,warning:false,code:"QUANTITY_OK",message:""};
    }

    const managedId = normalize(data.managedId);
    if (!managedId) {
      return {ok:false,warning:false,code:"MANAGED_ID_REQUIRED",message:"管理番号を選択してください。"};
    }

    if (!config.skipQueueCheck && queueContainsManagedId(managedId)) {
      return {ok:false,warning:false,code:"DUPLICATE_IN_QUEUE",managedId:managedId,message:"すでに追加済みです。"};
    }

    if (mode && recentWorkBlocked(managedId,mode)) {
      return {
        ok:false,warning:false,code:"RECENT_SUCCESS_DUPLICATE",managedId:managedId,
        message:"直近に同じ作業で送信済みのため、二重登録防止で追加できません。"
      };
    }

    const item = findManagedItem(managedId);
    if (!item) {
      return {
        ok:true,warning:true,code:"STATE_NOT_FOUND",managedId:managedId,
        message:"現在状態を取得できませんでした。"
      };
    }

    const currentState = stateOf(item);
    const transition = validateTransition(currentState,mode);
    const ok = Boolean(transition && transition.ok);

    return {
      ok:ok,
      warning:Boolean(transition && transition.warning),
      code:ok ? "STATE_OK" : "STATE_BLOCKED",
      message:normalize(transition && transition.message),
      managedId:managedId,
      mode:mode,
      currentState:currentState
    };
  }

  window.canAddIrregularItem = canAddIrregularItem;

  function selectedManagedIdsFromUi(button) {
    if (!button) return [];
    try {
      const parsed = JSON.parse(button.dataset.managedIds || "[]");
      if (Array.isArray(parsed)) return parsed.map(normalize).filter(Boolean);
    } catch (error) {
      console.warn("開発版ガード：選択管理番号の解析に失敗しました",error);
    }
    return [];
  }

  function clearBlockedUi() {
    document.querySelectorAll("#irregularMasterIdGrid .irregularMasterChoice.isBlocked").forEach(function(button) {
      button.classList.remove("isBlocked");
    });
    const box = document.getElementById("irregularMasterValidationErrors");
    if (box) box.remove();
  }

  function markBlockedResults(results) {
    clearBlockedUi();
    const blocked = results.filter(function(result){return !result.ok});
    if (!blocked.length) return;

    blocked.forEach(function(result) {
      const id = normalize(result.managedId);
      const button = Array.from(document.querySelectorAll("#irregularMasterIdGrid .irregularMasterChoice[data-managed-id]")).find(function(candidate) {
        return normalize(candidate.dataset.managedId) === id;
      });
      if (button) button.classList.add("isBlocked");
    });

    const pending = document.getElementById("irregularMasterPending");
    if (!pending) return;

    const box = document.createElement("div");
    box.id = "irregularMasterValidationErrors";
    const heading = document.createElement("strong");
    heading.textContent = "登録できない管理番号があります";
    box.appendChild(heading);

    const lines = blocked.map(function(result) {
      const state = normalize(result.currentState);
      const reason = normalize(result.message) || "現在の状態ではこの作業を登録できません。";
      return (result.managedId || "管理番号不明") +
        (state ? "（現在状態：" + state + "）" : "") +
        "\n" + reason;
    });
    box.appendChild(document.createTextNode(lines.join("\n\n")));
    pending.insertAdjacentElement("beforebegin",box);
  }

  function showWarnings(results) {
    const messages = results.map(function(result){
      return (result.managedId ? result.managedId+"：" : "") + result.message;
    }).filter(Boolean);
    if (!messages.length) return;
    const notice = document.getElementById("irregularMasterNotice");
    if (!notice) return;
    notice.textContent = messages.join("\n");
    notice.hidden = false;
  }

  function guardMachineAdd(event) {
    const button = event.target && event.target.closest
      ? event.target.closest("#irregularMasterAddMachine")
      : null;
    if (!button) return;

    clearBlockedUi();
    const ids = selectedManagedIdsFromUi(button);
    if (!ids.length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const results = ids.map(function(managedId){
      return canAddIrregularItem({type:"machine",managedId:managedId});
    });

    const blocked = results.filter(function(result){return !result.ok});
    if (blocked.length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      markBlockedResults(results);
      return;
    }

    showWarnings(results.filter(function(result){return result.warning}));
  }

  /* 赤いNG番号をユーザー自身が外したら、その番号の赤表示だけ解除する。 */
  document.addEventListener("click",function(event) {
    const choice = event.target && event.target.closest
      ? event.target.closest("#irregularMasterIdGrid .irregularMasterChoice")
      : null;
    if (!choice) return;
    choice.classList.remove("isBlocked");
    const box = document.getElementById("irregularMasterValidationErrors");
    if (box) box.remove();
  },false);

  injectStyle();
  document.addEventListener("click",guardMachineAdd,true);
  console.info("開発版：イレギュラー受付 共通登録ガード v43 読込完了");
})();
