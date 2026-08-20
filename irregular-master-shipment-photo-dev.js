/*
 * 開発版 v82：イレギュラー受付 → マスタ選択 → 出庫 の写真遷移補強。
 *
 * 症状：
 * - マスタから数量管理品などを選び、出庫を送信すると登録自体は成功するが、
 *   送信後に「出庫写真の添付」へ進まず、設定完了画面だけが残ることがある。
 *
 * 方針：
 * - 既存 sendIrregularMasterPickerBatch() / sendWizardBatch() は変更しない。
 * - 既存の送信後フローが正常に写真画面を開いた場合は何もしない。
 * - 新しい送信IDで出庫成功が確認できたのに写真画面が開いていない場合だけ、
 *   既存 beginWizardPostSendFlow() へ同じ送信内容を再度渡して写真画面を開く。
 * - GASへの再送信は行わない。写真画面の遷移だけを補強する。
 */
(function() {
  "use strict";

  if (window.__irregularMasterShipmentPhotoDevInstalled) return;
  window.__irregularMasterShipmentPhotoDevInstalled = true;

  const originalSend = window.sendIrregularMasterPickerBatch;

  if (typeof originalSend !== "function") {
    console.warn(
      "開発版：イレギュラーマスタ出庫写真補強を読み込めませんでした"
    );
    return;
  }

  function normalize(value) {
    return String(value == null ? "" : value).trim();
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

    /* 既存フローが正常に開いていれば何もしない。 */
    if (photoArea && photoArea.hidden === false) return;

    if (!lastSuccessfulSend) return;

    const currentSendId = normalize(lastSuccessfulSend.sendId);
    if (!currentSendId || currentSendId === normalize(previousSendId)) return;
    if (Number(lastSuccessfulSend.successCount || 0) < 1) return;

    const entries = (Array.isArray(records) ? records : [])
      .map(rebuildEntry)
      .filter(Boolean);

    if (!entries.length) return;

    const sendRecords = entries
      .map(function(entry) {
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
      "開発版：イレギュラーマスタ出庫の写真画面を補完します",
      currentSendId
    );

    await beginWizardPostSendFlow(context);
  }

  window.sendIrregularMasterPickerBatch = async function(records) {
    const previousSendId = lastSuccessfulSend
      ? normalize(lastSuccessfulSend.sendId)
      : "";

    const accepted = await originalSend(records);

    if (accepted) {
      await ensureShipmentPhotoFlow(records, previousSendId);
    }

    return accepted;
  };

  console.info(
    "開発版：イレギュラーマスタ出庫写真遷移補強 v82 読込完了"
  );
})();
