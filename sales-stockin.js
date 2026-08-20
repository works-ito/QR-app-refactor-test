/* Legacy compatibility shim for refactor repository. */
(function() {
  "use strict";

  const REFACTOR_BUILD = "B15";

  const title = document.querySelector(".brandTitle");
  if (title) {
    title.textContent = "QR在庫管理 " + REFACTOR_BUILD;
  }

  const script = document.createElement("script");
  script.src = "./app-bootstrap.js?v=15";
  script.onerror = function() {
    console.error("リファクタ版 app-bootstrap.js の読み込みに失敗しました");
  };
  document.body.appendChild(script);
})();
