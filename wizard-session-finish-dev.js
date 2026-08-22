/*
 * 受付セッション正常終了 v103
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
 * v89-v101:
 * - 直前送信取消情報を app.js の lastSuccessfulSend に統一。
 * - 取消直後のsnapshot復元を古い再取得で上書きしないよう入口取消時の即時refreshを抑止。
 * - resetWizard wrapper、二重close、不要window公開、二重clear、再インストール保険等を撤去。
 * - 正常終了処理を resumeWizardContinuousScan wrapper 内へ集約。
 * - 取消表示は利用者を焦らせない分単位表示、1分間隔更新。
 *
 * v102:
 * - 初期画面復帰直後の入口取消表示遅延に対し、setTimeout再描画を暫定追加。
 *
 * v103:
 * - receptionLastSendCancelButton を index.html の正式DOMへ移動。
 * - document.createElement / appendChild / JS内style指定を撤去。
 * - 入口取消ボタンの表示制御を、既存取消ボタンと同じ isVisible class に統一。
 * - v102の setTimeout再描画を撤去。正常終了時の1回描画だけに戻す。
 * - 独自1分更新は現時点では維持し、本体 renderCancelSendButton 統合後に撤去する。
 *
 * GASは変更しない。
 */
(function() {
  "use strict";

  const ENTRANCE_CANCEL_ID = "receptionLastSendCancelButton";

  function readLastSend() {
    if (
      typeof lastSuccessfulSend === "undefined" ||
      !lastSuccessfulSend
    ) {
      return null;
    }

    if (Number(lastSuccessfulSend.expiresAt || 0) <= Date.now()) {
      return null;
    }

    return lastSuccessfulSend;
  }

  async function cancelFromReception() {
    if (typeof cancelLastSuccessfulSend !== "function") return;

    const canTemporarilySuppressRefresh =
      typeof refreshInventoryInBackground === "function";
    const originalRefresh = canTemporarilySuppressRefresh
      ? refreshInventoryInBackground
      : null;

    if (canTemporarilySuppressRefresh) {
      refreshInventoryInBackground = async function() {
        console.info("受付入口取消：snapshot復元直後の在庫再取得を抑止しました");
        return true;
      };
    }

    try {
      await cancelLastSuccessfulSend();
    } finally {
      if (originalRefresh) refreshInventoryInBackground = originalRefresh;
    }
  }

  function getEntranceCancelButton() {
    return document.getElementById(ENTRANCE_CANCEL_ID);
  }

  function renderEntranceCancelButton() {
    const button = getEntranceCancelButton();
    if (!button) return;

    const onReception =
      typeof wizardState !== "undefined" &&
      wizardState.currentStep === "reception";

    if (onReception) clearStaleWizardSendStatus();

    const transaction = readLastSend();
    const isVisible = Boolean(transaction && onReception);

    button.classList.toggle("isVisible", isVisible);
    button.disabled =
      typeof wizardSendBusy !== "undefined" && wizardSendBusy === true;

    if (!isVisible) return;

    const remainingMs = Math.max(
      0,
      Number(transaction.expiresAt || 0) - Date.now()
    );
    const remainingMinutes = Math.ceil(remainingMs / 60000);

    button.textContent =
      remainingMs < 60000
        ? "直前送信を取消（有効時間：1分未満）"
        : "直前送信を取消（残り約" + remainingMinutes + "分）";
  }

  function clearStaleWizardSendStatus() {
    const status = document.getElementById("wizardSendStatus");
    if (!status) return;

    if (
      typeof wizardSendResultUnknown !== "undefined" &&
      wizardSendResultUnknown === true
    ) return;

    if (typeof stopAnimatedDots === "function") {
      stopAnimatedDots("wizardSendStatus");
    }

    status.innerText = "";
    status.className = "wizardSendStatus";
  }

  function installContinuousScanPatch() {
    const original = resumeWizardContinuousScan;

    resumeWizardContinuousScan = async function(message) {
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

      if (typeof stopReadOnlyScanner === "function") {
        await stopReadOnlyScanner();
      }

      if (typeof resetWizard === "function") {
        resetWizard();
      }

      const pickerPanel = document.getElementById("irregularMasterPickerPanel");
      if (pickerPanel) pickerPanel.hidden = true;

      const pickerRoot = document.getElementById("irregularMasterPickerDev");
      if (pickerRoot) {
        pickerRoot.querySelectorAll(".irregularMasterStep").forEach(function(step) {
          step.hidden = true;
        });
      }

      renderEntranceCancelButton();

      try {
        window.scrollTo({top:0, behavior:"smooth"});
      } catch (error) {}
    };
  }

  function install() {
    const button = getEntranceCancelButton();
    if (button) {
      button.addEventListener("click", async function() {
        await cancelFromReception();
        renderEntranceCancelButton();
      });
    }

    installContinuousScanPatch();
    renderEntranceCancelButton();
    setInterval(renderEntranceCancelButton, 60000);

    console.info("開発版：1受付1セッション v103 読込完了");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {once:true});
  } else {
    install();
  }
})();
