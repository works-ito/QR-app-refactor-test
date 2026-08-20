/*
 * QR在庫管理 - イレギュラー受付 共通送信モジュール
 * refactor-integration-test
 *
 * 統合元:
 * - irregular-master-send-bridge-dev.js v85
 * - irregular-master-shipment-photo-dev.js v82
 *
 * 目的:
 * - マスタ選択キューを通常QRと同じ scannedEntries / sendWizardBatch() へ渡す
 * - 数量・出庫取消・拠点移動の付帯情報を保持する
 * - 返却追記の表示ホストを管理する
 * - 出庫成功後の写真遷移補完を同じ送信経路内で行う
 * - 数量拠点移動は QuantityTransfer API を明示的に呼ぶ
 *
 * GASは変更しない。
 */
(function() {
  "use strict";

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
    const memoArea = document.getElementById("wizardReturnMemoArea");
    const cameraArea = document.getElementById("cameraPreview");

    if (
      memoArea &&
      cameraArea &&
      memoArea.parentElement !== cameraArea
    ) {
      const sendButton = document.getElementById("wizardSendBatchButton");

      if (sendButton && sendButton.parentElement === cameraArea) {
        cameraArea.insertBefore(memoArea, sendButton);
      } else {
        cameraArea.appendChild(memoArea);
      }
    }
  }

  function prepareReturnMemoHost() {
    const irregularArea = document.getElementById("wizardIrregularArea");
    const postSendArea = document.getElementById("wizardPostSendArea");
    const memoArea = document.getElementById("wizardReturnMemoArea");
    const cameraArea = document.getElementById("cameraPreview");

    if (irregularArea) irregularArea.hidden = true;
    if (cameraArea) cameraArea.classList.remove("isActive");
    if (postSendArea) postSendArea.hidden = false;

    if (
      memoArea &&
      postSendArea &&
      memoArea.parentElement !== postSendArea
    ) {
      const postSendCancel = document.getElementById("wizardPostSendCancelButton");

      if (
        postSendCancel &&
        postSendCancel.parentElement === postSendArea
      ) {
        postSendArea.insertBefore(memoArea, postSendCancel);
      } else {
        postSendArea.appendChild(memoArea);
      }
    }
  }

  function installReturnMemoRestoreObserver() {
    const memoArea = document.getElementById("wizardReturnMemoArea");

    if (!memoArea || memoArea.dataset.irregularSendObserved === "true") {
      return;
    }

    memoArea.dataset.irregularSendObserved = "true";

    const observer = new MutationObserver(function() {
      if (memoArea.hidden) restoreReturnMemoHost();
    });

    observer.observe(memoArea, {
      attributes:true,
      attributeFilter:["hidden"]
    });
  }

  function prepareRecordsForSend(records) {
    if (
      window.QuantityTransfer &&
      typeof window.QuantityTransfer.prepareIrregularRecords === "function"
    ) {
      return window.QuantityTransfer.prepareIrregularRecords(records);
    }
    return records;
  }

  function markQuantityTransferAccepted() {
    if (
      window.QuantityTransfer &&
      typeof window.QuantityTransfer.markIrregularSendAccepted === "function"
    ) {
      window.QuantityTransfer.markIrregularSendAccepted();
    }
  }

  function rebuildEntry(selected) {
    const lookupCode =
      selected && selected.type === "machine"
        ? selected.managedId
        : selected && selected.code;

    if (!lookupCode) return null;

    const details = getScannerItemDetails(lookupCode);
    if (!details) return null;

    const record = buildWizardScanRecord(details);

    if (record.recordType === "quantity") {
      const quantity = Number(selected.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) return null;

      record.quantity = quantity;
      record.sourceQuantityLogId = normalize(selected.sourceQuantityLogId);
      record.sourceLocation = normalize(selected.sourceLocation);
      record.displayText =
        (record.displayName || record.itemCode) +
        " × " + quantity + (record.unit || "");
    }

    return record;
  }

  async function ensureShipmentPhotoFlow(records, previousSendId) {
    if (wizardState.mode !== "出庫") return;

    const photoArea = document.getElementById("wizardPhotoArea");
    if (photoArea && photoArea.hidden === false) return;
    if (!lastSuccessfulSend) return;

    const currentSendId = normalize(lastSuccessfulSend.sendId);
    if (!currentSendId || currentSendId === normalize(previousSendId)) return;
    if (Number(lastSuccessfulSend.successCount || 0) < 1) return;

    const entries = (Array.isArray(records) ? records : [])
      .map(rebuildEntry)
      .filter(Boolean);

    if (!entries.length) return;

    const sendRecords = entries.map(function(entry) {
      return buildBatchRecordData(entry);
    });

    const context = {
      mode:"出庫",
      modeLabel:"出庫",
      sendId:currentSendId,
      sentAt:lastSuccessfulSend.sentAt || new Date().toISOString(),
      returnCaseId:"",
      batchMemo:"",
      entries:entries,
      records:sendRecords,
      logIds:Array.isArray(lastSuccessfulSend.logIds)
        ? lastSuccessfulSend.logIds.slice()
        : []
    };

    console.info(
      "リファクタ版：イレギュラーマスタ出庫の写真画面を補完します",
      currentSendId
    );

    await beginWizardPostSendFlow(context);
  }

  async function buildAndStageRecords(records) {
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
        record.sourceQuantityLogId = normalize(selected.sourceQuantityLogId);
        record.sourceLocation = normalize(selected.sourceLocation);

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

    return true;
  }

  window.sendIrregularMasterPickerBatch = async function(records) {
    if (!Array.isArray(records) || !records.length) {
      alert("送信する品目がありません");
      return false;
    }

    let preparedRecords;
    try {
      preparedRecords = prepareRecordsForSend(records);
    } catch (error) {
      alert(error.message || String(error));
      return false;
    }

    const previousSendId = lastSuccessfulSend
      ? normalize(lastSuccessfulSend.sendId)
      : "";

    const staged = await buildAndStageRecords(preparedRecords);
    if (!staged) return false;

    const isReturnMemoStage =
      wizardState.mode === "返却" &&
      !wizardReturnMemoConfirmed;

    if (isReturnMemoStage) {
      prepareReturnMemoHost();
      await sendWizardBatch();
      return true;
    }

    const accepted = await sendWizardBatch();

    if (accepted) {
      markQuantityTransferAccepted();
      await ensureShipmentPhotoFlow(preparedRecords, previousSendId);
    }

    return accepted;
  };

  installReturnMemoRestoreObserver();

  console.info("リファクタ版：イレギュラー共通送信モジュール読込完了");
})();
