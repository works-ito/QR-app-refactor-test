/*
 * イレギュラー受付：マスタ選択 → 共通送信ブリッジ補強 v88
 *
 * 目的：
 * - マスタ選択キューを通常QRと同じ scannedEntries / sendWizardBatch() へ渡す。
 * - 返却時、追記確認へ遷移した時点では送信完了扱いにしない。
 * - マスタ選択後に旧「番号入力」画面へ戻らず、返却追記へそのまま進める。
 * - 出庫などの実送信では、送信受理直後にイレギュラー受付カードを先に閉じない。
 *   共通の beginWizardPostSendFlow() が次画面を開く直前に既存処理で閉じる。
 * - イレギュラー返却では、返却追記・共通送信ボタン・送信状態を1セットで
 *   post-send 領域へ一時移動し、通常返却と同じ正規送信経路を使う。
 * - イレギュラー返却の実送信成功後、既存フローで写真画面が開かなかった場合だけ、
 *   同じ送信内容から post-send context を再構築して beginWizardPostSendFlow() を実行する。
 *   GASへの再送信は行わない。
 * - 同一レコードが既に staged 済みなら、同内容に限って再利用する。
 * - 数量・出庫取消は sourceQuantityLogId まで含めて同一性を判定する。
 * - 数量管理品の拠点移動は sourceLocation を共通送信レコードへ保持する。
 *
 * GASは変更しない。
 */
