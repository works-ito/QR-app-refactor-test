/*
 * Runtime control - refactor integration test v3
 *
 * Responsibilities:
 * - one reception = one session
 * - full camera stop at session end
 * - return to reception entrance after success
 * - keep latest-send cancel action visible at reception entrance
 * - clear stale send status
 *
 * Inventory refresh responsibilities live in inventory.js.
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
    if (window.resetWizard.__runtimeControlStatusCleanupPatched) return true;

    const original = window.resetWizard;
    const patched = function() {
      const result = original.apply(this, arguments);
      clearStaleWizardSendStatus();
      return result;
    };

    patched.__runtimeControlStatusCleanupPatched = true;
    patched.__original = original;
    window.resetWizard = patched;
    return true;
  }

  async function finishWizardSession() {
    if (typeof stopReadOnlyScanner === "function") {
      await stopReadOnlyScanner();
    }

    closeIrregularMasterPicker();

    if (typeof resetWizard === "function") {
      resetWizard();
    }

    clearStaleWizardSendStatus();
    closeIrregularMasterPicker();
    renderEntranceCancelButton();

    if (
      window.InventoryControl &&
      typeof window.InventoryControl.runPendingAfterSession === "function"
    ) {
      window.InventoryControl.runPendingAfterSession();
    }

    try {
      window.scrollTo({top:0, behavior:"smooth"});
    } catch (error) {}
  }

  function installContinuousScanPatch() {
    if (typeof resumeWizardContinuousScan !== "function") return false;
    if (resumeWizardContinuousScan.__runtimeControlOneSessionPatched) return true;

    const original = resumeWizardContinuousScan;

    const patched = async function(message) {
      const text = String(message || "");

      if (text.includes("取消完了")) {
        return await original.apply(this, arguments);
      }

      if (
        typeof scannedEntries !== "undefined" &&
        Array.isArray(scannedEntries) &&
        scannedEntries.length > 0
      ) {
        return await original.apply(this, arguments);
      }

      return await finishWizardSession();
    };

    patched.__runtimeControlOneSessionPatched = true;
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

    clearStaleWizardSendStatus();
    renderEntranceCancelButton();

    if (entranceCancelTimer) clearInterval(entranceCancelTimer);
    entranceCancelTimer = setInterval(renderEntranceCancelButton, 1000);

    console.info("refactor: runtime-control v3 読込完了");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {once:true});
  } else {
    install();
  }
})();
