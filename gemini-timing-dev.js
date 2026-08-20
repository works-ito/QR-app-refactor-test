/*
 * 開発版 v77：Gemini伝票解析のAPI所要時間を画面表示する診断用モジュール。
 *
 * - GASの analyzeSlipPhoto 応答に含まれる geminiFetchMs を表示する。
 * - 本番版は変更しない。
 * - 解析ロジック・画像処理・リトライ条件は変更しない。
 * - 2段階解析になった場合は各API呼び出し時間と合計を表示する。
 */
(function() {
  "use strict";

  if (window.__geminiTimingDevInstalled) return;
  window.__geminiTimingDevInstalled = true;

  const originalFetch = window.fetch.bind(window);
  let timings = [];
  let lastResponseAt = 0;

  function normalize(value) {
    return String(value == null ? "" : value).trim();
  }

  function ensureTimingBox() {
    let box = document.getElementById("geminiTimingDevBox");
    if (box) return box;

    const titleArea = document.getElementById("wizardPhotoTitleArea");
    if (!titleArea) return null;

    box = document.createElement("div");
    box.id = "geminiTimingDevBox";
    box.setAttribute("aria-live", "polite");
    box.style.margin = "8px 0 12px";
    box.style.padding = "8px 10px";
    box.style.border = "1px solid #bfdbfe";
    box.style.borderRadius = "10px";
    box.style.background = "#eff6ff";
    box.style.color = "#1e40af";
    box.style.fontSize = "12px";
    box.style.fontWeight = "700";
    box.style.lineHeight = "1.5";
    box.hidden = true;

    const candidate = document.getElementById("wizardPhotoTitleCandidate");
    if (candidate && candidate.parentElement === titleArea) {
      candidate.insertAdjacentElement("afterend", box);
    } else {
      titleArea.prepend(box);
    }

    return box;
  }

  function renderTiming() {
    const box = ensureTimingBox();
    if (!box || !timings.length) return;

    const totalMs = timings.reduce(function(sum, item) {
      return sum + item.ms;
    }, 0);

    const detail = timings.map(function(item) {
      const label = item.region || "解析";
      return label + " " + (item.ms / 1000).toFixed(1) + "秒";
    }).join(" / ");

    box.textContent = timings.length > 1
      ? "Gemini API：" + detail + "（合計 " + (totalMs / 1000).toFixed(1) + "秒）"
      : "Gemini API：" + detail;
    box.hidden = false;
  }

  function parseAnalyzeSlipRequest(options) {
    try {
      if (!options || typeof options.body !== "string") return null;
      const data = JSON.parse(options.body);
      if (!data || data.action !== "analyzeSlipPhoto") return null;
      return data;
    } catch (error) {
      return null;
    }
  }

  window.fetch = async function(input, options) {
    const requestData = parseAnalyzeSlipRequest(options);
    const response = await originalFetch(input, options);

    if (!requestData) return response;

    try {
      const result = await response.clone().json();
      const ms = Number(result && result.geminiFetchMs || 0);

      if (result && result.ok === true && Number.isFinite(ms) && ms > 0) {
        const now = Date.now();

        /* 前回解析完了から10秒以上空いたら別伝票として計測をリセット。 */
        if (lastResponseAt && now - lastResponseAt > 10000) {
          timings = [];
        }

        timings.push({
          ms: ms,
          region: normalize(requestData.analysisRegion) || "解析"
        });
        lastResponseAt = now;

        console.info(
          "Gemini API timing:",
          normalize(requestData.analysisRegion) || "解析",
          ms + "ms"
        );

        renderTiming();
      }
    } catch (error) {
      console.warn("Gemini API時間表示の取得に失敗しました", error);
    }

    return response;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureTimingBox, {once:true});
  } else {
    ensureTimingBox();
  }

  console.info("開発版：Gemini API時間表示 v77 読込完了");
})();
