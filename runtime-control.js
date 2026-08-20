/*
 * Runtime control - refactor integration test v2
 *
 * Consolidates:
 * - wizard-session-finish-dev.js
 * - inventory-refresh-control-dev.js
 * - manual-refresh-ui-dev.js
 *
 * Scope: front-end only. No GAS changes.
 */
(function() {
  "use strict";

  const LAST_SEND_KEY = "qrInventoryWizardLastSuccessfulSendV1";
  const ENTRANCE_CANCEL_ID = "receptionLastSendCancelButton";
  const STATUS_ID = "inventoryDataStatus";
  const ROW_ID = "inventoryRefreshRowDev";
  const BUTTON_ID = "manualAppRefreshButtonDev";
  const RESUME_REFRESH_MS = 5 * 60 * 1000;
  const RECENT_REFRESH_SUPPRESS_MS = 2 * 60 * 1000;
  const PENDING_CHECK_MS = 2000;
  const INITIAL_STATUS_CHECK_MS = 500;
  const INITIAL_STATUS_CHECK_LIMIT = 60;

  let entranceCancelTimer = null;
  let refreshHiddenAt = null;
  let pendingInventoryRefresh = false;
  let lastInventoryRefreshAt = 0;
  let pendingCheckTimer = null;
  let initialStatusCheckTimer = null;
  let initialStatusCheckCount = 0;

  function readLastSend() {
    try {
      const value = JSON.parse(localStorage.getItem(LAST_SEND_KEY) || "null");
      if (!value) return null;
      if (Number(value.expiresAt || 0) <= Date.now()) return null;
      return value;
    } catch (error) {
      return null;
    }
  }

  function ensureEntranceCancelButton() {
    const reception = document.getElementById("receptionStep");
    if (!reception) return null;

    let button = document.getElementById(ENTRANCE_CANCEL_ID);
    if (button) return button;

    button = document.createElement("button");
    button.id = ENTRANCE_CANCEL_ID;
    button.type = "button";
    button.className = "wizardCancelSendButton";
    button.hidden = true;
    button.style.width = "100%";
    button.style.marginTop = "14px";

    button.addEventListener("click", async function() {
      if (typeof cancelLastSuccessfulSend !== "function") return;
      await cancelLastSuccessfulSend();
      renderEntranceCancelButton();
    });

    reception.appendChild(button);
    return button;
  }

  function renderEntranceCancelButton() {
    const button = ensureEntranceCancelButton();
    if (!button) return;

    const transaction = readLastSend();
    const onReception =
      typeof wizardState !== "undefined" &&
      wizardState.currentStep === "reception";

    if (!transaction || !onReception) {
      button.hidden = true;
      return;
    }

    const remainingMs = Math.max(0, Number(transaction.expiresAt || 0) - Date.now());
    const remainingSec = Math.ceil(remainingMs / 1000);
    const min = Math.floor(remainingSec / 60);
    const sec = remainingSec % 60;

    button.textContent =
      "直前送信を取消（残り " + min + ":" + String(sec).padStart(2, "0") + "）";
    button.hidden = false;
  }

  function closeIrregularMasterPicker() {
    const pickerPanel = document.getElementById("irregularMasterPickerPanel");
    if (pickerPanel) pickerPanel.hidden = true;

    const pickerRoot = document.getElementById("irregularMasterPickerDev");
    if (pickerRoot) {
      pickerRoot.querySelectorAll(".irregularMasterStep").forEach(function(step) {
        step.hidden = true;
      });
    }
  }

  function clearStaleWizardSendStatus() {
    const status = document.getElementById("wizardSendStatus");
    if (!status) return;

    if (
      typeof wizardSendResultUnknown !== "undefined" &&
      wizardSendResultUnknown === true
    ) {
      return;
    }

    if (typeof stopAnimatedDots === "function") {
      stopAnimatedDots("wizardSendStatus");
    }

    status.innerText = "";
    status.className = "wizardSendStatus";
  }

  function patchResetWizardStatusCleanup() {
    if (typeof window.resetWizard !== "function") return false;
    if (window.resetWizard.__runtimeControlStatusCleanupPatched) return true;

    const original = window.resetWizard;
    const patched = function() {
      const result = original.apply(this, arguments);
      clearStaleWizardSendStatus();
      return result;
    };

    patched.__runtimeControlStatusCleanupPatched = true;
    patched.__original = original;
    window.resetWizard = patched;
    return true;
  }

  async function finishWizardSession() {
    if (typeof stopReadOnlyScanner === "function") {
      await stopReadOnlyScanner();
    }

    closeIrregularMasterPicker();

    if (typeof resetWizard === "function") {
      resetWizard();
    }

    clearStaleWizardSendStatus();
    closeIrregularMasterPicker();
    renderEntranceCancelButton();
    runPendingInventoryRefreshAfterSession();

    try {
      window.scrollTo({top:0, behavior:"smooth"});
    } catch (error) {}
  }

  function installContinuousScanPatch() {
    if (typeof resumeWizardContinuousScan !== "function") return false;
    if (resumeWizardContinuousScan.__runtimeControlOneSessionPatched) return true;

    const original = resumeWizardContinuousScan;

    const patched = async function(message) {
      const text = String(message || "");

      if (text.includes("取消完了")) {
        return await original.apply(this, arguments);
      }

      if (
        typeof scannedEntries !== "undefined" &&
        Array.isArray(scannedEntries) &&
        scannedEntries.length > 0
      ) {
        return await original.apply(this, arguments);
      }

      return await finishWizardSession();
    };

    patched.__runtimeControlOneSessionPatched = true;
    patched.__original = original;
    resumeWizardContinuousScan = patched;
    window.resumeWizardContinuousScan = patched;
    window.finishWizardSession = finishWizardSession;
    return true;
  }

  function isVisible() {
    return document.visibilityState === "visible";
  }

  function isIrregularMasterPickerOpen() {
    const panel = document.getElementById("irregularMasterPickerPanel");
    return Boolean(panel && panel.hidden === false);
  }

  function isReceptionIdle() {
    if (
      typeof wizardState !== "undefined" &&
      wizardState &&
      wizardState.currentStep !== "reception"
    ) {
      return false;
    }

    if (
      typeof pendingWizardQuantityRecord !== "undefined" &&
      pendingWizardQuantityRecord
    ) {
      return false;
    }

    if (isIrregularMasterPickerOpen()) {
      return false;
    }

    if (typeof canRefreshInventoryAutomatically === "function") {
      return canRefreshInventoryAutomatically();
    }

    return false;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatAbsoluteMinute(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";

    return (
      date.getFullYear() + "/" +
      pad2(date.getMonth() + 1) + "/" +
      pad2(date.getDate()) + " " +
      pad2(date.getHours()) + ":" +
      pad2(date.getMinutes())
    );
  }

  function renderRefreshTimestamp(value) {
    const status = document.getElementById(STATUS_ID);
    if (!status) return;

    const formatted = formatAbsoluteMinute(value || Date.now());
    if (!formatted) return;

    status.textContent = "在庫データ：" + formatted;
    status.className = "inventoryDataStatus isReady";
  }

  function wasRecentlyRefreshed() {
    return (
      lastInventoryRefreshAt > 0 &&
      Date.now() - lastInventoryRefreshAt < RECENT_REFRESH_SUPPRESS_MS
    );
  }

  function markRefreshSuccess() {
    lastInventoryRefreshAt = Date.now();
    pendingInventoryRefresh = false;
    renderRefreshTimestamp(lastInventoryRefreshAt);
  }

  function installLoadAppInitialDataTracking() {
    if (typeof loadAppInitialData !== "function") return false;
    if (loadAppInitialData.__runtimeControlRefreshTrackingPatched) return true;

    const original = loadAppInitialData;
    const patched = async function() {
      const result = await original.apply(this, arguments);
      if (result === true) markRefreshSuccess();
      return result;
    };

    patched.__runtimeControlRefreshTrackingPatched = true;
    patched.__original = original;
    loadAppInitialData = patched;
    window.loadAppInitialData = patched;
    return true;
  }

  async function requestInventoryRefresh(reason) {
    if (!isVisible()) {
      pendingInventoryRefresh = true;
      return false;
    }

    if (wasRecentlyRefreshed()) {
      pendingInventoryRefresh = false;
      console.log("在庫データ自動更新を省略：直近2分以内に更新済み", reason || "");
      return true;
    }

    if (!isReceptionIdle()) {
      pendingInventoryRefresh = true;
      console.log("在庫データ自動更新を保留：受付処理中", reason || "");
      return false;
    }

    if (typeof loadAppInitialData !== "function") {
      pendingInventoryRefresh = true;
      console.warn("在庫データ更新関数を確認できません");
      return false;
    }

    console.log("在庫データ自動更新開始", reason || "");
    const success = await loadAppInitialData(false);

    if (success) {
      markRefreshSuccess();
      console.log("在庫データ自動更新完了", reason || "", new Date().toLocaleString());
      return true;
    }

    pendingInventoryRefresh = true;
    console.warn("在庫データ自動更新失敗", reason || "");
    return false;
  }

  async function runControlledScheduledRefresh() {
    if (!isVisible()) {
      console.log("在庫データ定期更新を省略：バックグラウンド中");
      return false;
    }
    return await requestInventoryRefresh("定期更新");
  }

  function installControlledTimer() {
    if (typeof DATA_REFRESH_MINUTES === "undefined") return false;

    if (typeof inventoryRefreshTimer !== "undefined" && inventoryRefreshTimer) {
      clearInterval(inventoryRefreshTimer);
    }

    inventoryRefreshTimer = setInterval(function() {
      void runControlledScheduledRefresh();
    }, DATA_REFRESH_MINUTES * 60 * 1000);

    return true;
  }

  function handleVisibleReturn() {
    if (!refreshHiddenAt) return;

    const awayMs = Date.now() - refreshHiddenAt;
    refreshHiddenAt = null;

    if (
      typeof AUTO_RELOAD_MINUTES !== "undefined" &&
      awayMs >= AUTO_RELOAD_MINUTES * 60 * 1000
    ) {
      return;
    }

    if (awayMs < RESUME_REFRESH_MS) return;
    void requestInventoryRefresh("5分復帰更新");
  }

  function installVisibilityControl() {
    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "hidden") {
        refreshHiddenAt = Date.now();
        return;
      }

      if (document.visibilityState === "visible") {
        handleVisibleReturn();
        renderEntranceCancelButton();
      }
    });

    window.addEventListener("pageshow", function() {
      if (document.visibilityState === "visible") {
        handleVisibleReturn();
      }
    });
  }

  function runPendingInventoryRefreshAfterSession() {
    if (!pendingInventoryRefresh) return;
    setTimeout(function() {
      void requestInventoryRefresh("受付終了後の保留更新");
    }, 0);
  }

  function startPendingChecker() {
    if (pendingCheckTimer) clearInterval(pendingCheckTimer);

    pendingCheckTimer = setInterval(function() {
      if (!pendingInventoryRefresh) return;
      if (!isVisible()) return;
      if (!isReceptionIdle()) return;
      void requestInventoryRefresh("保留更新の再確認");
    }, PENDING_CHECK_MS);
  }

  function runFullRefresh(button, status) {
    if (button.disabled) return;

    button.disabled = true;
    button.textContent = "更新中…";
    if (status) status.textContent = "在庫データ：更新中…";

    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("appRefresh", String(Date.now()));
    window.location.replace(url.toString());
  }

  function installManualRefreshUi() {
    const status = document.getElementById(STATUS_ID);
    if (!status) {
      setTimeout(installManualRefreshUi, 300);
      return;
    }

    if (document.getElementById(ROW_ID)) return;

    const row = document.createElement("div");
    row.id = ROW_ID;
    row.className = "inventoryRefreshRowDev";
    status.parentNode.insertBefore(row, status);
    row.appendChild(status);

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.className = "manualAppRefreshButtonDev";
    button.type = "button";
    button.textContent = "更新";
    button.addEventListener("click", function() {
      runFullRefresh(button, status);
    });
    row.appendChild(button);

    const style = document.createElement("style");
    style.textContent =
      ".inventoryRefreshRowDev{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;}" +
      ".inventoryRefreshRowDev #inventoryDataStatus{min-width:0;flex:1;margin:0;}" +
      ".manualAppRefreshButtonDev{flex:0 0 auto;min-width:62px;min-height:34px;padding:6px 11px;border:1px solid #d9e0ea;border-radius:9px;background:#fff;color:#475467;font-size:13px;font-weight:800;}" +
      ".manualAppRefreshButtonDev:active{transform:translateY(1px);background:#f4f6f8;}" +
      ".manualAppRefreshButtonDev:disabled{opacity:.65;}";
    document.head.appendChild(style);
  }

  function startInitialStatusCheck() {
    if (initialStatusCheckTimer) clearInterval(initialStatusCheckTimer);
    initialStatusCheckCount = 0;

    initialStatusCheckTimer = setInterval(function() {
      initialStatusCheckCount += 1;

      if (
        typeof appInitialDataLoaded !== "undefined" &&
        appInitialDataLoaded === true &&
        (
          typeof appInitialDataLoading === "undefined" ||
          appInitialDataLoading === false
        )
      ) {
        markRefreshSuccess();
        clearInterval(initialStatusCheckTimer);
        initialStatusCheckTimer = null;
        return;
      }

      if (initialStatusCheckCount >= INITIAL_STATUS_CHECK_LIMIT) {
        clearInterval(initialStatusCheckTimer);
        initialStatusCheckTimer = null;
      }
    }, INITIAL_STATUS_CHECK_MS);
  }

  function install() {
    ensureEntranceCancelButton();
    installManualRefreshUi();

    if (!installContinuousScanPatch()) {
      setTimeout(installContinuousScanPatch, 500);
    }

    if (!patchResetWizardStatusCleanup()) {
      setTimeout(patchResetWizardStatusCleanup, 500);
    }

    if (!installLoadAppInitialDataTracking()) {
      setTimeout(installLoadAppInitialDataTracking, 500);
    }

    if (
      typeof appInitialDataLoaded !== "undefined" &&
      appInitialDataLoaded === true &&
      (
        typeof appInitialDataLoading === "undefined" ||
        appInitialDataLoading === false
      )
    ) {
      markRefreshSuccess();
    } else {
      startInitialStatusCheck();
    }

    clearStaleWizardSendStatus();
    renderEntranceCancelButton();

    if (entranceCancelTimer) clearInterval(entranceCancelTimer);
    entranceCancelTimer = setInterval(renderEntranceCancelButton, 1000);

    installControlledTimer();
    installVisibilityControl();
    startPendingChecker();

    window.runPendingInventoryRefreshAfterSession = runPendingInventoryRefreshAfterSession;
    window.requestInventoryRefreshDev = requestInventoryRefresh;

    console.info("refactor: runtime-control v2 読込完了");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {once:true});
  } else {
    install();
  }
})();
