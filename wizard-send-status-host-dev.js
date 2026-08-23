/*
 * 共通送信ステータスUIホスト v1
 *
 * 責務：
 * - wizardSendStatus を completeStep 直下の共通位置へ一度だけ移す。
 * - cameraPreview / post-send の表示切替に依存しない置き場に固定する。
 *
 * 送信ロジック・GAS通信・写真フロー・返却追記ロジックには触れない。
 */
(function() {
  "use strict";

  const completeStep = document.getElementById("completeStep");
  const sendStatus = document.getElementById("wizardSendStatus");
  const quantityInspectionArea = document.getElementById("quantityInspectionArea");

  if (!completeStep || !sendStatus) {
    console.warn("共通送信ステータスUIホスト：必要なDOMが見つかりません");
    return;
  }

  if (sendStatus.parentElement !== completeStep) {
    if (
      quantityInspectionArea &&
      quantityInspectionArea.parentElement === completeStep
    ) {
      completeStep.insertBefore(sendStatus, quantityInspectionArea);
    } else {
      completeStep.appendChild(sendStatus);
    }
  }

  console.info("開発版：共通送信ステータスUIホスト v1 読込完了");
})();
