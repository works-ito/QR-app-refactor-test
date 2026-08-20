/*
 * 開発版 v42：簡易個体の4桁ゼロ埋めIDを正式管理番号へ表示統合する。
 *
 * 重要：
 * - 個体・RECの管理番号は一切正規化しない。
 * - 簡易個体機状況だけ、末尾の数字を数値化した照合キーで個体マスタと結び付ける。
 * - 表示・追加に使うIDは個体マスタ(managedMasterItems)側の正式管理番号を優先する。
 * - 同じ照合キーに正式番号が複数ある場合は曖昧なので統合しない。
 * - GAS・初期通信データ・通常QR処理は変更しない。
 */
(function() {
  "use strict";

  const ROOT_ID = "irregularMasterPickerDev";

  function normalize(value) {
    return String(value == null ? "" : value).trim();
  }

  function managedIdOf(item) {
    if (!item) return "";
    return normalize(
      item["管理ID"] ||
      item["管理番号"] ||
      item.managedId ||
      item.managementId ||
      item.machineId ||
      item.id ||
      ""
    );
  }

  function stateOf(item) {
    if (!item) return "";
    return normalize(
      item["状態"] ||
      item["現在状態"] ||
      item["最新状態"] ||
      item["管理状態"] ||
      item.status ||
      item.currentStatus ||
      ""
    );
  }

  function locationOf(item) {
    if (!item) return "";
    return normalize(
      item["拠点"] ||
      item["現在拠点"] ||
      item.location ||
      item.currentLocation ||
      ""
    );
  }

  /* 簡易個体だけに使用する照合キー。ABC-001 / ABC-0001 -> ABC::1 */
  function simpleAliasKey(managedId) {
    const id = normalize(managedId);
    const match = id.match(/^(.+)-(\d+)$/);
    if (!match) return "";
    return match[1].toUpperCase() + "::" + String(Number(match[2]));
  }

  function buildFormalIdMap() {
    const map = new Map();
    if (typeof managedMasterItems === "undefined" || !Array.isArray(managedMasterItems)) {
      return map;
    }

    managedMasterItems.forEach(function(item) {
      const formalId = managedIdOf(item);
      const key = simpleAliasKey(formalId);
      if (!formalId || !key) return;

      if (!map.has(key)) {
        map.set(key, formalId);
      } else if (map.get(key) !== formalId) {
        /* 曖昧一致は統合禁止 */
        map.set(key, null);
      }
    });

    return map;
  }

  function getSimpleAliasRecordByFormalId(formalId) {
    const targetKey = simpleAliasKey(formalId);
    if (!targetKey) return null;
    if (typeof simpleItems === "undefined" || !Array.isArray(simpleItems)) return null;

    const matches = simpleItems.filter(function(item) {
      return simpleAliasKey(managedIdOf(item)) === targetKey;
    });

    /* 同一キーで簡易個体側が複数行なら安全のため採用しない */
    if (matches.length !== 1) return null;

    return {
      item:matches[0],
      simpleManagedId:managedIdOf(matches[0]),
      formalManagedId:normalize(formalId),
      state:stateOf(matches[0]),
      location:locationOf(matches[0])
    };
  }

  function applyAliasesToPicker() {
    const root = document.getElementById(ROOT_ID);
    const grid = document.getElementById("irregularMasterIdGrid");
    if (!root || !grid) return;

    const formalMap = buildFormalIdMap();
    if (!formalMap.size) return;

    const buttons = Array.from(grid.querySelectorAll(".irregularMasterChoice[data-managed-id]"));
    if (!buttons.length) return;

    const byId = new Map();
    buttons.forEach(function(button) {
      byId.set(normalize(button.dataset.managedId), button);
    });

    if (typeof simpleItems === "undefined" || !Array.isArray(simpleItems)) return;

    simpleItems.forEach(function(simpleItem) {
      const simpleId = managedIdOf(simpleItem);
      const key = simpleAliasKey(simpleId);
      const formalId = key ? formalMap.get(key) : "";

      if (!formalId || formalId === simpleId) return;

      const simpleButton = byId.get(simpleId);
      const formalButton = byId.get(formalId);
      if (!simpleButton || !formalButton) return;

      /* 正式番号側へ簡易個体機状況の現在拠点／状態を表示 */
      const details = [locationOf(simpleItem), stateOf(simpleItem)].filter(Boolean).join(" ／ ");
      if (details) {
        let small = formalButton.querySelector("small");
        if (!small) {
          small = document.createElement("small");
          formalButton.appendChild(small);
        }
        small.textContent = details;
      }

      /* 4桁表示側の重複候補を消す。正式番号ボタンのclick処理はそのまま使用 */
      simpleButton.remove();
      byId.delete(simpleId);
    });
  }

  function observePicker() {
    const grid = document.getElementById("irregularMasterIdGrid");
    if (!grid || grid.dataset.simpleAliasObserved === "1") return;

    grid.dataset.simpleAliasObserved = "1";
    const observer = new MutationObserver(function() {
      queueMicrotask(applyAliasesToPicker);
    });
    observer.observe(grid, {childList:true, subtree:true});
    applyAliasesToPicker();
  }

  function init() {
    observePicker();
  }

  /* guard側から正式番号→簡易個体状態を参照できるよう公開 */
  window.getIrregularSimpleAliasRecord = getSimpleAliasRecordByFormalId;
  window.getIrregularSimpleAliasKey = simpleAliasKey;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once:true});
  } else {
    init();
  }
})();
