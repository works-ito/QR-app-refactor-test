/*
 * 販売品入庫受付（開発版 v33）
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
  const receptionGrid =
    document.querySelector("#receptionStep .buttonGrid");

  if (!receptionGrid) return;

  let entryButton =
    document.getElementById("salesStockInEntryButton");

  /*
   * 移行期間中は、固定HTMLがまだ無い場合だけ
   * 従来どおり入口ボタンを補完する。
   * 固定HTML化後は既存ボタンへ動作だけ接続する。
   */
  if (!entryButton) {
    entryButton = document.createElement("button");
    entryButton.id = "salesStockInEntryButton";
    entryButton.className = "choiceButton";
    entryButton.type = "button";
    entryButton.innerHTML =
      "販売品入庫受付" +
      '<span class="choiceSubText">仕入れた販売品の在庫を増やす</span>';

    receptionGrid.appendChild(entryButton);
  }

  if (entryButton.dataset.salesStockInBound !== "true") {
    entryButton.dataset.salesStockInBound = "true";
    entryButton.addEventListener("click", openSalesEntry);
  }

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
