/*
 * 受付セッション正常終了 v88
 *
 * 目的：
 * - 1受付 = 1セッションとし、正常完了後にQRカメラへ自動復帰しない。
 * - 正常完了後は受付入口へ戻す。
 * - 前回拠点・担当者、在庫キャッシュ、直前送信取消情報は保持する。
 * - 一部失敗で読取済みレコードが残る場合は従来どおり読取画面へ戻す。
 * - 送信取消後の「同じQRを再読取」は従来挙動を維持する。
 * - イレギュラーマスタ選択パネルが正常完了後に残らないよう明示的に閉じる。
 * - 新しい受付セッション開始時に、前回の送信結果表示だけが残らないようにする。
 *
 * GASは変更しない。
 */
(function() {
  "use strict";

  const LAST_SEND_KEY = "qrInventoryWizardLastSuccessfulSendV1";
  const ENTRANCE_CANCEL_ID = "receptionLastSendCancelButton";
  let entranceCancelTimer = null;

  function readLastSend() {
    try {
      const value = JSON.parse(localStorage.getItem(LAST_SEND_KEY) || "null");
      if (!value) return null;
      if (Number(value.expiresAt || 0) <= Date.now()) return null;
      return value;
    } catch (error) {
      return null;
    }
  }

  function ensureEntranceCancelButton() {
    const reception = document.getElementById("receptionStep");
    if (!reception) return null;

    let button = document.getElementById(ENTRANCE_CANCEL_ID);
    if (button) return button;

    button = document.createElement("button");
    button.id = ENTRANCE_CANCEL_ID;
    button.type = "button";
    button.className = "wizardCancelSendButton";
    button.hidden = true;
    button.style.width = "100%";
    button.style.marginTop = "14px";

    button.addEventListener("click", async function() {
      if (typeof cancelLastSuccessfulSend !== "function") return;
      await cancelLastSuccessfulSend();
      renderEntranceCancelButton();
    });

    reception.appendChild(button);
    return button;
  }

  function renderEntranceCancelButton() {
    const button = ensureEntranceCancelButton();
    if (!button) return;

    const transaction = readLastSend();
    const onReception =
      typeof wizardState !== "undefined" &&
      wizardState.currentStep === "reception";

    if (!transaction || !onReception) {
      button.hidden = true;
      return;
    }

    const remainingMs = Math.max(0, Number(transaction.expiresAt || 0) - Date.now());
    const remainingSec = Math.ceil(remainingMs / 1000);
    const min = Math.floor(remainingSec / 60);
    const sec = remainingSec % 60;

    button.textContent =
      "直前送信を取消（残り " + min + ":" + String(sec).padStart(2, "0") + "）";
    button.hidden = false;
  }

  function closeIrregularMasterPicker() {
    const pickerPanel = document.getElementById("irregularMasterPickerPanel");
    if (pickerPanel) pickerPanel.hidden = true;

    const pickerRoot = document.getElementById("irregularMasterPickerDev");
    if (pickerRoot) {
      pickerRoot.querySelectorAll(".irregularMasterStep").forEach(function(step) {
        step.hidden = true;
      });
    }
  }

  function clearStaleWizardSendStatus() {
    const status = document.getElementById("wizardSendStatus");
    if (!status) return;

    if (
      typeof wizardSendResultUnknown !== "undefined" &&
      wizardSendResultUnknown === true
    ) {
      return;
    }

    if (typeof stopAnimatedDots === "function") {
      stopAnimatedDots("wizardSendStatus");
    }

    status.innerText = "";
    status.className = "wizardSendStatus";
  }

  function patchResetWizardStatusCleanup() {
    if (typeof window.resetWizard !== "function") return false;
    if (window.resetWizard.__sendStatusCleanupPatched) return true;

    const original = window.resetWizard;
    const patched = function() {
      const result = original.apply(this, arguments);
      clearStaleWizardSendStatus();
      return result;
    };

    patched.__sendStatusCleanupPatched = true;
    patched.__original = original;
    window.resetWizard = patched;
    return true;
  }

  async function finishWizardSession() {
    /*
     * 正常終了時だけ使用する。
     * lastSuccessfulSend / localStorage / 在庫キャッシュは触らない。
     */
    if (typeof stopReadOnlyScanner === "function") {
      await stopReadOnlyScanner();
    }

    closeIrregularMasterPicker();

    if (typeof resetWizard === "function") {
      resetWizard();
    }

    clearStaleWizardSendStatus();

    /* reset後に独立モジュール側が残るケースへも念押し */
    closeIrregularMasterPicker();
    renderEntranceCancelButton();

    try {
      window.scrollTo({top:0, behavior:"smooth"});
    } catch (error) {}
  }

  function installContinuousScanPatch() {
    if (typeof resumeWizardContinuousScan !== "function") return false;
    if (resumeWizardContinuousScan.__oneSessionPatched) return true;

    const original = resumeWizardContinuousScan;

    const patched = async function(message) {
      const text = String(message || "");

      /*
       * 直前送信取消後は従来どおり、その場で同じQRを再読取できるようにする。
       */
      if (text.includes("取消完了")) {
        return await original.apply(this, arguments);
      }

      /*
       * 一部送信失敗時は失敗レコードが scannedEntries に残る。
       * ここで入口へ戻すと失敗分を消してしまうため、従来の連続読取へ戻す。
       */
      if (
        typeof scannedEntries !== "undefined" &&
        Array.isArray(scannedEntries) &&
        scannedEntries.length > 0
      ) {
        return await original.apply(this, arguments);
      }

      return await finishWizardSession();
    };

    patched.__oneSessionPatched = true;
    patched.__original = original;
    resumeWizardContinuousScan = patched;
    window.resumeWizardContinuousScan = patched;
    window.finishWizardSession = finishWizardSession;
    return true;
  }

  function install() {
    ensureEntranceCancelButton();

    if (!installContinuousScanPatch()) {
      setTimeout(installContinuousScanPatch, 500);
    }

    if (!patchResetWizardStatusCleanup()) {
      setTimeout(patchResetWizardStatusCleanup, 500);
    }

    /* app.js の初期 resetWizard() はこのモジュール読込前に実行済みなので、初回だけ明示掃除 */
    clearStaleWizardSendStatus();
    renderEntranceCancelButton();

    if (entranceCancelTimer) clearInterval(entranceCancelTimer);
    entranceCancelTimer = setInterval(renderEntranceCancelButton, 1000);

    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "visible") {
        renderEntranceCancelButton();
      }
    });

    console.info("開発版：1受付1セッション v88 読込完了");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {once:true});
  } else {
    install();
  }
})();
