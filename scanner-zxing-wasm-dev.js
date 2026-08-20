/* 開発版 v50：zxing-wasm(Data Matrix専用)補助デコーダ */
(function() {
  "use strict";

  const INTERVAL_MS = 260;
  const MAX_SIDE = 1280;
  let timer = null;
  let busy = false;
  let lastText = "";
  let lastAt = 0;

  function getVideo() {
    return document.getElementById("scannerVideo");
  }

  function isScannerActive(video) {
    if (!video || !video.srcObject || video.readyState < 2) return false;
    const viewport = document.getElementById("scannerViewport");
    if (viewport && viewport.hidden) return false;
    return true;
  }

  function createFrame(video) {
    const vw = Number(video.videoWidth || 0);
    const vh = Number(video.videoHeight || 0);
    if (!vw || !vh) return null;

    const scale = Math.min(1, MAX_SIDE / Math.max(vw, vh));
    const width = Math.max(1, Math.round(vw * scale));
    const height = Math.max(1, Math.round(vh * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", {
      alpha:false,
      willReadFrequently:true
    });
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  }

  async function scanOnce() {
    const video = getVideo();
    if (!isScannerActive(video) || busy) return;

    const api = window.ZXingWASM;
    if (!api || typeof api.readBarcodes !== "function") return;

    const imageData = createFrame(video);
    if (!imageData) return;

    busy = true;
    try {
      const results = await api.readBarcodes(imageData, {
        formats:["DataMatrix"],
        tryHarder:true,
        maxNumberOfSymbols:1
      });

      if (!Array.isArray(results) || !results.length) return;
      const result = results[0];
      const text = String(result && result.text || "").trim();
      if (!text) return;

      const now = Date.now();
      if (text === lastText && now - lastAt < 900) return;
      lastText = text;
      lastAt = now;

      console.info("開発版 zxing-wasm Data Matrix読取成功", {
        text:text,
        format:result.format,
        symbology:result.symbology
      });

      if (typeof window.handleReadOnlyDecoded === "function") {
        window.handleReadOnlyDecoded(text);
      } else if (typeof handleReadOnlyDecoded === "function") {
        handleReadOnlyDecoded(text);
      } else {
        console.warn("開発版 zxing-wasm：既存読取ハンドラが見つかりません");
      }
    } catch (error) {
      console.info("開発版 zxing-wasm Data Matrix補助読取", error && error.message ? error.message : error);
    } finally {
      busy = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(function() {
      void scanOnce();
    }, INTERVAL_MS);
    console.info("開発版 v50：zxing-wasm Data Matrix補助デコーダ開始");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, {once:true});
  } else {
    start();
  }
})();
