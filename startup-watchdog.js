/*
 * Startup watchdog - refactor test
 *
 * Keeps the app usable when initial refresh stalls anywhere in the chain:
 * fetch -> response body -> parse -> map build -> IndexedDB save.
 */
(function() {
  "use strict";

  const WATCHDOG_MS = 25000;
  const STATUS_ID = "inventoryDataStatus";

  function setFallbackStatus() {
    const status = document.getElementById(STATUS_ID);
    if (!status) return;

    const hasCachedData =
      typeof window.appInitialDataLoaded !== "undefined" &&
      window.appInitialDataLoaded === true;

    status.textContent = hasCachedData
      ? "在庫データ：更新タイムアウト・前回データを使用"
      : "在庫データ：初期取得タイムアウト";
    status.className = "inventoryDataStatus isError";
  }

  function releaseStartupIfStalled() {
    const loading =
      typeof window.appInitialDataLoading !== "undefined" &&
      window.appInitialDataLoading === true;

    if (!loading) return;

    console.warn(
      "refactor: startup watchdog released stalled initial refresh",
      WATCHDOG_MS + "ms"
    );

    /*
     * app.js の finally が戻らない場合でも、前回キャッシュが復元済みなら
     * 受付を続行できるよう loading lock だけ解除する。
     */
    try {
      window.appInitialDataLoading = false;
    } catch (error) {
      console.warn("refactor: loading lock release failed", error);
    }

    setFallbackStatus();

    /* app.js が公開している場合だけ、安全に後続開始を促す。 */
    try {
      if (typeof window.startScannerAfterInventoryReady === "function") {
        window.startScannerAfterInventoryReady();
      }
    } catch (error) {
      console.warn("refactor: scanner resume after watchdog failed", error);
    }

    window.dispatchEvent(new CustomEvent("refactor:startup-timeout", {
      detail:{ timeoutMs:WATCHDOG_MS }
    }));
  }

  window.addEventListener("load", function() {
    setTimeout(releaseStartupIfStalled, WATCHDOG_MS);
  }, {once:true});

  console.info("refactor: startup-watchdog v1 読込完了");
})();
