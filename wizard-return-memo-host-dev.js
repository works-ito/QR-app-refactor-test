/*
 * 返却追記UIホスト管理 v2
 *
 * 責務：
 * - イレギュラー返却時、返却追記UIと送信ボタンを post-send 領域へ移す。
 * - 返却追記終了後、元の cameraPreview 領域へ戻す。
 *
 * wizardSendStatus は共通UIとして固定配置し、このホスト管理では移動しない。
 * 送信データ・GAS通信・写真フローには触れない。
 */
(function() {
  "use strict";

  function restoreReturnMemoHost() {
    const memoArea =
      document.getElementById("wizardReturnMemoArea");
    const sendButton =
      document.getElementById("wizardSendBatchButton");
    const cameraArea =
      document.getElementById("cameraPreview");

    if (!cameraArea) return;

    if (memoArea && memoArea.parentElement !== cameraArea) {
      cameraArea.appendChild(memoArea);
    }

    if (sendButton && sendButton.parentElement !== cameraArea) {
      cameraArea.appendChild(sendButton);
    }
  }

  function prepareReturnMemoHost() {
    const irregularArea =
      document.getElementById("wizardIrregularArea");
    const postSendArea =
      document.getElementById("wizardPostSendArea");
    const memoArea =
      document.getElementById("wizardReturnMemoArea");
    const sendButton =
      document.getElementById("wizardSendBatchButton");
    const cameraArea =
      document.getElementById("cameraPreview");

    if (irregularArea) {
      irregularArea.hidden = true;
    }

    if (cameraArea) {
      cameraArea.classList.remove("isActive");
    }

    if (postSendArea) {
      postSendArea.hidden = false;
    }

    if (!postSendArea) return;

    const postSendCancel =
      document.getElementById("wizardPostSendCancelButton");

    [memoArea, sendButton].forEach(function(node) {
      if (!node || node.parentElement === postSendArea) return;

      if (
        postSendCancel &&
        postSendCancel.parentElement === postSendArea
      ) {
        postSendArea.insertBefore(node, postSendCancel);
      } else {
        postSendArea.appendChild(node);
      }
    });
  }

  function installReturnMemoRestoreObserver() {
    const memoArea =
      document.getElementById("wizardReturnMemoArea");

    if (!memoArea || memoArea.dataset.returnMemoHostObserved === "true") {
      return;
    }

    memoArea.dataset.returnMemoHostObserved = "true";

    const observer = new MutationObserver(function() {
      if (memoArea.hidden) {
        restoreReturnMemoHost();
      }
    });

    observer.observe(memoArea, {
      attributes:true,
      attributeFilter:["hidden"]
    });
  }

  window.wizardReturnMemoHost = {
    prepare: prepareReturnMemoHost,
    restore: restoreReturnMemoHost
  };

  installReturnMemoRestoreObserver();

  console.info("開発版：返却追記UIホスト管理 v2 読込完了");
})();
