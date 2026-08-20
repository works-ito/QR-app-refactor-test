/*
 * Network/startup control - refactor test
 *
 * Responsibilities:
 * - bound getAppInitialData network/body waits
 * - release the initial loading lock if any later stage stalls
 * - leave write operations untouched
 */
(function() {
  "use strict";

  const INITIAL_DATA_TIMEOUT_MS = 20000;
  const STARTUP_WATCHDOG_MS = 25000;
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

  function makeTimeoutError(message) {
    const error = new Error(message || "在庫データ取得がタイムアウトしました");
    error.name = "InventoryFetchTimeoutError";
    return error;
  }

  function normalizeFetchError(error) {
    if (error && error.name === "AbortError") {
      return makeTimeoutError("在庫データ取得が20秒でタイムアウトしました");
    }
    return error;
  }

  function raceWithTimeout(promise, controller, timeoutMs, message) {
    let timeoutId = null;
    const timeoutPromise = new Promise(function(resolve, reject) {
      timeoutId = setTimeout(function() {
        try { controller.abort(); } catch (error) {}
        reject(makeTimeoutError(message));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise])
      .finally(function() {
        if (timeoutId) clearTimeout(timeoutId);
      });
  }

  window.fetch = function(input, init) {
    if (!isInitialDataRequest(input, init)) {
      return nativeFetch(input, init);
    }

    const controller = new AbortController();
    const nextInit = Object.assign({}, init, { signal:controller.signal });

    console.info("refactor: getAppInitialData request start");

    return raceWithTimeout(
      nativeFetch(input, nextInit),
      controller,
      INITIAL_DATA_TIMEOUT_MS,
      "在庫データ通信が20秒でタイムアウトしました"
    )
      .then(function(response) {
        const nativeText = response.text.bind(response);
        response.text = function() {
          return raceWithTimeout(
            nativeText(),
            controller,
            INITIAL_DATA_TIMEOUT_MS,
            "在庫データ本文取得が20秒でタイムアウトしました"
          );
        };
        return response;
      })
      .catch(function(error) {
        throw normalizeFetchError(error);
      });
  };

  function releaseStartupIfStalled() {
    const loading =
      typeof window.appInitialDataLoading !== "undefined" &&
      window.appInitialDataLoading === true;

    if (!loading) return;

    const status = document.getElementById("inventoryDataStatus");
    const hasCachedData =
      typeof window.appInitialDataLoaded !== "undefined" &&
      window.appInitialDataLoaded === true;

    console.warn(
      "refactor: startup watchdog released stalled initial refresh",
      STARTUP_WATCHDOG_MS + "ms"
    );

    try {
      window.appInitialDataLoading = false;
    } catch (error) {}

    if (status) {
      status.textContent = hasCachedData
        ? "在庫データ：更新タイムアウト・前回データを使用"
        : "在庫データ：初期取得タイムアウト";
      status.className = "inventoryDataStatus isError";
    }

    try {
      if (typeof window.startScannerAfterInventoryReady === "function") {
        window.startScannerAfterInventoryReady();
      }
    } catch (error) {
      console.warn("refactor: scanner resume after watchdog failed", error);
    }

    window.dispatchEvent(new CustomEvent("refactor:startup-timeout", {
      detail:{timeoutMs:STARTUP_WATCHDOG_MS}
    }));
  }

  window.addEventListener("load", function() {
    setTimeout(releaseStartupIfStalled, STARTUP_WATCHDOG_MS);
  }, {once:true});

  console.info("refactor: network-control v4 読込完了");
})();
