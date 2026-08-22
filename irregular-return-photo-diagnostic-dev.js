/* イレギュラー返却：写真遷移診断 v1 */
(function() {
  "use strict";

  const log = [];

  function snapshot(stage, extra) {
    const photoArea = document.getElementById("wizardPhotoArea");
    const memoArea = document.getElementById("wizardReturnMemoArea");
    const postSendArea = document.getElementById("wizardPostSendArea");
    const row = {
      t: new Date().toLocaleTimeString("ja-JP", { hour12:false }),
      stage: stage,
      receptionType: wizardState && wizardState.receptionType,
      mode: wizardState && wizardState.mode,
      memoConfirmed: typeof wizardReturnMemoConfirmed !== "undefined" ? wizardReturnMemoConfirmed : null,
      scannedCount: Array.isArray(scannedEntries) ? scannedEntries.length : null,
      photoHidden: photoArea ? photoArea.hidden : null,
      memoHidden: memoArea ? memoArea.hidden : null,
      postSendHidden: postSendArea ? postSendArea.hidden : null,
      sendId: lastSuccessfulSend && lastSuccessfulSend.sendId ? lastSuccessfulSend.sendId : "",
      extra: extra || null
    };
    log.push(row);
    window.__irregularReturnPhotoDiagnostic = log;
    console.info("[IR-RETURN-DIAG]", row);
  }

  function isTarget() {
    return wizardState &&
      wizardState.receptionType === "irregular" &&
      wizardState.mode === "返却";
  }

  const originalSend = window.sendWizardBatch;
  if (typeof originalSend === "function") {
    window.sendWizardBatch = async function() {
      if (!isTarget()) {
        return originalSend.apply(this, arguments);
      }

      snapshot("A sendWizardBatch ENTER");
      try {
        const result = await originalSend.apply(this, arguments);
        snapshot("B sendWizardBatch EXIT", { result: result });
        setTimeout(function() { snapshot("C +100ms"); }, 100);
        setTimeout(function() { snapshot("D +1000ms"); }, 1000);
        return result;
      } catch (error) {
        snapshot("X sendWizardBatch THROW", {
          message: error && error.message ? error.message : String(error)
        });
        throw error;
      }
    };
  }

  const originalBegin = window.beginWizardPostSendFlow;
  if (typeof originalBegin === "function") {
    window.beginWizardPostSendFlow = async function(context) {
      if (isTarget()) {
        snapshot("E beginWizardPostSendFlow ENTER", {
          contextMode: context && context.mode,
          recordsLength: context && Array.isArray(context.records) ? context.records.length : null,
          entriesLength: context && Array.isArray(context.entries) ? context.entries.length : null,
          sendId: context && context.sendId
        });
      }
      const result = await originalBegin.apply(this, arguments);
      if (isTarget()) snapshot("F beginWizardPostSendFlow EXIT");
      return result;
    };
  }

  const originalOpen = window.openWizardPhotoArea;
  if (typeof originalOpen === "function") {
    window.openWizardPhotoArea = function(context) {
      if (isTarget()) {
        snapshot("G openWizardPhotoArea ENTER", {
          contextMode: context && context.mode,
          recordsLength: context && Array.isArray(context.records) ? context.records.length : null
        });
      }
      const result = originalOpen.apply(this, arguments);
      if (isTarget()) snapshot("H openWizardPhotoArea EXIT");
      return result;
    };
  }

  window.showIrregularReturnPhotoDiagnostic = function() {
    const text = log.length
      ? log.map(function(row) {
          return row.t + "  " + row.stage +
            " | mode=" + row.mode +
            " | scanned=" + row.scannedCount +
            " | photoHidden=" + row.photoHidden +
            " | sendId=" + (row.sendId || "-") +
            (row.extra ? " | " + JSON.stringify(row.extra) : "");
        }).join("\n")
      : "診断ログはまだありません";
    alert(text);
    return text;
  };

  console.info("開発版：イレギュラー返却 写真遷移診断 v1 読込完了");
})();
