/*
 * Inventory runtime control - refactor integration test
 *
 * Responsibilities:
 * - inventory refresh scheduling
 * - visibility return refresh
 * - manual full refresh UI
 * - inventory refresh timestamp display
 * - pending refresh after one reception session finishes
 *
 * Front-end only. No GAS changes.
 */
(function() {
  "use strict";

  const STATUS_ID = "inventoryDataStatus";
  const ROW_ID = "inventoryRefreshRow";
  const BUTTON_ID = "manualAppRefreshButton";
  const RESUME_REFRESH_MS = 5 * 60 * 1000;
  const RECENT_REFRESH_SUPPRESS_MS = 2 * 60 * 1000;
  const PENDING_CHECK_MS = 2000;
  const INITIAL_STATUS_CHECK_MS = 500;
  const INITIAL_STATUS_CHECK_LIMIT = 60;

  let refreshHiddenAt = null;
  let pendingInventoryRefresh = false;
  let lastInventoryRefreshAt = 0;
  let pendingCheckTimer = null;
  let initialStatusCheckTimer = null;
  let initialStatusCheckCount = 0;

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

  function installLoadTracking() {
    if (typeof loadAppInitialData !== "function") return false;
    if (loadAppInitialData.__inventoryModuleTracked) return true;

    const original = loadAppInitialData;
    const patched = async function() {
      const result = await original.apply(this, arguments);
      if (result === true) markRefreshSuccess();
      return result;
    };

    patched.__inventoryModuleTracked = true;
    patched.__original = original;
    loadAppInitialData = patched;
    window.loadAppInitialData = patched;
    return true;
  }

  async function requestRefresh(reason) {
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

  function installControlledTimer() {
    if (typeof DATA_REFRESH_MINUTES === "undefined") return false;

    if (typeof inventoryRefreshTimer !== "undefined" && inventoryRefreshTimer) {
      clearInterval(inventoryRefreshTimer);
    }

    inventoryRefreshTimer = setInterval(function() {
      if (!isVisible()) return;
      void requestRefresh("定期更新");
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
    void requestRefresh("5分復帰更新");
  }

  function installVisibilityControl() {
    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "hidden") {
        refreshHiddenAt = Date.now();
        return;
      }

      if (document.visibilityState === "visible") {
        handleVisibleReturn();
      }
    });

    window.addEventListener("pageshow", function() {
      if (document.visibilityState === "visible") {
        handleVisibleReturn();
      }
    });
  }

  function runPendingAfterSession() {
    if (!pendingInventoryRefresh) return;
    setTimeout(function() {
      void requestRefresh("受付終了後の保留更新");
    }, 0);
  }

  function startPendingChecker() {
    if (pendingCheckTimer) clearInterval(pendingCheckTimer);

    pendingCheckTimer = setInterval(function() {
      if (!pendingInventoryRefresh) return;
      if (!isVisible()) return;
      if (!isReceptionIdle()) return;
      void requestRefresh("保留更新の再確認");
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
    row.className = "inventoryRefreshRow";
    status.parentNode.insertBefore(row, status);
    row.appendChild(status);

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.className = "manualAppRefreshButton";
    button.type = "button";
    button.textContent = "更新";
    button.addEventListener("click", function() {
      runFullRefresh(button, status);
    });
    row.appendChild(button);

    const style = document.createElement("style");
    style.textContent =
      ".inventoryRefreshRow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;}" +
      ".inventoryRefreshRow #inventoryDataStatus{min-width:0;flex:1;margin:0;}" +
      ".manualAppRefreshButton{flex:0 0 auto;min-width:62px;min-height:34px;padding:6px 11px;border:1px solid #d9e0ea;border-radius:9px;background:#fff;color:#475467;font-size:13px;font-weight:800;}" +
      ".manualAppRefreshButton:active{transform:translateY(1px);background:#f4f6f8;}" +
      ".manualAppRefreshButton:disabled{opacity:.65;}";
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
    installManualRefreshUi();

    if (!installLoadTracking()) {
      setTimeout(installLoadTracking, 500);
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

    installControlledTimer();
    installVisibilityControl();
    startPendingChecker();

    console.info("refactor: inventory module 読込完了");
  }

  window.InventoryControl = {
    requestRefresh:requestRefresh,
    runPendingAfterSession:runPendingAfterSession,
    markRefreshSuccess:markRefreshSuccess,
    renderRefreshTimestamp:renderRefreshTimestamp
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {once:true});
  } else {
    install();
  }
})();
