/*
 * 開発版 v43：イレギュラー受付・数量管理品の連続入力と在庫超過チェック受け皿。
 *
 * - 数量追加後は最初の大分類へ戻さず、同じ大分類の品目一覧へ戻る。
 * - 出庫／廃棄では、拠点別在庫が取得できる場合だけ在庫超過をブロックする。
 * - 現在の初期データに拠点別在庫がない場合は「在庫データ未接続」と明示し、誤判定しない。
 * - GAS・本番は変更しない。
 */
(function() {
  "use strict";

  const ROOT_ID = "irregularMasterPickerDev";
  const STYLE_ID = "irregularQuantityFlowDevStyle";
  const REDUCE_MODES = new Set(["出庫","廃棄"]);

  function normalize(value) {
    return String(value == null ? "" : value).trim();
  }

  function numberOrNull(value) {
    if (value === undefined || value === null || value === "") return null;
    const num = Number(String(value).replace(/,/g,""));
    return Number.isFinite(num) ? num : null;
  }

  function currentMode() {
    const element = document.getElementById("mode");
    return normalize(element && element.value);
  }

  function currentLocation() {
    const element = document.getElementById("location");
    return normalize(element && element.value);
  }

  function itemCodeOf(item) {
    if (!item) return "";
    return normalize(
      item["品目コード"] || item.itemCode || item["商品コード"] || item["コード"] || item.code || ""
    );
  }

  function displayNameOf(item) {
    if (!item) return "";
    return normalize(
      item["表示名"] || item["品名"] || item["商品名"] || item["名称"] || item.displayName || item.name || ""
    );
  }

  function unitOf(item) {
    if (!item) return "個";
    return normalize(item["単位"] || item.unit || "個") || "個";
  }

  function currentQuantityCode() {
    const sub = document.getElementById("irregularMasterQuantitySub");
    const text = normalize(sub && sub.textContent);
    return text ? normalize(text.split("／")[0]) : "";
  }

  function currentQuantityName() {
    const name = document.getElementById("irregularMasterQuantityName");
    return normalize(name && name.textContent);
  }

  function currentCategory() {
    const badge = document.getElementById("irregularMasterSelectedCategory");
    return normalize(badge && badge.textContent);
  }

  function findQuantityItem(code) {
    try {
      if (typeof quantityItems === "undefined" || !Array.isArray(quantityItems)) return null;
      return quantityItems.find(function(item) {
        return itemCodeOf(item) === normalize(code);
      }) || null;
    } catch (error) {
      console.warn("開発版：数量管理品のマスタ参照に失敗しました",error);
      return null;
    }
  }

  function getStockFromFutureMap(code, location) {
    try {
      if (
        typeof window.quantityStockByLocation === "object" &&
        window.quantityStockByLocation
      ) {
        const byCode =
          window.quantityStockByLocation[code] ||
          window.quantityStockByLocation[
            normalize(code).toLowerCase()
          ];

        if (byCode && typeof byCode === "object") {
          const mapped =
            numberOrNull(
              byCode[location]
            );

          if (mapped !== null) {
            return mapped;
          }
        }
      }

      /*
       * 公開Mapの生成タイミングに左右されないよう、
       * app.jsが保持する初期データ配列も直接参照する。
       */
      if (
        typeof quantityStockBalances !== "undefined" &&
        Array.isArray(quantityStockBalances)
      ) {
        const normalizedCode =
          normalize(code).toLowerCase();

        const found =
          quantityStockBalances.find(
            function(item) {
              return (
                normalize(
                  item && item.itemCode
                ).toLowerCase() ===
                  normalizedCode &&
                normalize(
                  item && item.location
                ) === location
              );
            }
          );

        if (found) {
          return numberOrNull(
            found.currentStock
          );
        }
      }

      return null;

    } catch (error) {
      return null;
    }
  }

  function getStockFromItem(item, location) {
    if (!item || !location) return null;
    const keys = [
      location,
      location + "在庫",
      location + "在庫数",
      location + "数量",
      location === "MF" ? "ＭＦ" : ""
    ].filter(Boolean);

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(item,key)) {
        const found = numberOrNull(item[key]);
        if (found !== null) return found;
      }
    }
    return null;
  }

  function availableStock(code, location) {
    const fromMap = getStockFromFutureMap(code,location);
    if (fromMap !== null) return fromMap;
    return getStockFromItem(findQuantityItem(code),location);
  }

  function queuedQuantityForName(name) {
    if (!name) return 0;
    const list = document.getElementById("irregularMasterQueueList");
    if (!list) return 0;
    let total = 0;
    list.querySelectorAll(".irregularMasterQueueMain").forEach(function(el) {
      const text = normalize(el.textContent);
      if (!text.startsWith(name + " × ")) return;
      const match = text.match(/ × (\d+(?:\.\d+)?)/);
      if (match) total += Number(match[1]) || 0;
    });
    return total;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} .irregularQuantityStockInfo {
        margin-top:9px;
        padding:9px 10px;
        border:1px solid #dbe3ee;
        border-radius:10px;
        background:#f8fafc;
        color:#475569;
        font-size:12px;
        line-height:1.5;
      }
      #${ROOT_ID} .irregularQuantityStockInfo strong {
        color:#0f172a;
      }
      #${ROOT_ID} .irregularQuantityStockInfo.isWarning {
        border-color:#fed7aa;
        background:#fff7ed;
        color:#9a3412;
      }
      #${ROOT_ID} .irregularQuantityStockInfo.isError {
        border-color:#fecaca;
        background:#fef2f2;
        color:#991b1b;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureStockBox() {
    const field = document.querySelector("#"+ROOT_ID+" .irregularMasterQuantityField");
    if (!field) return null;
    let box = document.getElementById("irregularQuantityStockInfo");
    if (!box) {
      box = document.createElement("div");
      box.id = "irregularQuantityStockInfo";
      box.className = "irregularQuantityStockInfo";
      field.insertAdjacentElement("afterend",box);
    }
    return box;
  }

  function renderStockInfo(extraMessage, stateClass) {
    const box = ensureStockBox();
    if (!box) return;

    const code = currentQuantityCode();
    const name = currentQuantityName();
    const location = currentLocation();
    const mode = currentMode();
    const item = findQuantityItem(code);
    const unit = unitOf(item);
    const stock = availableStock(code,location);
    const queued = queuedQuantityForName(name);

    box.className = "irregularQuantityStockInfo" + (stateClass ? " "+stateClass : "");

    if (!REDUCE_MODES.has(mode)) {
      box.innerHTML = "この作業では在庫上限チェックは不要です。";
      return;
    }

    if (stock === null) {
      box.innerHTML =
        "<strong>在庫数チェック：GAS接続待ち</strong><br>" +
        "現在の初期データには拠点別在庫数が含まれていないため、UI側ではまだ在庫超過判定を行いません。";
      return;
    }

    const remaining = Math.max(0,stock - queued);
    box.innerHTML =
      "<strong>" + (location || "選択拠点") + " 現在在庫：" + stock + unit + "</strong><br>" +
      "追加済み：" + queued + unit + " ／ 追加可能：" + remaining + unit +
      (extraMessage ? "<br>" + extraMessage : "");
  }

  function showSameCategoryItems(category) {
    if (!category) return;
    const buttons = Array.from(document.querySelectorAll("#irregularMasterCategoryGrid .irregularMasterChoice"));
    const button = buttons.find(function(candidate) {
      const clone = candidate.cloneNode(true);
      clone.querySelectorAll("small").forEach(function(el){el.remove()});
      return normalize(clone.textContent) === category;
    });
    if (!button) return;
    button.click();
    const panel = document.getElementById("irregularMasterPickerPanel");
    if (panel) setTimeout(function(){panel.scrollIntoView({behavior:"smooth",block:"start"});},30);
  }

  function validateQuantityBeforeAdd(event) {
    const button = event.target && event.target.closest
      ? event.target.closest("#irregularMasterAddQuantity")
      : null;
    if (!button) return;

    const input = document.getElementById("irregularMasterQuantityValue");
    const qty = Number(input && input.value);
    if (!Number.isInteger(qty) || qty < 1) return;

    const category = currentCategory();
    const code = currentQuantityCode();
    const name = currentQuantityName();
    const location = currentLocation();
    const mode = currentMode();
    const item = findQuantityItem(code);
    const unit = unitOf(item);
    const stock = availableStock(code,location);
    const queued = queuedQuantityForName(name);

    if (REDUCE_MODES.has(mode) && stock !== null && queued + qty > stock) {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderStockInfo(
        "入力数量 " + qty + unit + " を追加すると在庫を " + (queued + qty - stock) + unit + " 超過します。",
        "isError"
      );
      return;
    }

    /* 既存pickerの追加処理が終わった後、同じ大分類の品目一覧へ戻す。 */
    setTimeout(function() {
      showSameCategoryItems(category);
    },60);
  }

  function watchQuantityStep() {
    const root = document.getElementById(ROOT_ID);
    if (!root || root.dataset.quantityFlowObserved === "1") return;
    root.dataset.quantityFlowObserved = "1";

    const observer = new MutationObserver(function() {
      const section = root.querySelector('[data-master-step="quantity"]');
      if (section && !section.hidden) setTimeout(function(){renderStockInfo();},0);
    });
    observer.observe(root,{attributes:true,subtree:true,attributeFilter:["hidden"]});
  }

  function init() {
    ensureStyle();
    watchQuantityStep();
    document.addEventListener("click",validateQuantityBeforeAdd,true);
  }

  window.refreshIrregularQuantityStockInfo = renderStockInfo;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",init,{once:true});
  } else {
    init();
  }
})();
