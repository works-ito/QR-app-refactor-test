/* Legacy compatibility shim for refactor branch. */
(function() {
  "use strict";
  const script = document.createElement("script");
  script.src = "./app-bootstrap.js?v=1";
  script.onerror = function() {
    console.error("リファクタ版 app-bootstrap.js の読み込みに失敗しました");
  };
  document.body.appendChild(script);
})();
