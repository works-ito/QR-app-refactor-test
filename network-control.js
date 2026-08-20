/*
 * Network control - refactor integration test
 *
 * Responsibilities:
 * - bound getAppInitialData requests so Safari/GAS stalls cannot keep the app in loading forever
 * - keep the timeout active until response.text() finishes
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

  function normalizeTimeoutError(error) {
    if (error && error.name === "AbortError") {
      const timeoutError = new Error(
        "在庫データ取得が20秒でタイムアウトしました"
      );
      timeoutError.name = "InventoryFetchTimeoutError";
      return timeoutError;
    }
    return error;
  }

  window.fetch = function(input, init) {
    if (!isInitialDataRequest(input, init)) {
      return nativeFetch(input, init);
    }

    const controller = new AbortController();
    let finished = false;

    const timeoutId = setTimeout(function() {
      if (finished) return;
      console.warn(
        "refactor: getAppInitialData timeout",
        INITIAL_DATA_TIMEOUT_MS + "ms"
      );
      controller.abort();
    }, INITIAL_DATA_TIMEOUT_MS);

    const nextInit = Object.assign({}, init, {
      signal: controller.signal
    });

    function finishRequest() {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
    }

    console.info(
      "refactor: getAppInitialData request start",
      INITIAL_DATA_TIMEOUT_MS + "ms total timeout"
    );

    return nativeFetch(input, nextInit)
      .then(function(response) {
        /*
         * fetch() はレスポンスヘッダー受信時点で resolve する。
         * GAS/Safari で本文取得 response.text() が停止した場合も
         * 同じ20秒制限で必ず抜けるよう、text() 完了まで timer を保持する。
         */
        const nativeText = response.text.bind(response);

        response.text = function() {
          return nativeText()
            .catch(function(error) {
              throw normalizeTimeoutError(error);
            })
            .finally(function() {
              finishRequest();
            });
        };

        return response;
      })
      .catch(function(error) {
        finishRequest();
        throw normalizeTimeoutError(error);
      });
  };

  console.info("refactor: network-control v2 読込完了");
})();
