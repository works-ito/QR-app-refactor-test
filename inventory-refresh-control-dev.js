/*
 * 在庫データ自動更新制御 v89
 *
 * 目的：
 * - 表示中は15分ごとに在庫データを再同期する。
 * - 5分以上30分未満バックグラウンドだった場合、復帰時に再同期する。
 * - 30分以上は既存 app.js の完全リロード処理へ任せる。
 * - 受付途中は更新せず pendingInventoryRefresh として保留する。
 * - 正常な受付セッション終了後に保留更新を消化する。
 * - 直近2分以内に更新済みなら近接した二重取得を抑止する。
 * - pendingAutoReload（ページ全体の再読込待ち）とは完全に分離する。
 *
 * GASは変更しない。
 */
(function() {
  "use strict";

  const RESUME_REFRESH_MS = 5 * 60 * 1000;
  const RECENT_REFRESH_SUPPRESS_MS = 2 * 60 * 1000;
  const PENDING_CHECK_MS = 2000;

  let refreshHiddenAt = null;
  let pendingInventoryRefresh = false;
  let lastInventoryRefreshAt = 0;
  let pendingCheckTimer = null;

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

  function wasRecentlyRefreshed() {
    return (
      lastInventoryRefreshAt > 0 &&
      Date.now() - lastInventoryRefreshAt < RECENT_REFRESH_SUPPRESS_MS
    );
  }

  function markRefreshSuccess() {
    lastInventoryRefreshAt = Date.now();
    pendingInventoryRefresh = false;
  }

  function installLoadAppInitialDataTracking() {
    if (typeof loadAppInitialData !== "function") return false;
    if (loadAppInitialData.__refreshTimeTrackingPatched) return true;

    const original = loadAppInitialData;

    const patched = async function() {
      const result = await original.apply(this, arguments);
      if (result === true) {
        markRefreshSuccess();
      }
      return result;
    };

    patched.__refreshTimeTrackingPatched = true;
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

    return await requestInventoryRefresh("15分定期更新");
  }

  function installControlledTimer() {
    if (typeof DATA_REFRESH_MINUTES === "undefined") return false;

    if (typeof inventoryRefreshTimer !== "undefined" && inventoryRefreshTimer) {
      clearInterval(inventoryRefreshTimer);
    }

    inventoryRefreshTimer = setInterval(
      function() {
        void runControlledScheduledRefresh();
      },
      DATA_REFRESH_MINUTES * 60 * 1000
    );

    return true;
  }

  function handleVisibleReturn() {
    if (!refreshHiddenAt) return;

    const awayMs = Date.now() - refreshHiddenAt;
    refreshHiddenAt = null;

    /* 30分以上は既存app.jsの完全リロード処理を優先する */
    if (
      typeof AUTO_RELOAD_MINUTES !== "undefined" &&
      awayMs >= AUTO_RELOAD_MINUTES * 60 * 1000
    ) {
      return;
    }

    if (awayMs < RESUME_REFRESH_MS) {
      return;
    }

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

  function install() {
    if (!installLoadAppInitialDataTracking()) {
      setTimeout(installLoadAppInitialDataTracking, 500);
    }

    if (
      typeof appInitialDataLoaded !== "undefined" &&
      appInitialDataLoaded === true
    ) {
      lastInventoryRefreshAt = Date.now();
    }

    installControlledTimer();
    installVisibilityControl();
    startPendingChecker();

    window.runPendingInventoryRefreshAfterSession =
      runPendingInventoryRefreshAfterSession;
    window.requestInventoryRefreshDev = requestInventoryRefresh;

    console.info("開発版：在庫データ自動更新制御 v89 読込完了");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {once:true});
  } else {
    install();
  }
})();