(function() {
  "use strict";

  let pendingIrregularReturnEntries = null;
  const originalSendWizardBatch = window.sendWizardBatch;

  function normalize(value) {
    return String(value == null ? "" : value).trim();
  }

  function sameStagedRecord(existing, candidate) {
    if (!existing || !candidate) return false;
    if (existing.key !== candidate.key) return false;
    if (existing.recordType !== candidate.recordType) return false;

    if (candidate.recordType === "quantity") {
      return (
        Number(existing.quantity) === Number(candidate.quantity) &&
        normalize(existing.itemCode) === normalize(candidate.itemCode) &&
        normalize(existing.sourceQuantityLogId) ===
          normalize(candidate.sourceQuantityLogId) &&
        normalize(existing.sourceLocation) ===
          normalize(candidate.sourceLocation)
      );
    }

    return (
      normalize(existing.qrText) === normalize(candidate.qrText) &&
      normalize(existing.managementType) === normalize(candidate.managementType)
    );
  }

  function restoreReturnMemoHost() {
    const memoArea =
      document.getElementById("wizardReturnMemoArea");
    const sendButton =
      document.getElementById("wizardSendBatchButton");
    const sendStatus =
      document.getElementById("wizardSendStatus");
    const cameraArea =
      document.getElementById("cameraPreview");

    if (!cameraArea) return;

    if (memoArea && memoArea.parentElement !== cameraArea) {
      cameraArea.appendChild(memoArea);
    }

    if (sendButton && sendButton.parentElement !== cameraArea) {
      cameraArea.appendChild(sendButton);
    }

    if (sendStatus && sendStatus.parentElement !== cameraArea) {
      cameraArea.appendChild(sendStatus);
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
    const sendStatus =
      document.getElementById("wizardSendStatus");
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

    [memoArea, sendButton, sendStatus].forEach(function(node) {
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

    if (!memoArea || memoArea.dataset.masterBridgeObserved === "true") {
      return;
    }

    memoArea.dataset.masterBridgeObserved = "true";

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

  async function ensureIrregularReturnPhotoFlow(
    sourceEntries,
    previousSendId,
    returnMemo,
    returnCaseId
  ) {
    if (
      wizardState.receptionType !== "irregular" ||
      wizardState.mode !== "返却"
    ) {
      return;
    }

    const photoArea = document.getElementById("wizardPhotoArea");

    /* 既存フローが正常に写真画面を開いていれば何もしない。 */
    if (photoArea && photoArea.hidden === false) return;

    if (!lastSuccessfulSend) return;

    const currentSendId = normalize(lastSuccessfulSend.sendId);

    if (
      !currentSendId ||
      currentSendId === normalize(previousSendId) ||
      Number(lastSuccessfulSend.successCount || 0) < 1
    ) {
      return;
    }

    const entries = Array.isArray(sourceEntries)
      ? sourceEntries.filter(Boolean)
      : [];

    if (!entries.length) return;

    const sendRecords = entries.map(function(entry) {
      return buildBatchRecordData(entry);
    });

    const context = {
      mode:"返却",
      modeLabel:"返却",
      sendId:currentSendId,
      sentAt:lastSuccessfulSend.sentAt || new Date().toISOString(),
      returnCaseId:normalize(returnCaseId),
      batchMemo:normalize(returnMemo),
      entries:entries,
      records:sendRecords,
      logIds:Array.isArray(lastSuccessfulSend.logIds)
        ? lastSuccessfulSend.logIds.slice()
        : []
    };

    console.info(
      "開発版：イレギュラーマスタ返却の写真画面を補完します",
      currentSendId
    );

    await beginWizardPostSendFlow(context);
  }

  if (typeof originalSendWizardBatch === "function") {
    window.sendWizardBatch = async function(options) {
      const shouldEnsureReturnPhoto =
        wizardState.receptionType === "irregular" &&
        wizardState.mode === "返却" &&
        wizardReturnMemoConfirmed &&
        Array.isArray(pendingIrregularReturnEntries) &&
        pendingIrregularReturnEntries.length > 0;

      const sourceEntries = shouldEnsureReturnPhoto
        ? pendingIrregularReturnEntries.slice()
        : [];
      const previousSendId = lastSuccessfulSend
        ? normalize(lastSuccessfulSend.sendId)
        : "";
      const returnMemo = shouldEnsureReturnPhoto
        ? wizardReturnMemo
        : "";
      const returnCaseId = shouldEnsureReturnPhoto
        ? wizardReturnCaseId
        : "";

      const accepted = await originalSendWizardBatch.apply(
        this,
        arguments
      );

      if (shouldEnsureReturnPhoto && accepted) {
        await ensureIrregularReturnPhotoFlow(
          sourceEntries,
          previousSendId,
          returnMemo,
          returnCaseId
        );

        const photoArea = document.getElementById("wizardPhotoArea");
        if (photoArea && photoArea.hidden === false) {
          pendingIrregularReturnEntries = null;
        }
      }

      return accepted;
    };
  }

  installReturnMemoRestoreObserver();

  window.sendIrregularMasterPickerBatch = async function(records) {
    if (!Array.isArray(records) || !records.length) {
      alert("送信する品目がありません");
      return false;
    }

    const imported = [];

    for (const selected of records) {
      if (selected && selected.preview) {
        alert("UI確認用データは送信できません");
        return false;
      }

      const lookupCode =
        selected.type === "machine"
          ? selected.managedId
          : selected.code;

      const details = getScannerItemDetails(lookupCode);

      if (!details) {
        alert(
          (lookupCode || "対象品目") +
          "を最新の初期データから確認できません。\n" +
          "画面を再読み込みして、もう一度選択してください。"
        );
        return false;
      }

      if (!isScannerModeAllowed(details.managementType, wizardState.mode)) {
        alert(
          details.displayName +
          "は「" + wizardState.modeLabel +
          "」では送信できません"
        );
        return false;
      }

      const record = buildWizardScanRecord(details);

      if (record.recordType === "quantity") {
        const quantity = Number(selected.quantity);

        if (!Number.isInteger(quantity) || quantity < 1) {
          alert("数量は1以上の整数で入力してください");
          return false;
        }

        record.quantity = quantity;
        record.sourceQuantityLogId =
          normalize(selected.sourceQuantityLogId);
        record.sourceLocation =
          normalize(selected.sourceLocation);

        if (
          wizardState.mode === "出庫取消" &&
          !record.sourceQuantityLogId
        ) {
          alert("取消対象の出庫履歴を選択してください");
          return false;
        }

        if (
          wizardState.mode === "拠点移動" &&
          !record.sourceLocation
        ) {
          alert("移動元拠点を選択してください");
          return false;
        }

        if (record.sourceQuantityLogId) {
          record.key += "__" + record.sourceQuantityLogId;
        }

        if (record.sourceLocation) {
          record.key += "__FROM_" + record.sourceLocation;
        }
      }

      const staged = scannedEntries.find(function(item) {
        return item && item.key === record.key;
      });

      if (staged) {
        if (!sameStagedRecord(staged, record)) {
          alert(
            record.displayName +
            "は同じ作業で別内容がすでに追加されています。\n" +
            "読取済み一覧を確認してください。"
          );
          return false;
        }
        continue;
      }

      if (
        imported.some(function(item) {
          return item.key === record.key;
        })
      ) {
        alert(record.displayName + "はすでに追加済みです");
        return false;
      }

      imported.push(record);
    }

    if (imported.length) {
      scannedEntries.push.apply(scannedEntries, imported);
      renderScannerResults();
    }

    const isReturnMemoStage =
      wizardState.mode === "返却" &&
      !wizardReturnMemoConfirmed;

    if (isReturnMemoStage) {
      pendingIrregularReturnEntries = scannedEntries.slice();
      prepareReturnMemoHost();
      await sendWizardBatch();
      return false;
    }

    if (wizardState.mode !== "返却") {
      pendingIrregularReturnEntries = null;
    }

    /*
     * v81で入れた onAccepted 即時非表示は使わない。
     * 送信中は現在のカードを維持し、
     * beginWizardPostSendFlow() が次画面を開く直前に
     * 既存 hideWizardPostSendCards() で切り替える。
     */
    return await sendWizardBatch();
  };

  console.info(
    "開発版：イレギュラーマスタ送信ブリッジ v88 読込完了"
  );
})();
