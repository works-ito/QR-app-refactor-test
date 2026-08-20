/* Startup watchdog - refactor test B14 */
(function() {
  "use strict";

  const WATCHDOG_MS = 25000;
  const STATUS_ID = "inventoryDataStatus";

  function looksLikeLoading(text) {
    const value = String(text || "");
    return (
      value.includes("確認中") ||
      value.includes("取得中") ||
      value.includes("更新中") ||
      value.includes("再取得中")
    );
  }

  function releaseIfStillLoading() {
    const status = document.getElementById(STATUS_ID);
    if (!status) return;

    if (!looksLikeLoading(status.textContent)) return;

    console.warn(
      "refactor: DOM watchdog released stalled startup",
      WATCHDOG_MS + "ms",
      status.textContent
    );

    status.textContent = "在庫データ：更新タイムアウト・前回データを使用";
    status.className = "inventoryDataStatus isError";

    try {
      if (typeof startScannerAfterInventoryReady === "function") {
        startScannerAfterInventoryReady();
      } else if (typeof window.startScannerAfterInventoryReady === "function") {
        window.startScannerAfterInventoryReady();
      }
    } catch (error) {
      console.warn("refactor: watchdog scanner resume failed", error);
    }

    window.dispatchEvent(new CustomEvent("refactor:startup-timeout", {
      detail:{timeoutMs:WATCHDOG_MS}
    }));
  }

  setTimeout(releaseIfStillLoading, WATCHDOG_MS);
  console.info("refactor: startup-watchdog B14 読込完了");
})();
