/*
 * 開発版 v80：Gemini伝票解析を高速化条件で単一テストするモジュール。
 *
 * - 全体画像を1回だけ送る。
 * - 長辺1024px / JPEG 0.75。
 * - 開発版から analysisModel:"gemini-3.5-flash-lite" を指定する。
 * - 解析結果が空・エラーでも2回目のGemini呼び出しは行わない。
 * - fetchWithRetry() は使わない。
 * - 本番版のモデル指定には影響しない。
 * - gemini-timing-dev.js と併用し、成功時のAPI所要時間を画面表示する。
 */
(function() {
  "use strict";

  if (window.__geminiWholeImageDevInstalled) return;
  window.__geminiWholeImageDevInstalled = true;

  async function analyzeWholeImageOnce(file, photoType) {
    startAnimatedDots("wizardPhotoPreview", "伝票情報を確認しています");

    try {
      const profile = {
        label:"3.5 Flash-Lite 全体1回",
        cropRatio:1,
        maxSide:1024,
        quality:0.75
      };

      const photoBase64 =
        await makeWizardSlipAnalysisImage(
          file,
          profile
        );

      const response = await fetch(GAS_URL, {
        method:"POST",
        headers:{"Content-Type":"text/plain"},
        body:JSON.stringify({
          action:"analyzeSlipPhoto",
          photoBase64:photoBase64,
          photoType:photoType,
          requestedFields:["customerName", "siteName"],
          analysisRegion:profile.label,
          analysisModel:"gemini-3.5-flash-lite"
        })
      });

      const text = await response.text();
      let result;

      try {
        result = JSON.parse(text);
      } catch (parseError) {
        throw new Error(
          "伝票解析結果を読み取れませんでした\n" +
          text.slice(0, 200)
        );
      }

      if (!response.ok || !result || result.ok !== true) {
        throw new Error(
          result && result.message
            ? result.message
            : "伝票情報を取得できませんでした"
        );
      }

      const customerName =
        sanitizeWizardPhotoTitlePart(
          result.customerName
        );

      const siteName =
        sanitizeWizardPhotoTitlePart(
          result.siteName
        );

      if (!customerName && !siteName) {
        throw new Error(
          "顧客名・現場名を判定できませんでした"
        );
      }

      wizardCurrentSlipInfo = {
        customerName:customerName,
        siteName:siteName,
        originalSiteName:siteName,
        acquisitionMethod:
          result.acquisitionMethod || "ai_ocr",
        siteNameEdited:false,
        confirmedTitle:
          buildWizardPhotoTitle(
            customerName,
            siteName
          ),
        acquiredAt:new Date().toISOString(),
        analysisRegion:profile.label,
        analysisModel:
          result.analysisModel || "gemini-3.5-flash-lite",
        geminiFetchMs:Number(
          result.geminiFetchMs || 0
        )
      };

      return wizardCurrentSlipInfo;

    } catch (error) {
      console.warn(
        "伝票情報取得失敗（3.5 Flash-Lite単一テスト）",
        error
      );

      alert(
        "伝票情報の解析に失敗しました\n\n" +
        (error.message || String(error)) +
        "\n\n写真保存はこのまま続行できます。"
      );

      wizardCurrentSlipInfo = null;
      return null;

    } finally {
      stopAnimatedDots("wizardPhotoPreview");
    }
  }

  window.analyzeWizardSlipPhoto =
    analyzeWholeImageOnce;

  console.info(
    "開発版：Gemini 3.5 Flash-Lite 1024px 単一テスト v80 読込完了"
  );
})();
