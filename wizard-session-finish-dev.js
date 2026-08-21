/*
 * 受付セッション正常終了 v96
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
 * v89:
 * - 直前送信取消情報は app.js の lastSuccessfulSend を唯一の参照元にする。
 * - このモジュール独自の localStorage 読取とキー重複を廃止する。
 *
 * v91:
 * - 受付入口からの直前送信取消では、snapshot復元直後の
 *   refreshInventoryInBackground() を1回抑止する。
 * - 実機確認で、取消直後に再取得すると取消反映前の「出庫中」が再流入し、
 *   snapshotで戻した状態を上書きすることを確認したため。
 * - 検品取消の再取得経路は変更しない。
 * - 2026-08-21 実機確認: GET24-4003
 *   出庫→送信→取消→通常受付→同一QR再出庫が正常。
 *
 * v92:
 * - resetWizard() の後付けwrapperを撤去。
 * - 送信結果表示の掃除は、正常終了時の明示処理と受付入口描画時に集約。
 * - 「最初から」で受付入口へ戻った場合も、既存の入口描画タイマー内で掃除する。
 * - 新しいObserver・capture・補修ファイルは追加しない。
 *
 * v93:
 * - finishWizardSession() 内で二重だった closeIrregularMasterPicker() を1回へ整理。
 * - resetWizard() はピッカーDOMを再生成しないため、reset後の明示closeだけを残す。
 *
 * v94:
 * - finishWizardSession の不要な window 公開を撤去。
 * - resumeWizardContinuousScan は既存グローバルbindingへの代入だけに統一し、
 *   同じ関数を window へ二重代入する経路を撤去。
 *
 * v95:
 * - finishWizardSession() の送信結果クリア重複を撤去。
 * - resetWizard() 後の renderEntranceCancelButton() が受付入口で同じclearを行うため、
 *   明示 clearStaleWizardSendStatus() 呼出しを削除して1経路に統一。
 *
 * v96:
 * - sales-stockin.js のロード順で app.js 読込完了後に本モジュールが1回だけ実行されるため、
 *   resumeWizardContinuousScan wrapper の再インストール判定・500ms再試行を撤去。
 * - __oneSessionPatched / __original の補助プロパティも撤去し、単一インストール経路へ整理。
 *
 * GASは変更しない。
 */
(function() {
  "use strict";

  const ENTRANCE_CANCEL_ID = "receptionLastSendCancelButton";
  let entranceCancelTimer = null;

  function readLastSend() {
    if (
      typeof lastSuccessfulSend === "undefined" ||
      !lastSuccessfulSend
    ) {
      return null;
    }

    if (
      Number(lastSuccessfulSend.expiresAt || 0) <= Date.now()
    ) {
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
        console.info(
          "受付入口取消：snapshot復元直後の在庫再取得を抑止しました"
        );
        return true;
      };
    }

    try {
      await cancelLastSuccessfulSend();
    } finally {
      if (originalRefresh) {
        refreshInventoryInBackground = originalRefresh;
      }
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

    if (onReception) {
      clearStaleWizardSendStatus();
    }

    const transaction = readLastSend();

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

  async function finishWizardSession() {
    if (typeof stopReadOnlyScanner === "function") {
      await stopReadOnlyScanner();
    }

    if (typeof resetWizard === "function") {
      resetWizard();
    }

    closeIrregularMasterPicker();
    renderEntranceCancelButton();

    try {
      window.scrollTo({top:0, behavior:"smooth"});
    } catch (error) {}
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

      return await finishWizardSession();
    };
  }

  function install() {
    ensureEntranceCancelButton();
    installContinuousScanPatch();

    clearStaleWizardSendStatus();
    renderEntranceCancelButton();

    if (entranceCancelTimer) clearInterval(entranceCancelTimer);
    entranceCancelTimer = setInterval(renderEntranceCancelButton, 1000);

    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "visible") {
        renderEntranceCancelButton();
      }
    });

    console.info("開発版：1受付1セッション v96 読込完了");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {once:true});
  } else {
    install();
  }
})();
