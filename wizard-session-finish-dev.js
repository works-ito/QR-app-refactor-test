/*
 * 受付セッション正常終了 v102
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
 * - 正常終了時、resetWizard() 直後は wizardState.currentStep の反映タイミングにより
 *   入口取消ボタンがまだ非表示になる場合があるため、入口描画を次イベントループでもう1回実行。
 * - 1分タイマーを待たず、初期画面へ戻った直後から直前送信取消を表示する。
 * - 分単位表示・1分間隔更新・取消期限の内部精度は変更しない。
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
      await cancelFromReception();
      renderEntranceCancelButton();
    });

    reception.appendChild(button);
    return button;
  }

  function renderEntranceCancelButton() {
    const button = ensureEntranceCancelButton();
    if (!button) return;

    const onReception =
      typeof wizardState !== "undefined" &&
      wizardState.currentStep === "reception";

    if (onReception) clearStaleWizardSendStatus();

    const transaction = readLastSend();
    if (!transaction || !onReception) {
      button.hidden = true;
      return;
    }

    const remainingMs = Math.max(
      0,
      Number(transaction.expiresAt || 0) - Date.now()
    );
    const remainingMinutes = Math.ceil(remainingMs / 60000);

    button.textContent =
      remainingMs < 60000
        ? "直前送信を取消（有効時間：1分未満）"
        : "直前送信を取消（残り約" + remainingMinutes + "分）";
    button.hidden = false;
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
      setTimeout(renderEntranceCancelButton, 0);

      try {
        window.scrollTo({top:0, behavior:"smooth"});
      } catch (error) {}
    };
  }

  function install() {
    ensureEntranceCancelButton();
    installContinuousScanPatch();

    renderEntranceCancelButton();
    setInterval(renderEntranceCancelButton, 60000);

    console.info("開発版：1受付1セッション v102 読込完了");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {once:true});
  } else {
    install();
  }
})();
