/* 販売品入庫受付 v110 bootstrap */
(function() {
  function loadScript(src) {
    return new Promise(function(resolve, reject) {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = function() {
        reject(new Error("読み込み失敗：" + src));
      };
      document.body.appendChild(script);
    });
  }

  loadScript("https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.3/dist/iife/reader/index.js")
    .then(function() { return loadScript("./scanner-zxing-wasm-dev.js?v=50"); })
    .then(function() { return loadScript("./sales-stockin-core.js?v=33"); })
    .then(function() { return loadScript("./sales-stockin-scan-enhancements.js?v=33"); })
    .then(function() { return loadScript("./sales-stockin-guards.js?v=33"); })
    .then(function() { return loadScript("./compact-scanner-dev.js?v=53"); })
    .then(function() { return loadScript("./irregular-master-picker-dev.js?v=64"); })
    .then(function() { return loadScript("./irregular-entry-simplify-dev.js?v=72"); })
    .then(function() { return loadScript("./irregular-category-ui-tuning-dev.js?v=62"); })
    .then(function() { return loadScript("./irregular-simple-id-alias-dev.js?v=42"); })
    .then(function() { return loadScript("./irregular-master-layout-dev.js?v=40"); })
    .then(function() { return loadScript("./irregular-registration-guard-dev.js?v=43"); })
    .then(function() { return loadScript("./irregular-quantity-flow-dev.js?v=55"); })
    .then(function() { return loadScript("./irregular-master-send-bridge-dev.js?v=85"); })
    .then(function() { return loadScript("./irregular-master-shipment-photo-dev.js?v=82"); })
    .then(function() { return loadScript("./quantity-transfer-dev.js?v=96"); })
    .then(function() { return loadScript("./gemini-timing-dev.js?v=77"); })
    .then(function() { return loadScript("./gemini-whole-image-dev.js?v=80"); })
    .then(function() { return loadScript("./mode-description-hint-dev.js?v=37"); })
    .then(function() { return loadScript("./wizard-session-finish-dev.js?v=102"); })
    .then(function() { return loadScript("./inventory-refresh-control-dev.js?v=93"); })
    .then(function() { return loadScript("./manual-refresh-ui-dev.js?v=95"); })
    .catch(function(error) {
      console.error("開発版追加処理の初期化に失敗しました", error);
    });
})();
