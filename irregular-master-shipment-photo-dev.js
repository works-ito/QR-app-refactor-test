/*
 * 開発版 v83：イレギュラー受付 → マスタ選択 → 出庫 の写真遷移補強＋一時診断。
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
 * - v83では救済wrapperが実際に発火したかを一時診断できるようにする。
 */
(function() {
  "use strict";

  if (window.__irregularMasterShipmentPhotoDevInstalled) return;
  window.__irregularMasterShipmentPhotoDevInstalled = true;

  const diagnostic = {
    attempted:false,
    accepted:false,
    normalPhotoVisible:false,
    rescueTriggered:false,
    sendId:""
  };
  window.__irregularShipmentPhotoDiagnostic = diagnostic;

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

    diagnostic.attempted = true;

    const photoArea = document.getElementById("wizardPhotoArea");

    /* 既存フローが正常に開いていれば何もしない。 */
    if (photoArea && photoArea.hidden === false) {
      diagnostic.normalPhotoVisible = true;
      diagnostic.sendId = lastSuccessfulSend
        ? normalize(lastSuccessfulSend.sendId)
        : "";
      return;
    }

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

    diagnostic.rescueTriggered = true;
    diagnostic.sendId = currentSendId;

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

    if (wizardState.mode === "出庫") {
      diagnostic.attempted = false;
      diagnostic.accepted = false;
      diagnostic.normalPhotoVisible = false;
      diagnostic.rescueTriggered = false;
      diagnostic.sendId = "";
    }

    const accepted = await originalSend(records);

    if (wizardState.mode === "出庫") {
      diagnostic.accepted = !!accepted;
    }

    if (accepted) {
      await ensureShipmentPhotoFlow(records, previousSendId);
    }

    return accepted;
  };

  function installDiagnosticButton() {
    if (document.getElementById("shipmentPhotoDiagnosticButton")) return;

    const button = document.createElement("button");
    button.id = "shipmentPhotoDiagnosticButton";
    button.type = "button";
    button.textContent = "出庫写真診断";

    Object.assign(button.style, {
      position:"fixed",
      right:"12px",
      bottom:"calc(12px + env(safe-area-inset-bottom))",
      zIndex:"9999",
      padding:"8px 11px",
      border:"1px solid #64748b",
      borderRadius:"10px",
      background:"#ffffff",
      color:"#172033",
      fontSize:"13px",
      fontWeight:"800"
    });

    button.addEventListener("click", function() {
      alert(
        "イレギュラー出庫 写真診断\n" +
        "送信受理: " + (diagnostic.accepted ? "YES" : "NO") + "\n" +
        "正規写真表示: " + (diagnostic.normalPhotoVisible ? "YES" : "NO") + "\n" +
        "救済wrapper発火: " + (diagnostic.rescueTriggered ? "YES" : "NO") + "\n" +
        "送信ID: " + (diagnostic.sendId || "-")
      );
    });

    document.body.appendChild(button);
  }

  installDiagnosticButton();

  console.info(
    "開発版：イレギュラーマスタ出庫写真遷移補強 v83 読込完了"
  );
})();
