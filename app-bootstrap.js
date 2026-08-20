/* QR在庫管理 Refactor integration bootstrap v8 */
(function() {
  "use strict";

  function loadScript(src) {
    return new Promise(function(resolve, reject) {
      const script = document.createElement("script");
      script.src = src;
      script.onload = function() {
        resolve(src);
      };
      script.onerror = function() {
        reject(new Error("読み込み失敗：" + src));
      };
      document.body.appendChild(script);
    });
  }

  const failures = [];
  window.refactorBootstrapFailures = failures;

  function loadOne(src) {
    return loadScript(src).catch(function(error) {
      failures.push({
        src:src,
        message:error && error.message
          ? error.message
          : String(error)
      });
      console.error("リファクタ版モジュール読込失敗", src, error);
      return null;
    });
  }

  /*
   * 共通基盤は最優先で読み込む。
   * 機能モジュールが失敗しても、在庫更新と受付セッション制御は残す。
   */
  const foundationModules = [
    "./inventory.js?v=2",
    "./runtime-control.js?v=3"
  ];

  const featureModules = [
    "https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.3/dist/iife/reader/index.js",
    "./scanner-zxing-wasm-dev.js?v=50",

    "./sales-stockin-module.js?v=2",

    "./compact-scanner-dev.js?v=53",

    "./irregular-master-picker-dev.js?v=64",
    "./irregular-entry-simplify-dev.js?v=72",
    "./irregular-category-ui-tuning-dev.js?v=62",
    "./irregular-simple-id-alias-dev.js?v=42",
    "./irregular-master-layout-dev.js?v=40",
    "./irregular-registration-guard-dev.js?v=43",
    "./irregular-quantity-flow-dev.js?v=55",
    "./irregular-send.js?v=2",

    "./quantity-transfer.js?v=1",

    "./gemini-timing-dev.js?v=77",
    "./gemini-whole-image-dev.js?v=80",

    "./mode-description-hint-dev.js?v=37"
  ];

  function loadSequentially(modules) {
    return modules.reduce(function(chain, src) {
      return chain.then(function() {
        return loadOne(src);
      });
    }, Promise.resolve());
  }

  loadSequentially(foundationModules)
    .then(function() {
      return loadSequentially(featureModules);
    })
    .then(function() {
      if (failures.length) {
        console.warn(
          "リファクタ版は一部モジュールの読込に失敗しました",
          failures
        );
      } else {
        console.info("refactor: bootstrap v8 読込完了");
      }
    });
})();
