/* 販売品入庫受付中の既存ウィザードナビゲーション競合を防ぐ。 */
(function() {
  function isSalesPanelActive() {
    const panel = document.getElementById("salesStockInPanel");
    return Boolean(panel && panel.classList.contains("isActive"));
  }

  const backButton = document.getElementById("headerBackButton");
  if (backButton) {
    backButton.addEventListener("click", function(event) {
      if (!isSalesPanelActive()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof window.salesStockInGoBack === "function") {
        window.salesStockInGoBack();
      }
    }, true);
  }

  const restartButton = document.getElementById("restartButton");
  if (restartButton) {
    restartButton.addEventListener("click", function(event) {
      if (!isSalesPanelActive()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof window.salesStockInRestart === "function") {
        window.salesStockInRestart();
      } else {
        window.location.reload();
      }
    }, true);
  }
})();
