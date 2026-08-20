/*
 * QR在庫管理 - 数量管理品 拠点移動
 * refactor-integration-test
 *
 * 責務:
 * - 移動元拠点UI
 * - 移動元在庫の検証
 * - sourceLocation の保持
 * - イレギュラー送信へ sourceLocation を供給する正式API
 *
 * 送信関数そのものは上書きしない。
 */
(function() {
  "use strict";

  const LOCATIONS = ["本社", "三郷", "MF"];
  const normalSourceByItemCode = new Map();
  const irregularSourceByItemCode = new Map();
  const irregularQueuedSourceByItemCode = new Map();

  function normalize(value) {
    return String(value == null ? "" : value).trim();
  }

  function isQuantityTransferMode() {
    try {
      return typeof wizardState !== "undefined" && wizardState.mode === "拠点移動";
    } catch (error) {
      return false;
    }
  }

  function destinationLocation() {
    try {
      return normalize(wizardState.location);
    } catch (error) {
      return "";
    }
  }

  function getStock(itemCode, location) {
    try {
      if (typeof getQuantityCurrentStock === "function") {
        const value = Number(getQuantityCurrentStock(itemCode, location));
        return Number.isFinite(value) ? value : 0;
      }
    } catch (error) {
      console.warn("数量拠点移動：現在庫取得に失敗しました", error);
    }
    return 0;
  }

  function makeSourceBox(id, labelText) {
    const box = document.createElement("div");
    box.id = id;
    box.className = "quantityTransferSourceBox";
    box.hidden = true;

    const label = document.createElement("div");
    label.className = "quantityTransferSourceLabel";
    label.textContent = labelText || "移動元拠点";

    const hint = document.createElement("div");
    hint.className = "quantityTransferSourceHint";
    hint.textContent = "受入先ではなく、どの拠点から届いたかを選択してください";

    const buttons = document.createElement("div");
    buttons.className = "quantityTransferSourceButtons";

    const status = document.createElement("div");
    status.className = "quantityTransferSourceStatus";

    box.append(label, hint, buttons, status);
    return box;
  }

  function injectStyle() {
    if (document.getElementById("quantityTransferStyle")) return;
    const style = document.createElement("style");
    style.id = "quantityTransferStyle";
    style.textContent = `
      .quantityTransferSourceBox{margin:10px 0;padding:10px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff}
      .quantityTransferSourceBox[hidden]{display:none!important}
      .quantityTransferSourceLabel{font-size:13px;font-weight:800;color:#1e3a8a}
      .quantityTransferSourceHint{margin-top:3px;font-size:11px;line-height:1.45;color:#64748b}
      .quantityTransferSourceButtons{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}
      .quantityTransferSourceButton{min-height:48px;padding:7px 8px;border:1px solid #93c5fd;border-radius:9px;background:#fff;color:#0f172a;font-size:13px;font-weight:800}
      .quantityTransferSourceButton small{display:block;margin-top:2px;color:#64748b;font-size:11px;font-weight:600}
      .quantityTransferSourceButton.isSelected{border-color:#2563eb;background:#dbeafe;color:#1d4ed8;box-shadow:inset 0 0 0 1px #2563eb}
      .quantityTransferSourceButton.isEmpty{opacity:.55}
      .quantityTransferSourceStatus{margin-top:7px;font-size:11px;line-height:1.45;color:#475569}
    `;
    document.head.appendChild(style);
  }

  function renderSourceChoices(box, itemCode, selectedSource, onSelect) {
    if (!box) return;
    const destination = destinationLocation();
    const buttons = box.querySelector(".quantityTransferSourceButtons");
    const status = box.querySelector(".quantityTransferSourceStatus");
    buttons.replaceChildren();

    LOCATIONS.filter(function(location) {
      return location !== destination;
    }).forEach(function(location) {
      const stock = getStock(itemCode, location);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quantityTransferSourceButton" +
        (selectedSource === location ? " isSelected" : "") +
        (stock <= 0 ? " isEmpty" : "");
      button.dataset.location = location;
      button.dataset.stock = String(stock);
      button.textContent = location;

      const small = document.createElement("small");
      small.textContent = "使用可能 " + stock;
      button.appendChild(small);

      button.addEventListener("click", function() {
        onSelect(location, stock);
        renderSourceChoices(box, itemCode, location, onSelect);
      });
      buttons.appendChild(button);
    });

    if (status) {
      status.textContent = selectedSource
        ? "移動元：" + selectedSource + " → 受入先：" + (destination || "未選択")
        : "移動元拠点を選択してください";
    }
  }

  function ensureNormalBox() {
    const area = document.getElementById("scannerQuantityInput");
    if (!area) return null;

    let box = document.getElementById("scannerQuantityTransferSourceBox");
    if (!box) {
      box = makeSourceBox("scannerQuantityTransferSourceBox", "移動元拠点");
      const quantityField = area.querySelector(".scannerQuantityField");
      if (quantityField) quantityField.insertAdjacentElement("beforebegin", box);
      else area.appendChild(box);
    }
    return box;
  }

  function currentNormalItemCode() {
    try {
      if (typeof pendingWizardQuantityRecord !== "undefined" && pendingWizardQuantityRecord) {
        return normalize(pendingWizardQuantityRecord.itemCode || pendingWizardQuantityRecord.qrText);
      }
    } catch (error) {}
    return "";
  }

  function refreshNormalBox() {
    const box = ensureNormalBox();
    if (!box) return;

    const area = document.getElementById("scannerQuantityInput");
    const itemCode = currentNormalItemCode();
    const visible = Boolean(
      isQuantityTransferMode() &&
      area && area.classList.contains("isVisible") &&
      itemCode
    );

    box.hidden = !visible;
    if (!visible) return;

    const selected = normalize(normalSourceByItemCode.get(itemCode));
    renderSourceChoices(box, itemCode, selected, function(location) {
      normalSourceByItemCode.set(itemCode, location);
      try {
        if (pendingWizardQuantityRecord) {
          pendingWizardQuantityRecord.sourceLocation = location;
        }
      } catch (error) {}
    });
  }

  function validateNormalAdd(event) {
    const button = event.target && event.target.closest
      ? event.target.closest("#addQuantityButton")
      : null;
    if (!button || !isQuantityTransferMode()) return;

    const itemCode = currentNormalItemCode();
    if (!itemCode) return;

    const source = normalize(normalSourceByItemCode.get(itemCode));
    const destination = destinationLocation();
    const quantity = Number(document.getElementById("scannerQuantityValue")?.value || 0);
    const stock = getStock(itemCode, source);

    if (!source) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert("移動元拠点を選択してください");
      return;
    }
    if (source === destination) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert("移動元と受入先は別の拠点を選択してください");
      return;
    }
    if (Number.isInteger(quantity) && quantity > stock) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert("移動元「" + source + "」の使用可能在庫は" + stock + "です");
      return;
    }

    try {
      if (pendingWizardQuantityRecord) {
        pendingWizardQuantityRecord.sourceLocation = source;
      }
    } catch (error) {}
  }

  function ensureIrregularBox() {
    const step = document.querySelector('#irregularMasterPickerDev [data-master-step="quantity"]');
    if (!step) return null;

    let box = document.getElementById("irregularQuantityTransferSourceBox");
    if (!box) {
      box = makeSourceBox("irregularQuantityTransferSourceBox", "移動元拠点");
      const field = step.querySelector(".irregularMasterQuantityField");
      if (field) field.insertAdjacentElement("beforebegin", box);
      else step.appendChild(box);
    }
    return box;
  }

  function irregularItemCode() {
    const sub = document.getElementById("irregularMasterQuantitySub");
    return normalize(sub?.textContent).split("／")[0].trim();
  }

  function refreshIrregularBox() {
    const box = ensureIrregularBox();
    if (!box) return;

    const step = document.querySelector('#irregularMasterPickerDev [data-master-step="quantity"]');
    const itemCode = irregularItemCode();
    const visible = Boolean(isQuantityTransferMode() && step && !step.hidden && itemCode);

    box.hidden = !visible;
    if (!visible) return;

    const selected = normalize(irregularSourceByItemCode.get(itemCode));
    renderSourceChoices(box, itemCode, selected, function(location) {
      irregularSourceByItemCode.set(itemCode, location);
    });
  }

  function validateIrregularAdd(event) {
    const button = event.target && event.target.closest
      ? event.target.closest("#irregularMasterAddQuantity")
      : null;
    if (!button || !isQuantityTransferMode()) return;

    const itemCode = irregularItemCode();
    if (!itemCode) return;

    const source = normalize(irregularSourceByItemCode.get(itemCode));
    const destination = destinationLocation();
    const quantity = Number(document.getElementById("irregularMasterQuantityValue")?.value || 0);
    const stock = getStock(itemCode, source);

    if (!source) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert("移動元拠点を選択してください");
      return;
    }
    if (source === destination) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert("移動元と受入先は別の拠点を選択してください");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert("数量は1以上の整数で入力してください");
      return;
    }
    if (quantity > stock) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert("移動元「" + source + "」の使用可能在庫は" + stock + "です");
      return;
    }

    const queuedSource = normalize(irregularQueuedSourceByItemCode.get(itemCode));
    if (queuedSource && queuedSource !== source) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert(
        itemCode +
        "は移動元「" + queuedSource +
        "」ですでに追加済みです。別の移動元から追加する場合は先にまとめて送信してください。"
      );
      return;
    }

    irregularQueuedSourceByItemCode.set(itemCode, source);

    setTimeout(function() {
      const queue = document.getElementById("irregularMasterQueue");
      if (queue && !queue.hidden) {
        queue.scrollIntoView({behavior:"smooth", block:"center"});
      }
    }, 0);
  }

  function prepareIrregularRecords(records) {
    if (!Array.isArray(records)) return records;

    return records.map(function(record) {
      const next = Object.assign({}, record);

      if (
        isQuantityTransferMode() &&
        next &&
        next.type === "quantity"
      ) {
        const itemCode = normalize(next.code);
        const source =
          normalize(next.sourceLocation) ||
          normalize(irregularQueuedSourceByItemCode.get(itemCode)) ||
          normalize(irregularSourceByItemCode.get(itemCode));

        if (!source) {
          throw new Error(
            (itemCode || "数量管理品") +
            "の移動元拠点がありません"
          );
        }

        next.sourceLocation = source;
      }

      return next;
    });
  }

  function markIrregularSendAccepted() {
    irregularQueuedSourceByItemCode.clear();
  }

  /*
   * TODO: app-core 側の正式payload生成へ移すまでの互換補正。
   * 送信関数は上書きしない。
   */
  function patchPreparedRecords() {
    if (typeof getWizardPreparedBatchRecords !== "function") return;
    if (getWizardPreparedBatchRecords.__quantityTransferPatched) return;

    const original = getWizardPreparedBatchRecords;
    const patched = function() {
      const prepared = original.apply(this, arguments);
      if (!Array.isArray(prepared)) return prepared;

      prepared.forEach(function(data, index) {
        if (!data || data.recordType !== "quantity" || data.mode !== "拠点移動") return;

        let source = "";
        try {
          const live = Array.isArray(scannedEntries) ? scannedEntries[index] : null;
          source = normalize(live && live.sourceLocation);
        } catch (error) {}

        if (!source) source = normalize(normalSourceByItemCode.get(data.itemCode));
        if (!source) source = normalize(irregularSourceByItemCode.get(data.itemCode));
        data.sourceLocation = source;
      });

      return prepared;
    };

    patched.__quantityTransferPatched = true;
    getWizardPreparedBatchRecords = patched;
    window.getWizardPreparedBatchRecords = patched;
  }

  function patchBatchRecordBuilder() {
    if (typeof buildBatchRecordData !== "function") return;
    if (buildBatchRecordData.__quantityTransferPatched) return;

    const original = buildBatchRecordData;
    const patched = function(record) {
      const data = original.apply(this, arguments);

      if (data && record && record.recordType === "quantity") {
        data.sourceLocation = normalize(record.sourceLocation);
      }

      return data;
    };

    patched.__quantityTransferPatched = true;
    patched.__original = original;
    buildBatchRecordData = patched;
    window.buildBatchRecordData = patched;
  }

  function clearTransferSelections() {
    normalSourceByItemCode.clear();
    irregularSourceByItemCode.clear();
    irregularQueuedSourceByItemCode.clear();
    refreshNormalBox();
    refreshIrregularBox();
  }

  function observeUi() {
    const target = document.body;
    if (!target) return;

    const observer = new MutationObserver(function() {
      refreshNormalBox();
      refreshIrregularBox();
    });

    observer.observe(target, {
      subtree:true,
      attributes:true,
      attributeFilter:["class", "hidden"]
    });
  }

  window.QuantityTransfer = Object.freeze({
    prepareIrregularRecords:prepareIrregularRecords,
    markIrregularSendAccepted:markIrregularSendAccepted,
    clearSelections:clearTransferSelections,
    refreshUi:function() {
      refreshNormalBox();
      refreshIrregularBox();
    }
  });

  function init() {
    injectStyle();
    ensureNormalBox();
    ensureIrregularBox();
    patchPreparedRecords();
    patchBatchRecordBuilder();
    refreshNormalBox();
    refreshIrregularBox();
    observeUi();

    document.addEventListener("click", validateNormalAdd, true);
    document.addEventListener("click", validateIrregularAdd, true);

    document.addEventListener("click", function(event) {
      const reset = event.target && event.target.closest
        ? event.target.closest("#restartButton,#resetAllScansButton")
        : null;
      if (reset) setTimeout(clearTransferSelections, 0);
    }, false);

    console.info("リファクタ版：数量管理品 拠点移動モジュール読込完了");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once:true});
  } else {
    init();
  }
})();
