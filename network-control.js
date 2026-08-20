/*
 * Network control - refactor integration test
 *
 * Responsibilities:
 * - bound getAppInitialData requests so Safari/GAS stalls cannot keep the app in loading forever
 * - leave write operations untouched
 */
(function() {
  "use strict";

  const INITIAL_DATA_TIMEOUT_MS = 20000;
  const nativeFetch = window.fetch.bind(window);

  function isInitialDataRequest(input, init) {
    if (!init || typeof init.body !== "string") return false;

    try {
      const payload = JSON.parse(init.body);
      return payload && payload.action === "getAppInitialData";
    } catch (error) {
      return false;
    }
  }

  window.fetch = function(input, init) {
    if (!isInitialDataRequest(input, init)) {
      return nativeFetch(input, init);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(function() {
      controller.abort();
    }, INITIAL_DATA_TIMEOUT_MS);

    const nextInit = Object.assign({}, init, {
      signal: controller.signal
    });

    console.info(
      "refactor: getAppInitialData request start",
      INITIAL_DATA_TIMEOUT_MS + "ms timeout"
    );

    return nativeFetch(input, nextInit)
      .catch(function(error) {
        if (error && error.name === "AbortError") {
          const timeoutError = new Error(
            "在庫データ取得が20秒でタイムアウトしました"
          );
          timeoutError.name = "InventoryFetchTimeoutError";
          throw timeoutError;
        }
        throw error;
      })
      .finally(function() {
        clearTimeout(timeoutId);
      });
  };

  console.info("refactor: network-control 読込完了");
})();
