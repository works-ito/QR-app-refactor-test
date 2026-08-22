/*
 * 受付セッション正常終了 v104
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
 * v89-v103:
 * - 直前送信取消情報を app.js の lastSuccessfulSend に統一。
 * - 取消直後のsnapshot復元を古い再取得で上書きしないよう入口取消時の即時refreshを抑止。
 * - resetWizard wrapper、二重close、不要window公開、二重clear、再インストール保険等を撤去。
 * - 正常終了処理を resumeWizardContinuousScan wrapper 内へ集約。
 * - receptionLastSendCancelButton を一時的に入口専用経路として追加したが、
 *   app.js 本体の wizardPostSendCancelButton と二重表示になることを実機確認。
 *
 * v104:
 * - 入口専用の receptionLastSendCancelButton 管理を撤去。
 * - readLastSend / cancelFromReception / 入口専用描画 / 独自1分タイマー / クリック処理を削除。
 * - 直前送信取消のUIは app.js 本体が管理する wizardPostSendCancelButton を正規経路とする。
 * - 正常終了時の送信結果表示クリアだけは従来どおり維持する。
 *
 * GASは変更しない。
 */
(function() {
  "use strict";

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

      clearStaleWizardSendStatus();

      try {
        window.scrollTo({top:0, behavior:"smooth"});
      } catch (error) {}
    };
  }

  function install() {
    installContinuousScanPatch();
    console.info("開発版：1受付1セッション v104 読込完了");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {once:true});
  } else {
    install();
  }
})();
