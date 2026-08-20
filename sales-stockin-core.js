/*
 * 販売品入庫受付（開発版 v30）
 * GAS側の「仕入入庫」と販売品出庫取消履歴選択は未接続。
 * このファイルでは販売品入庫UIと販売品作業制限のみ先行実装する。
 */
(function() {
  const SALES_CATEGORY = "販売品";
  const SALES_ALLOWED_NORMAL_MODES = ["出庫", "出庫取消"];

  let salesStep = "location";
  let salesQrReader = null;
  let salesQrRunning = false;
  let salesQrDetectedItem = null;
  let state = {
    location:"",
    user:"",
    selections:[]
  };

  function value(item, keys) {
    return getFirstItemValue(item || {}, keys);
  }

  function categoryOf(item) {
    return value(item, ["区分", "category"]);
  }

  function isSalesItem(item) {
    return String(categoryOf(item) || "").trim() === SALES_CATEGORY;
  }

  function salesMasterItems() {
    return quantityItems
      .filter(isSalesItem)
      .map(function(item) {
        const itemCode = value(item, ["品目コード", "itemCode", "商品コード", "コード"]);
        return {
          itemCode:itemCode,
          displayName:value(item, ["表示名", "品名", "商品名", "名称", "displayName", "name"]) || itemCode,
          unit:value(item, ["単位", "unit"]) || "個",
          category:SALES_CATEGORY,
          sourceItem:item
        };
      })
      .filter(function(item) { return Boolean(item.itemCode); });
  }

  function injectStyle() {
    if (document.getElementById("salesStockInStyle")) return;
    const style = document.createElement("style");
    style.id = "salesStockInStyle";
    style.textContent = `
      #salesStockInEntryButton {
        border-color:#2e7d32 !important;
        background:#e8f5e9 !important;
        color:#1b5e20 !important;
      }
      #salesStockInEntryButton .choiceSubText { color:#2e7d32 !important; }
      #salesStockInPanel .salesStep { display:none; }
      #salesStockInPanel .salesStep.isActive { display:block; }
      #salesStockInPanel .salesTopStatus {
        display:flex; gap:8px; flex-wrap:wrap; margin:0 0 14px;
      }
      #salesStockInPanel .salesChip {
        display:inline-flex; align-items:center; min-height:30px; padding:4px 10px;
        border-radius:999px; background:#e8f5e9; color:#1b5e20; font-size:13px; font-weight:700;
      }
      #salesStockInPanel .salesSectionCard {
        margin-top:16px; padding:14px; border:1px solid #d7e3d8; border-radius:12px; background:#fff;
      }
      #salesStockInPanel .salesSectionCard h2 { margin:0 0 6px; font-size:17px; }
      #salesStockInPanel .salesSectionCard p { margin:0 0 12px; font-size:13px; color:#666; line-height:1.55; }
      #salesStockInItemSelect {
        width:100%; min-height:52px; padding:0 12px; border:1px solid #bbb; border-radius:10px;
        background:#fff; color:#111; font-size:16px;
      }
      #salesStockInPanel .salesInlineField { display:flex; gap:8px; margin-top:10px; align-items:stretch; }
      #salesStockInPanel .salesInlineField input {
        flex:1; min-width:0; min-height:48px; padding:0 12px; border:1px solid #bbb; border-radius:10px; font-size:18px;
      }
      #salesStockInPanel .salesInlineField button { min-width:120px; }
      #salesStockInQrViewport {
        display:none; margin-top:12px; border-radius:12px; overflow:hidden; background:#000;
        aspect-ratio:4/3;
      }
      #salesStockInQrViewport.isVisible { display:block; }
      #salesStockInQrVideo { width:100%; height:100%; object-fit:cover; display:block; }
      #salesStockInRows { margin-top:14px; }
      #salesStockInRows:empty::before {
        content:"まだ販売品は追加されていません。"; display:block; padding:14px; text-align:center;
        color:#777; border:1px dashed #c7c7c7; border-radius:10px;
      }
      #salesStockInConfirmList { margin-top:12px; }
      #salesStockInConfirmList .quantityInspectionRow { margin-bottom:8px; }
      #salesStockInProceedButton, #salesStockInFinalButton { width:100%; margin-top:18px; }
      #salesStockInFinalButton:disabled { opacity:.55; }
      #salesStockInPanel .salesBackButton { width:100%; margin-top:10px; }
    `;
    document.head.appendChild(style);
  }

  function hideBaseWizardPanels() {
    Object.keys(STEP_IDS).forEach(function(name) {
      const panel = document.getElementById(STEP_IDS[name]);
      if (panel) panel.classList.remove("isActive");
    });
  }

  function setSalesPanelActive(active) {
    const panel = document.getElementById("salesStockInPanel");
    if (!panel) return;
    panel.classList.toggle("isActive", Boolean(active));
  }

  function updateTopStatus() {
    const status = document.getElementById("salesStockInTopStatus");
    if (!status) return;
    status.replaceChildren();

    if (state.location) {
      const chip = document.createElement("span");
      chip.className = "salesChip";
      chip.textContent = state.location;
      status.appendChild(chip);
    }
    if (state.user) {
      const chip = document.createElement("span");
      chip.className = "salesChip";
      chip.textContent = state.user;
      status.appendChild(chip);
    }
    if (state.selections.length) {
      const chip = document.createElement("span");
      chip.className = "salesChip";
      chip.textContent = "追加済み " + state.selections.length + "品目";
      status.appendChild(chip);
    }
  }

  function showSalesStep(step) {
    salesStep = step;
    stopSalesQrScanner();
    document.querySelectorAll("#salesStockInPanel .salesStep").forEach(function(section) {
      section.classList.toggle("isActive", section.dataset.salesStep === step);
    });
    updateTopStatus();
    if (step === "items") {
      renderProductSelect();
      renderSelectionRows();
    }
    if (step === "confirm") {
      renderConfirm();
    }
    window.scrollTo({top:0, behavior:"smooth"});
  }

  function resetSalesEntry() {
    stopSalesQrScanner();
    state = {location:"", user:"", selections:[]};
    salesQrDetectedItem = null;
    const ids = [
      "salesStockInQuantity",
      "salesStockInQrQuantity"
    ];
    ids.forEach(function(id) {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const detected = document.getElementById("salesStockInQrDetected");
    if (detected) detected.textContent = "";
    const viewport = document.getElementById("salesStockInQrViewport");
    if (viewport) viewport.classList.remove("isVisible");
    renderProductSelect();
    renderSelectionRows();
    updateTopStatus();
  }

  function openSalesEntry() {
    resetSalesEntry();
    hideBaseWizardPanels();
    setSalesPanelActive(true);
    document.getElementById("selectionSummary").innerHTML = "";
    document.getElementById("selectionSummary").classList.add("isEmpty");
    document.getElementById("headerBackButton").classList.remove("hidden");
    showSalesStep("location");
  }

  function closeSalesEntry() {
    stopSalesQrScanner();
    setSalesPanelActive(false);
    showStep("reception");
    document.getElementById("headerBackButton").classList.add("hidden");
  }

  function goBack() {
    if (salesStep === "location") {
      closeSalesEntry();
      return;
    }
    if (salesStep === "user") {
      state.user = "";
      showSalesStep("location");
      return;
    }
    if (salesStep === "items") {
      showSalesStep("user");
      return;
    }
    if (salesStep === "confirm") {
      showSalesStep("items");
    }
  }

  window.salesStockInGoBack = goBack;
  window.salesStockInRestart = function() {
    closeSalesEntry();
  };

  function renderLocationButtons() {
    const container = document.getElementById("salesStockInLocations");
    container.replaceChildren();
    LOCATION_OPTIONS.forEach(function(location) {
      container.appendChild(createChoiceButton({
        label:location,
        value:location,
        onClick:function() {
          state.location = location;
          state.user = "";
          showSalesStep("user");
        }
      }));
    });
  }

  function renderUserButtons() {
    const container = document.getElementById("salesStockInUsers");
    container.replaceChildren();
    USER_OPTIONS.forEach(function(user) {
      container.appendChild(createChoiceButton({
        label:user,
        value:user,
        onClick:function() {
          state.user = user;
          showSalesStep("items");
        }
      }));
    });
  }

  function renderProductSelect() {
    const select = document.getElementById("salesStockInItemSelect");
    if (!select) return;
    const previous = select.value;
    select.replaceChildren();

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "販売品を選択してください";
    select.appendChild(empty);

    salesMasterItems().forEach(function(item) {
      const option = document.createElement("option");
      option.value = item.itemCode;
      option.textContent = item.displayName + "（" + item.itemCode + "）";
      select.appendChild(option);
    });

    if (Array.from(select.options).some(function(option) { return option.value === previous; })) {
      select.value = previous;
    }
  }

  function addSelection(itemCode, quantity) {
    const item = salesMasterItems().find(function(candidate) {
      return normalizeLookupKey(candidate.itemCode) === normalizeLookupKey(itemCode);
    });
    if (!item) {
      alert("販売品マスタに見つかりません");
      return false;
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      alert("数量を1以上の整数で入力してください");
      return false;
    }

    const existing = state.selections.find(function(row) {
      return normalizeLookupKey(row.itemCode) === normalizeLookupKey(item.itemCode);
    });
    if (existing) {
      existing.quantity += qty;
    } else {
      state.selections.push({
        itemCode:item.itemCode,
        displayName:item.displayName,
        unit:item.unit,
        category:SALES_CATEGORY,
        quantity:qty
      });
    }
    renderSelectionRows();
    updateTopStatus();
    return true;
  }

  function addFromList() {
    const select = document.getElementById("salesStockInItemSelect");
    const quantityInput = document.getElementById("salesStockInQuantity");
    if (!select.value) {
      alert("販売品を選択してください");
      return;
    }
    if (addSelection(select.value, quantityInput.value)) {
      quantityInput.value = "";
      select.value = "";
    }
  }

  function renderSelectionRows() {
    const container = document.getElementById("salesStockInRows");
    if (!container) return;
    container.replaceChildren();

    state.selections.forEach(function(item, index) {
      const row = document.createElement("div");
      row.className = "quantityInspectionRow";

      const header = document.createElement("div");
      header.className = "quantityInspectionRowHeader";
      const title = document.createElement("div");
      title.className = "quantityInspectionRowName";
      title.textContent = item.displayName;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "quantityInspectionRemove";
      remove.textContent = "削除";
      remove.addEventListener("click", function() {
        state.selections.splice(index, 1);
        renderSelectionRows();
        updateTopStatus();
      });
      header.append(title, remove);

      const summary = document.createElement("div");
      summary.className = "quantityInspectionPending";
      summary.textContent = item.itemCode + " ／ " + item.quantity + item.unit;
      row.append(header, summary);
      container.appendChild(row);
    });

    const proceed = document.getElementById("salesStockInProceedButton");
    if (proceed) proceed.disabled = state.selections.length === 0;
  }

  function proceedToConfirm() {
    if (!state.location || !state.user) {
      alert("実施拠点と担当者を選択してください");
      return;
    }
    if (!state.selections.length) {
      alert("入庫する販売品を1品目以上追加してください");
      return;
    }
    showSalesStep("confirm");
  }

  function renderConfirm() {
    const summary = document.getElementById("salesStockInConfirmSummary");
    const list = document.getElementById("salesStockInConfirmList");
    if (!summary || !list) return;

    const total = state.selections.reduce(function(sum, item) {
      return sum + Number(item.quantity || 0);
    }, 0);
    summary.textContent =
      "実施拠点：" + state.location + "\n" +
      "担当者：" + state.user + "\n" +
      "品目数：" + state.selections.length + "品目\n" +
      "合計数量：" + total;

    list.replaceChildren();
    state.selections.forEach(function(item) {
      const row = document.createElement("div");
      row.className = "quantityInspectionRow";
      const title = document.createElement("div");
      title.className = "quantityInspectionRowName";
      title.textContent = item.displayName;
      const meta = document.createElement("div");
      meta.className = "quantityInspectionPending";
      meta.textContent = item.itemCode + " ／ 入庫 " + item.quantity + item.unit;
      row.append(title, meta);
      list.appendChild(row);
    });
  }

  async function startSalesQrScanner() {
    if (salesQrRunning) return;
    if (!appInitialDataLoaded) {
      alert("在庫データ取得完了後にお試しください");
      return;
    }

    salesQrDetectedItem = null;
    document.getElementById("salesStockInQrDetected").textContent = "";
    const status = document.getElementById("salesStockInQrStatus");
    const viewport = document.getElementById("salesStockInQrViewport");
    viewport.classList.add("isVisible");
    status.textContent = "カメラ起動中…";

    try {
      const hints = new Map();
      hints.set(
        ZXing.DecodeHintType.POSSIBLE_FORMATS,
        [ZXing.BarcodeFormat.QR_CODE, ZXing.BarcodeFormat.DATA_MATRIX]
      );
      salesQrReader = new ZXing.BrowserMultiFormatReader(hints);
      const devices = await salesQrReader.listVideoInputDevices();
      if (!devices || !devices.length) throw new Error("カメラが見つかりません");

      const backCamera = devices.find(function(device) {
        const label = String(device.label || "").toLowerCase();
        return label.includes("back") || label.includes("rear") ||
          label.includes("environment") || label.includes("背面");
      });
      const deviceId = backCamera ? backCamera.deviceId : devices[devices.length - 1].deviceId;
      salesQrRunning = true;

      salesQrReader.decodeFromVideoDevice(deviceId, "salesStockInQrVideo", function(result) {
        if (!result || salesQrDetectedItem) return;
        const text = String(result.getText() || "").trim();
        const item = findQuantityItemLocal(text);
        if (!item || !isSalesItem(item)) {
          status.textContent = "販売品QRではありません\n" + text;
          return;
        }

        salesQrDetectedItem = {
          itemCode:value(item, ["品目コード", "itemCode", "商品コード", "コード"]) || text,
          displayName:value(item, ["表示名", "品名", "商品名", "名称", "displayName", "name"]) || text,
          unit:value(item, ["単位", "unit"]) || "個"
        };
        document.getElementById("salesStockInQrDetected").textContent =
          salesQrDetectedItem.displayName + "（" + salesQrDetectedItem.itemCode + "）";
        status.textContent = "販売品QRを読み取りました ✔";
        stopSalesQrScanner();
        viewport.classList.remove("isVisible");
        document.getElementById("salesStockInQrQuantity").focus();
      });
      status.textContent = "販売品QRを読み取ってください";
    } catch (error) {
      status.textContent = "カメラ起動失敗\n" + (error.message || String(error));
      stopSalesQrScanner();
      viewport.classList.remove("isVisible");
    }
  }

  function stopSalesQrScanner() {
    if (salesQrReader) {
      try { salesQrReader.reset(); } catch (error) {}
      salesQrReader = null;
    }
    salesQrRunning = false;
  }
  window.stopSalesQrScanner = stopSalesQrScanner;

  function addDetectedQrItem() {
    if (!salesQrDetectedItem) {
      alert("先に販売品QRを読み取ってください");
      return;
    }
    const input = document.getElementById("salesStockInQrQuantity");
    if (addSelection(salesQrDetectedItem.itemCode, input.value)) {
      salesQrDetectedItem = null;
      input.value = "";
      document.getElementById("salesStockInQrDetected").textContent = "";
      document.getElementById("salesStockInQrStatus").textContent =
        "必要なら続けてQRから追加できます";
    }
  }

  function injectUi() {
    injectStyle();
    const receptionGrid = document.querySelector("#receptionStep .buttonGrid");
    if (!receptionGrid || document.getElementById("salesStockInEntryButton")) return;

    const entryButton = document.createElement("button");
    entryButton.id = "salesStockInEntryButton";
    entryButton.className = "choiceButton";
    entryButton.type = "button";
    entryButton.innerHTML =
      "販売品入庫受付" +
      '<span class="choiceSubText">仕入れた販売品の在庫を増やす</span>';
    entryButton.addEventListener("click", openSalesEntry);
    receptionGrid.appendChild(entryButton);

    const panel = document.createElement("section");
    panel.id = "salesStockInPanel";
    panel.className = "panel";
    panel.innerHTML = `
      <div class="stepHeader">
        <div class="stepLabel">販売品入庫</div>
        <div class="receptionStatus" style="background:#e8f5e9;color:#1b5e20;border-color:#a5d6a7;">販売品入庫受付</div>
      </div>
      <div id="salesStockInTopStatus" class="salesTopStatus"></div>

      <div class="salesStep" data-sales-step="location">
        <h1 class="question">実施拠点を選んでください</h1>
        <p class="questionHint">販売品を入庫する拠点を選択します</p>
        <div id="salesStockInLocations" class="buttonGrid singleColumn"></div>
      </div>

      <div class="salesStep" data-sales-step="user">
        <h1 class="question">担当者を選んでください</h1>
        <p class="questionHint">今回の販売品入庫を登録する担当者を選択します</p>
        <div id="salesStockInUsers" class="buttonGrid"></div>
      </div>

      <div class="salesStep" data-sales-step="items">
        <h1 class="question">入庫する販売品を追加してください</h1>
        <p class="questionHint">一覧またはQRから選び、数量を入力します。複数品目を続けて追加できます。</p>

        <div class="salesSectionCard">
          <h2>一覧から追加</h2>
          <p>数量管理品マスタの「区分＝販売品」だけ表示します。</p>
          <select id="salesStockInItemSelect"></select>
          <div class="salesInlineField">
            <input id="salesStockInQuantity" type="number" inputmode="numeric" min="1" step="1" placeholder="数量">
            <button id="salesStockInAddButton" type="button">追加</button>
          </div>
        </div>

        <div class="salesSectionCard">
          <h2>QRから追加</h2>
          <p>棚などの販売品QRを読んで品目を指定することもできます。</p>
          <button id="salesStockInQrStartButton" type="button">販売品QRを読み取る</button>
          <div id="salesStockInQrStatus" class="wizardPostSummary">QR読取は任意です</div>
          <div id="salesStockInQrViewport"><video id="salesStockInQrVideo" playsinline muted></video></div>
          <div id="salesStockInQrDetected" class="wizardPostSummary"></div>
          <div class="salesInlineField">
            <input id="salesStockInQrQuantity" type="number" inputmode="numeric" min="1" step="1" placeholder="数量">
            <button id="salesStockInQrAddButton" type="button">追加</button>
          </div>
        </div>

        <div class="salesSectionCard">
          <h2>追加済み</h2>
          <div id="salesStockInRows" class="quantityInspectionRows"></div>
        </div>

        <button id="salesStockInProceedButton" class="nextButton" type="button" disabled>入庫確定へ進む</button>
      </div>

      <div class="salesStep" data-sales-step="confirm">
        <h1 class="question">入庫内容を最終確認してください</h1>
        <p class="questionHint">確定後は指定拠点の販売品在庫へ加算します。</p>
        <div id="salesStockInConfirmSummary" class="wizardPostSummary"></div>
        <div id="salesStockInConfirmList"></div>
        <button id="salesStockInFinalButton" class="wizardSendButton" type="button" disabled>この内容で入庫する</button>
        <div class="connectionNote">開発版：GASの仕入入庫処理を接続後、このボタンを有効化します。</div>
        <button id="salesStockInConfirmBackButton" class="backButton salesBackButton" type="button">販売品追加へ戻る</button>
      </div>
    `;

    document.getElementById("receptionStep").insertAdjacentElement("afterend", panel);

    document.getElementById("salesStockInAddButton").addEventListener("click", addFromList);
    document.getElementById("salesStockInQrStartButton").addEventListener("click", startSalesQrScanner);
    document.getElementById("salesStockInQrAddButton").addEventListener("click", addDetectedQrItem);
    document.getElementById("salesStockInProceedButton").addEventListener("click", proceedToConfirm);
    document.getElementById("salesStockInConfirmBackButton").addEventListener("click", function() {
      showSalesStep("items");
    });

    renderLocationButtons();
    renderUserButtons();
    renderProductSelect();
    renderSelectionRows();
    showSalesStep("location");
    setSalesPanelActive(false);
  }

  /* 検品候補から販売品を除外する。 */
  const originalGetQuantityInspectionMasterItems = getQuantityInspectionMasterItems;
  getQuantityInspectionMasterItems = function() {
    return originalGetQuantityInspectionMasterItems().filter(function(item) {
      return String(item.category || "").trim() !== SALES_CATEGORY;
    });
  };

  /* 通常受付で販売品に許可するのは出庫。出庫取消は履歴選択実装待ち。 */
  const originalHandleReadOnlyDecoded = handleReadOnlyDecoded;
  handleReadOnlyDecoded = async function(text) {
    if (scannerBusy) return;
    const item = findQuantityItemLocal(text);
    if (item && isSalesItem(item)) {
      if (wizardState.mode === "出庫取消") {
        scannerBusy = true;
        notifyWizardScanError(
          "販売品の出庫取消は履歴を選択して行います\n履歴選択機能の実装後に使用できます",
          1900
        );
        setTimeout(function() { scannerBusy = false; }, 1700);
        return;
      }
      if (!SALES_ALLOWED_NORMAL_MODES.includes(wizardState.mode)) {
        scannerBusy = true;
        notifyWizardScanError(
          "販売品では「" + wizardState.modeLabel + "」を使用できません\n販売品は出庫のみ対象です",
          1800
        );
        setTimeout(function() { scannerBusy = false; }, 1600);
        return;
      }
    }
    return originalHandleReadOnlyDecoded(text);
  };

  /* イレギュラー受付でも販売品の返却・検品等を通さない。 */
  const originalBuildWizardIrregularRecord = buildWizardIrregularRecord;
  buildWizardIrregularRecord = function() {
    const record = originalBuildWizardIrregularRecord();
    if (
      record && record.recordType === "quantity" &&
      String(record.category || "").trim() === SALES_CATEGORY
    ) {
      if (record.mode === "出庫取消") {
        throw new Error("販売品の出庫取消は、QR読取後に出庫履歴から対象を選択する方式です。現在は未接続です。");
      }
      if (!SALES_ALLOWED_NORMAL_MODES.includes(record.mode)) {
        throw new Error("販売品では「" + record.mode + "」を使用できません。販売品は出庫のみ対象です。");
      }
    }
    return record;
  };

  injectUi();
})();
