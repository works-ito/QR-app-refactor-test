/*
 * Network control - refactor integration test
 *
 * Responsibilities:
 * - bound getAppInitialData requests so Safari/GAS stalls cannot keep the app in loading forever
 * - enforce the timeout through response body consumption, not only AbortController
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

  function makeTimeoutError() {
    const error = new Error(
      "在庫データ取得が20秒でタイムアウトしました"
    );
    error.name = "InventoryFetchTimeoutError";
    return error;
  }

  function normalizeFetchError(error) {
    if (error && error.name === "AbortError") {
      return makeTimeoutError();
    }
    return error;
  }

  function raceWithTimeout(promise, controller, onFinally) {
    let timeoutId = null;

    const timeoutPromise = new Promise(function(resolve, reject) {
      timeoutId = setTimeout(function() {
        try {
          controller.abort();
        } catch (error) {
          console.warn("refactor: AbortController abort failed", error);
        }
        reject(makeTimeoutError());
      }, INITIAL_DATA_TIMEOUT_MS);
    });

    return Promise.race([promise, timeoutPromise])
      .finally(function() {
        if (timeoutId) clearTimeout(timeoutId);
        if (typeof onFinally === "function") onFinally();
      });
  }

  window.fetch = function(input, init) {
    if (!isInitialDataRequest(input, init)) {
      return nativeFetch(input, init);
    }

    const controller = new AbortController();
    const nextInit = Object.assign({}, init, {
      signal: controller.signal
    });

    console.info(
      "refactor: getAppInitialData request start",
      INITIAL_DATA_TIMEOUT_MS + "ms deterministic timeout"
    );

    return raceWithTimeout(
      nativeFetch(input, nextInit),
      controller
    )
      .then(function(response) {
        const nativeText = response.text.bind(response);

        response.text = function() {
          return raceWithTimeout(
            nativeText(),
            controller
          );
        };

        return response;
      })
      .catch(function(error) {
        throw normalizeFetchError(error);
      });
  };

  console.info("refactor: network-control v3 読込完了");
})();
