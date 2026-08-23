/*
 * イレギュラー受付：マスタ選択UI（開発版 v65）
 *
 * GAS・既存送信処理は変更しない。
 * 管理番号候補は「簡易個体 → 個体 → REC → 軽量マスタ」の順で現在状態を優先し、
 * 軽量マスタは状態シート未登録IDの補欠としてだけ使用する。
 * 管理番号は複数選択してまとめて追加できる。
 */
(function() {
  const STYLE_ID = "irregularMasterPickerDevStyle";
  const ROOT_ID = "irregularMasterPickerDev";
  const MANAGED_PAGE_SIZE = 30;

  const CATEGORY_ORDER = [
    "解体機械","発電機","溶接機","照明系","散水機","高圧洗浄機",
    "荷役機械","コンプレッサー関連","水中ポンプ系","タンク類","足場系",
    "ハウス関連商品","トランシーバー関連商品","REC系","電動工具・汎用機械",
    "保安機材","販売品"
  ];

  let pickerState = {
    category:"",
    item:null,
    pending:null,
    selectedManaged:new Map(),
    managedRows:[],
    managedPage:0,
    quantityCheckoutCandidates:[],
    selectedQuantityCheckout:null,
    queue:[]
  };

  function value(item, keys) {
    if (!item) return "";
    if (typeof getFirstItemValue === "function") {
      const found = getFirstItemValue(item, keys);
      if (found !== undefined && found !== null && found !== "") return found;
    }
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(item, key)) {
        const found = item[key];
        if (found !== undefined && found !== null && found !== "") return found;
      }
    }
    return "";
  }

  function normalize(text) {
    return String(text == null ? "" : text).trim();
  }

  function majorCategoryOf(item) {
    return normalize(value(item, ["大分類","majorCategory","major_category","categoryMajor"]));
  }

  function managementIdOf(item) {
    return normalize(value(item, ["管理ID","管理番号","managedId","managementId","machineId","id"]));
  }

  function machineCodeOf(item) {
    const explicit = normalize(value(item, ["識別文字","機種コード","machineCode","modelCode","code"]));
    if (explicit) return explicit;

    const managedId = managementIdOf(item);
    if (managedId && managedId.includes("-")) return managedId.split("-")[0];

    const machine = normalize(value(item, ["機種"]));
    if (machine && /^[A-Za-z0-9]+$/.test(machine)) return machine;
    return "";
  }

  function itemCodeOf(item) {
    return normalize(value(item, ["品目コード","itemCode","商品コード","コード","code"]));
  }

  function displayNameOf(item, fallback) {
    return normalize(value(item, [
      "表示用","表示名","機種名","品名","商品名","名称","displayName","name"
    ])) || fallback || "名称未設定";
  }

  function orderOf(item) {
    const raw = Number(value(item, ["並び順","sortOrder","order"]));
    return Number.isFinite(raw) ? raw : 999999;
  }

  function machineSourceArrays() {
    const result = [];
    if (typeof managedMasterItems !== "undefined" && Array.isArray(managedMasterItems)) result.push(...managedMasterItems);
    if (typeof individualItems !== "undefined" && Array.isArray(individualItems)) result.push(...individualItems);
    if (typeof simpleItems !== "undefined" && Array.isArray(simpleItems)) result.push(...simpleItems);
    if (typeof recItems !== "undefined" && Array.isArray(recItems)) result.push(...recItems);
    return result;
  }

  function machineMasterChoices() {
    const map = new Map();
    machineSourceArrays().forEach(function(item) {
      const category = majorCategoryOf(item);
      const code = machineCodeOf(item);
      if (!category || !code) return;
      const key = category + "\u0000" + code;
      const current = map.get(key);
      const candidate = {
        type:"machine",
        category:category,
        code:code,
        name:displayNameOf(item, code),
        order:orderOf(item),
        source:item
      };
      if (!current || candidate.order < current.order) map.set(key, candidate);
    });
    return Array.from(map.values());
  }

  function quantityMasterChoices() {
    if (typeof quantityItems === "undefined" || !Array.isArray(quantityItems)) return [];
    return quantityItems.map(function(item) {
      const category = majorCategoryOf(item);
      const code = itemCodeOf(item);
      if (!category || !code) return null;
      return {
        type:"quantity",
        category:category,
        code:code,
        name:displayNameOf(item, code),
        order:orderOf(item),
        unit:normalize(value(item, ["単位","unit"])) || "個",
        source:item
      };
    }).filter(Boolean);
  }

  function allChoices() {
    return machineMasterChoices().concat(quantityMasterChoices());
  }

  function managedIdsForMachine(code) {
    const seen = new Set();
    const rows = [];

    /*
     * 現行アプリの照合優先順位と合わせる。
     * 状態シートの情報を先に採用し、軽量マスタは未登録IDの補欠だけにする。
     */
    const sources = [
      {type:"simple", rows:(typeof simpleItems !== "undefined" && Array.isArray(simpleItems)) ? simpleItems : []},
      {type:"individual", rows:(typeof individualItems !== "undefined" && Array.isArray(individualItems)) ? individualItems : []},
      {type:"rec", rows:(typeof recItems !== "undefined" && Array.isArray(recItems)) ? recItems : []},
      {type:"master", rows:(typeof managedMasterItems !== "undefined" && Array.isArray(managedMasterItems)) ? managedMasterItems : []}
    ];

    sources.forEach(function(source) {
      source.rows.forEach(function(item) {
        const itemCode = machineCodeOf(item);
        const managedId = managementIdOf(item);
        if (itemCode !== code || !managedId || seen.has(managedId)) return;

        seen.add(managedId);
        rows.push({
          managedId:managedId,
          status:normalize(value(item, ["状態","現在状態","最新状態","管理状態","status","currentStatus"])),
          location:normalize(value(item, ["拠点","現在拠点","location","currentLocation"])),
          managementType:source.type,
          sourceItem:item
        });
      });
    });

    rows.sort(function(a, b) {
      return a.managedId.localeCompare(b.managedId, "ja", {numeric:true});
    });
    return rows;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{margin:12px 0 18px;padding:0}
      #${ROOT_ID} .irregularMasterLead{margin:0 0 10px;font-size:13px;line-height:1.55;color:#64748b}
      #${ROOT_ID} .irregularMasterOpen{width:100%;min-height:58px;font-weight:800}
      #${ROOT_ID} .irregularMasterOpen small{display:block;margin-top:3px;font-size:12px;font-weight:600;opacity:.72}
      #${ROOT_ID} .irregularMasterPanel[hidden],#${ROOT_ID} .irregularMasterStep[hidden],#${ROOT_ID} .irregularMasterPending[hidden],#${ROOT_ID} .irregularMasterQueue[hidden]{display:none!important}
      #${ROOT_ID} .irregularMasterPanel{margin-top:12px;padding:12px;border:1px solid #d8dee6;border-radius:14px;background:#f8fafc}
      #${ROOT_ID} .irregularMasterTopline{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}
      #${ROOT_ID} .irregularMasterStepTitle{margin:0;font-size:16px;font-weight:800;color:#0f172a}
      #${ROOT_ID} .irregularMasterSelectedCategory{display:inline-flex;align-items:center;max-width:70%;min-height:28px;padding:5px 9px;border-radius:999px;background:#eaf2ff;color:#1d4ed8;font-size:12px;font-weight:800;line-height:1.2}
      #${ROOT_ID} .irregularMasterSelectedCategory:empty{display:none}
      #${ROOT_ID} .irregularMasterHint{margin:0 0 10px;font-size:12px;line-height:1.5;color:#64748b}
      #${ROOT_ID} .irregularMasterCategoryGrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:2px}
      #${ROOT_ID} .irregularMasterItemGrid{display:grid;grid-template-columns:1fr;gap:2px}
      #${ROOT_ID} .irregularMasterIdGrid{display:grid;grid-template-columns:1fr;gap:8px}
      #${ROOT_ID} [data-master-step="category"] .irregularMasterHint,#${ROOT_ID} [data-master-step="item"] .irregularMasterHint{margin-bottom:7px}
      #${ROOT_ID} .irregularMasterChoice{width:100%;min-height:52px;padding:10px 11px;text-align:left;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#0f172a;font-size:14px;font-weight:750;line-height:1.3}
      #${ROOT_ID} .irregularMasterCategoryGrid .irregularMasterChoice{min-height:43px;padding:4px 6px;text-align:center;font-size:13px}
      #${ROOT_ID} .irregularMasterItemGrid .irregularMasterChoice{min-height:43px;padding:6px 8px;font-size:14px}
      #${ROOT_ID} .irregularMasterChoice small{display:block;margin-top:3px;color:#64748b;font-size:11px;font-weight:600;line-height:1.35}
      #${ROOT_ID} .irregularMasterChoice.isSelected{border-color:#2563eb;background:#eff6ff;color:#1d4ed8;box-shadow:inset 0 0 0 1px #2563eb}
      #${ROOT_ID} .irregularMasterBack{width:100%;margin-top:10px}
      #${ROOT_ID} .irregularMasterPager{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:8px;margin:10px 0}
      #${ROOT_ID} .irregularMasterPager[hidden]{display:none!important}
      #${ROOT_ID} .irregularMasterPagerButton{min-height:42px;padding:8px 10px;border:1px solid #93c5fd;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-size:13px;font-weight:800}
      #${ROOT_ID} .irregularMasterPagerButton:disabled{border-color:#dbe3ee;background:#f8fafc;color:#94a3b8;opacity:1}
      #${ROOT_ID} .irregularMasterPagerInfo{min-width:78px;text-align:center;color:#64748b;font-size:11px;font-weight:700;line-height:1.35}
      #${ROOT_ID} .irregularMasterPagerInfo strong{display:block;color:#0f172a;font-size:12px}
      #${ROOT_ID} .irregularMasterNotice{margin:10px 0;padding:10px 11px;border-radius:10px;background:#fff7ed;color:#9a3412;font-size:12px;line-height:1.55}
      #${ROOT_ID} .irregularMasterPreviewBox{margin-top:10px;padding:10px;border:1px dashed #94a3b8;border-radius:11px;background:#fff}
      #${ROOT_ID} .irregularMasterPreviewBox strong{display:block;margin-bottom:5px;font-size:13px}
      #${ROOT_ID} .irregularMasterPreviewActions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
      #${ROOT_ID} .irregularMasterPreviewButton{min-height:48px;padding:8px;font-size:12px}
      #${ROOT_ID} .irregularMasterPending{margin-top:10px;padding:11px;border-radius:11px;background:#fff;border:1px solid #dbe3ee}
      #${ROOT_ID} .irregularMasterPendingTitle{margin:0 0 6px;font-size:13px;font-weight:800}
      #${ROOT_ID} .irregularMasterPendingMain{font-size:15px;font-weight:800;line-height:1.4}
      #${ROOT_ID} .irregularMasterPendingSub{margin-top:3px;font-size:12px;color:#64748b}
      #${ROOT_ID} .irregularMasterQuantityCheckout{margin-top:10px;padding:9px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff}
      #${ROOT_ID} .irregularMasterQuantityCheckout label{display:block;margin:0 0 5px;font-size:12px;font-weight:800}
      #${ROOT_ID} .irregularMasterQuantityCheckout select{width:100%;min-height:46px;padding:7px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;font-size:14px}
      #${ROOT_ID} .irregularMasterQuantityCheckoutStatus{margin-top:6px;font-size:11px;line-height:1.45;color:#64748b}
      #${ROOT_ID} .irregularMasterQuantityField{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;margin-top:10px}
      #${ROOT_ID} .irregularMasterQuantityField input{min-width:0;width:100%;min-height:48px;font-size:16px!important}
      #${ROOT_ID} .irregularMasterQuantityUnit{min-width:34px;text-align:left;font-weight:800}
      #${ROOT_ID} .irregularMasterAddButton{width:100%;min-height:52px;margin-top:10px;font-weight:800}
      #${ROOT_ID} .irregularMasterQueue{margin-top:14px;padding-top:12px;border-top:1px solid #d8dee6}
      #${ROOT_ID} .irregularMasterQueueHeader{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
      #${ROOT_ID} .irregularMasterQueueTitle{margin:0;font-size:15px;font-weight:800}
      #${ROOT_ID} .irregularMasterQueueCount{font-size:12px;font-weight:800;color:#2563eb}
      #${ROOT_ID} .irregularMasterQueueList{display:grid;gap:7px}
      #${ROOT_ID} .irregularMasterQueueRow{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:9px 10px;border:1px solid #dbe3ee;border-radius:10px;background:#fff}
      #${ROOT_ID} .irregularMasterQueueMain{min-width:0;font-size:13px;font-weight:800;line-height:1.35}
      #${ROOT_ID} .irregularMasterQueueSub{margin-top:2px;font-size:11px;color:#64748b}
      #${ROOT_ID} .irregularMasterRemove{min-width:46px;min-height:38px;padding:6px 8px;font-size:12px}
      #${ROOT_ID} .irregularMasterQueueActions{display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px}
      #${ROOT_ID} .irregularMasterNextItem,#${ROOT_ID} .irregularMasterBatchSend{width:100%;min-height:52px}
      #${ROOT_ID} .irregularMasterUiOnly{margin-top:7px;font-size:11px;line-height:1.45;color:#64748b;text-align:center}
      @media(max-width:390px){
        #${ROOT_ID} .irregularMasterPanel{padding:10px}
        #${ROOT_ID} .irregularMasterCategoryGrid{gap:2px}
        #${ROOT_ID} .irregularMasterCategoryGrid .irregularMasterChoice{min-height:42px;font-size:12px}
        #${ROOT_ID} .irregularMasterPager{gap:6px}
        #${ROOT_ID} .irregularMasterPagerButton{min-height:40px;padding:7px 8px;font-size:12px}
        #${ROOT_ID} .irregularMasterPagerInfo{min-width:70px;font-size:10px}
      }
    `;
    document.head.appendChild(style);
  }

  function root(){return document.getElementById(ROOT_ID)}
  function panel(){return document.getElementById("irregularMasterPickerPanel")}

  function showOnly(stepName) {
    document.querySelectorAll("#"+ROOT_ID+" .irregularMasterStep").forEach(function(el){
      el.hidden = el.dataset.masterStep !== stepName;
    });
  }

  function setCategoryBadge(text) {
    const badge = document.getElementById("irregularMasterSelectedCategory");
    if (badge) badge.textContent = text || "";
  }

  function notice(text) {
    const el = document.getElementById("irregularMasterNotice");
    if (!el) return;
    el.textContent = text || "";
    el.hidden = !text;
  }

  function makeChoice(label, sub, onClick, extraClass) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "irregularMasterChoice" + (extraClass ? " "+extraClass : "");
    button.textContent = label;
    if (sub) {
      const small = document.createElement("small");
      small.textContent = sub;
      button.appendChild(small);
    }
    button.addEventListener("click", onClick);
    return button;
  }

  function categorySort(a,b) {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return a.localeCompare(b,"ja");
  }

  function categoriesForUi() {
    const live = Array.from(new Set(allChoices().map(function(item){return item.category}).filter(Boolean)));
    return Array.from(new Set(CATEGORY_ORDER.concat(live))).sort(categorySort);
  }

  function hasLiveCategoryData() {
    return allChoices().some(function(item){return Boolean(item.category)});
  }

  function clearManagedSelection() {
    pickerState.pending = null;
    pickerState.selectedManaged = new Map();
    const pending = document.getElementById("irregularMasterPending");
    const addButton = document.getElementById("irregularMasterAddMachine");
    if (pending) pending.hidden = true;
    if (addButton) {
      addButton.textContent = "追加";
      addButton.dataset.managedIds = "[]";
    }
  }

  function renderCategories() {
    pickerState.category = "";
    pickerState.item = null;
    pickerState.managedRows = [];
    pickerState.managedPage = 0;
    clearManagedSelection();
    setCategoryBadge("");
    notice("");
    showOnly("category");

    const target = document.getElementById("irregularMasterCategoryGrid");
    if (!target) return;
    target.replaceChildren();

    categoriesForUi().forEach(function(category) {
      const count = allChoices().filter(function(item){return item.category === category}).length;
      target.appendChild(makeChoice(category, count ? count+"件" : "", function(){renderItems(category)}));
    });

    if (!hasLiveCategoryData()) {
      notice("大分類データがまだアプリへ届いていません。分類ボタンと画面遷移は実機確認できます。");
    }
  }

  function renderItems(category) {
    pickerState.category = category;
    pickerState.item = null;
    pickerState.managedRows = [];
    pickerState.managedPage = 0;
    clearManagedSelection();
    setCategoryBadge(category);
    notice("");
    showOnly("item");

    const target = document.getElementById("irregularMasterItemGrid");
    if (!target) return;
    target.replaceChildren();

    const choices = allChoices().filter(function(item){return item.category === category}).sort(function(a,b){
      return a.order-b.order || a.name.localeCompare(b.name,"ja",{numeric:true});
    });

    if (!choices.length) {
      notice("「"+category+"」の機種／品目データはまだ届いていません。");
      renderPreviewActions(target, category);
      return;
    }

    choices.forEach(function(item) {
      target.appendChild(makeChoice(
        item.name,
        item.code + (item.type === "quantity" ? " ／ 数量管理" : " ／ 個体管理"),
        function(){item.type === "quantity" ? renderQuantity(item) : renderManagedIds(item)}
      ));
    });
  }

  function renderPreviewActions(target, category) {
    const box = document.createElement("div");
    box.className = "irregularMasterPreviewBox";
    const title = document.createElement("strong");
    title.textContent = "開発版：画面構造の確認";
    box.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "irregularMasterPreviewActions";

    const machineButton = document.createElement("button");
    machineButton.type = "button";
    machineButton.className = "secondaryButton irregularMasterPreviewButton";
    machineButton.textContent = "個体管理UI";
    machineButton.addEventListener("click", function(){
      renderManagedIds({type:"machine",category:category,code:"UI-PREVIEW",name:"機種名（UI確認）",preview:true});
    });

    const quantityButton = document.createElement("button");
    quantityButton.type = "button";
    quantityButton.className = "secondaryButton irregularMasterPreviewButton";
    quantityButton.textContent = "数量管理UI";
    quantityButton.addEventListener("click", function(){
      renderQuantity({type:"quantity",category:category,code:"UI-PREVIEW",name:"品目名（UI確認）",unit:"個",preview:true});
    });

    actions.append(machineButton, quantityButton);
    box.appendChild(actions);
    target.appendChild(box);
  }

  function buildManagedPager(containerId, totalRows, totalPages, startIndex, endIndex) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.replaceChildren();
    container.hidden = totalPages <= 1;
    if (totalPages <= 1) return;

    const back = document.createElement("button");
    back.type = "button";
    back.className = "irregularMasterPagerButton";
    back.textContent = "← 戻る";
    back.disabled = pickerState.managedPage <= 0;
    back.addEventListener("click", function(){
      if (pickerState.managedPage <= 0) return;
      pickerState.managedPage -= 1;
      renderManagedIdPage(true);
    });

    const info = document.createElement("div");
    info.className = "irregularMasterPagerInfo";
    const strong = document.createElement("strong");
    strong.textContent = (pickerState.managedPage + 1) + " / " + totalPages + "ページ";
    const range = document.createElement("span");
    range.textContent = totalRows + "件中 " + (startIndex + 1) + "〜" + endIndex + "件";
    info.append(strong, range);

    const next = document.createElement("button");
    next.type = "button";
    next.className = "irregularMasterPagerButton";
    next.textContent = "次へ →";
    next.disabled = pickerState.managedPage >= totalPages - 1;
    next.addEventListener("click", function(){
      if (pickerState.managedPage >= totalPages - 1) return;
      pickerState.managedPage += 1;
      renderManagedIdPage(true);
    });

    container.append(back, info, next);
  }

  function renderManagedIdPage(scrollToTop) {
    const item = pickerState.item;
    const target = document.getElementById("irregularMasterIdGrid");
    if (!item || !target) return;

    const rows = Array.isArray(pickerState.managedRows) ? pickerState.managedRows : [];
    const totalPages = Math.max(1, Math.ceil(rows.length / MANAGED_PAGE_SIZE));
    if (pickerState.managedPage < 0) pickerState.managedPage = 0;
    if (pickerState.managedPage >= totalPages) pickerState.managedPage = totalPages - 1;

    const startIndex = pickerState.managedPage * MANAGED_PAGE_SIZE;
    const endIndex = Math.min(startIndex + MANAGED_PAGE_SIZE, rows.length);
    const pageRows = rows.slice(startIndex, endIndex);
    target.replaceChildren();

    pageRows.forEach(function(row) {
      const details = [row.location,row.status].filter(Boolean).join(" ／ ");
      const record = {
        type:"machine",
        category:item.category,
        code:item.code,
        name:item.name,
        managedId:row.managedId,
        currentState:row.status,
        currentLocation:row.location,
        managementType:row.managementType,
        preview:Boolean(item.preview)
      };
      const button = makeChoice(row.managedId, details || (item.preview ? "UI確認用・実データではありません" : ""), function(){
        toggleManagedSelection(record, button);
      });
      button.dataset.managedId = row.managedId;
      if (pickerState.selectedManaged.has(row.managedId)) button.classList.add("isSelected");
      target.appendChild(button);
    });

    buildManagedPager("irregularMasterPagerTop", rows.length, totalPages, startIndex, endIndex);
    buildManagedPager("irregularMasterPagerBottom", rows.length, totalPages, startIndex, endIndex);

    if (scrollToTop) {
      const topPager = document.getElementById("irregularMasterPagerTop");
      const anchor = topPager && !topPager.hidden ? topPager : document.getElementById("irregularMasterManagedTitle");
      if (anchor) anchor.scrollIntoView({behavior:"smooth",block:"start"});
    }
  }

  function renderManagedIds(item) {
    pickerState.item = item;
    clearManagedSelection();
    pickerState.managedPage = 0;
    setCategoryBadge(item.category);
    notice("");
    showOnly("managedId");

    const title = document.getElementById("irregularMasterManagedTitle");
    if (title) title.textContent = item.name;

    const rows = item.preview
      ? [1,2,3].map(function(index){
          return {managedId:"UI確認-"+String(index).padStart(4,"0"),status:"UI確認用",location:"",managementType:"preview"};
        })
      : managedIdsForMachine(item.code);

    pickerState.managedRows = rows;

    const target = document.getElementById("irregularMasterIdGrid");
    if (!target) return;
    target.replaceChildren();

    const topPager = document.getElementById("irregularMasterPagerTop");
    const bottomPager = document.getElementById("irregularMasterPagerBottom");
    if (topPager) { topPager.replaceChildren(); topPager.hidden = true; }
    if (bottomPager) { bottomPager.replaceChildren(); bottomPager.hidden = true; }

    if (!rows.length) {
      notice("この機種の管理番号候補を現在の初期データから取得できませんでした。直接入力を使用してください。");
      return;
    }

    renderManagedIdPage(false);
  }

  function toggleManagedSelection(record, button) {
    const id = record.managedId;
    if (pickerState.selectedManaged.has(id)) {
      pickerState.selectedManaged.delete(id);
      button.classList.remove("isSelected");
    } else {
      pickerState.selectedManaged.set(id, record);
      button.classList.add("isSelected");
    }
    updateManagedSelectionSummary();
  }

  function updateManagedSelectionSummary() {
    const records = Array.from(pickerState.selectedManaged.values());
    const pending = document.getElementById("irregularMasterPending");
    const main = document.getElementById("irregularMasterPendingMain");
    const sub = document.getElementById("irregularMasterPendingSub");
    const addButton = document.getElementById("irregularMasterAddMachine");

    if (!records.length) {
      if (pending) pending.hidden = true;
      if (addButton) {
        addButton.textContent = "追加";
        addButton.dataset.managedIds = "[]";
      }
      return;
    }

    pickerState.pending = records[0];
    if (main) main.textContent = records.length + "件選択中";
    if (sub) sub.textContent = records.length === 1
      ? records[0].managedId + " ／ " + records[0].name
      : records[0].name + " ／ 複数選択できます";
    if (addButton) {
      addButton.textContent = "選択した" + records.length + "件を追加";
      addButton.dataset.managedIds = JSON.stringify(records.map(function(record){return record.managedId}));
    }
    if (pending) pending.hidden = false;
  }

  function addPendingMachine() {
    const records = Array.from(pickerState.selectedManaged.values());
    if (!records.length) {
      alert("管理番号を選択してください");
      return;
    }

    const existingKeys = new Set(pickerState.queue.map(queueKey));
    let added = 0;
    records.forEach(function(record) {
      const key = queueKey(record);
      if (existingKeys.has(key)) return;
      pickerState.queue.push(Object.assign({}, record));
      existingKeys.add(key);
      added += 1;
    });

    if (!added) {
      alert("選択した管理番号はすでに追加済みです");
      return;
    }

    renderQueue();
    clearManagedSelection();
    pickerState.item = null;
    pickerState.managedRows = [];
    pickerState.managedPage = 0;
    renderCategories();
    const queue = document.getElementById("irregularMasterQueue");
    if (queue) queue.scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function formatCheckoutCandidate(candidate) {
    const date = new Date(candidate.timestamp);
    const dateText = isNaN(date.getTime())
      ? String(candidate.timestamp || "日時不明")
      : new Intl.DateTimeFormat("ja-JP", {
          month:"2-digit",
          day:"2-digit",
          hour:"2-digit",
          minute:"2-digit",
          hour12:false
        }).format(date);

    return (
      dateText + " ／ " +
      (candidate.user || "担当者不明") +
      " ／ 出庫" +
      candidate.originalQuantity +
      (candidate.unit || "個") +
      " ／ 取消可能" +
      candidate.remainingQuantity +
      (candidate.unit || "個")
    );
  }

  async function renderQuantity(item) {
    pickerState.item = item;
    pickerState.managedRows = [];
    pickerState.managedPage = 0;
    pickerState.quantityCheckoutCandidates = [];
    pickerState.selectedQuantityCheckout = null;
    clearManagedSelection();
    setCategoryBadge(item.category);
    notice("");
    showOnly("quantity");

    const name = document.getElementById("irregularMasterQuantityName");
    const sub = document.getElementById("irregularMasterQuantitySub");
    const input = document.getElementById("irregularMasterQuantityValue");
    const unit = document.getElementById("irregularMasterQuantityUnit");
    const addButton = document.getElementById("irregularMasterAddQuantity");
    const checkoutBox = document.getElementById("irregularMasterQuantityCheckout");
    const checkoutSelect = document.getElementById("irregularMasterQuantityCheckoutSelect");
    const checkoutStatus = document.getElementById("irregularMasterQuantityCheckoutStatus");
    const isCheckoutCancel =
      typeof wizardState !== "undefined" &&
      wizardState.mode === "出庫取消";

    if (name) name.textContent = item.name;
    if (sub) sub.textContent = item.code + (item.preview ? " ／ UI確認用" : " ／ 数量管理");
    if (input) {
      input.value = "";
      input.removeAttribute("max");
      input.placeholder = "数量";
      input.disabled = isCheckoutCancel;
    }
    if (unit) unit.textContent = item.unit || "個";
    if (addButton) addButton.disabled = isCheckoutCancel;
    if (checkoutBox) checkoutBox.hidden = !isCheckoutCancel;
    if (checkoutSelect) checkoutSelect.replaceChildren();

    if (!isCheckoutCancel) return;

    if (checkoutStatus) {
      checkoutStatus.textContent = "取消可能な出庫履歴を確認中...";
    }

    try {
      if (typeof window.getQuantityCheckoutCandidates !== "function") {
        throw new Error("出庫履歴取得機能を読み込めませんでした");
      }

      const candidates =
        await window.getQuantityCheckoutCandidates(
          item.code,
          wizardState.location
        );

      if (pickerState.item !== item) return;

      pickerState.quantityCheckoutCandidates = candidates;

      if (!candidates.length) {
        if (checkoutStatus) {
          checkoutStatus.textContent =
            "この品目・拠点には取消可能な出庫履歴がありません。";
        }
        return;
      }

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "取消対象の出庫履歴を選択";
      checkoutSelect.appendChild(placeholder);

      candidates.forEach(function(candidate) {
        const option = document.createElement("option");
        option.value = candidate.logId;
        option.textContent = formatCheckoutCandidate(candidate);
        checkoutSelect.appendChild(option);
      });

      if (checkoutStatus) {
        checkoutStatus.textContent =
          "どの出庫分を取り消すか選択してください。";
      }

      checkoutSelect.onchange = function() {
        const selected = candidates.find(function(candidate) {
          return candidate.logId === checkoutSelect.value;
        });

        pickerState.selectedQuantityCheckout = selected || null;
        input.value = "";
        input.disabled = !selected;
        addButton.disabled = !selected;

        if (selected) {
          input.max = String(selected.remainingQuantity);
          input.placeholder = "最大" + selected.remainingQuantity;
          checkoutStatus.textContent =
            formatCheckoutCandidate(selected);
          input.focus();
        }
      };
    } catch (error) {
      if (checkoutStatus) {
        checkoutStatus.textContent =
          "出庫履歴取得失敗：" +
          (error && error.message ? error.message : String(error));
      }
    }
  }

  function addPendingQuantity() {
    const item = pickerState.item;
    const input = document.getElementById("irregularMasterQuantityValue");
    const quantity = Number(input ? input.value : "");
    if (!item) return;
    if (!Number.isInteger(quantity) || quantity < 1) {
      alert("数量は1以上の整数で入力してください");
      if (input) input.focus();
      return;
    }

    const isCheckoutCancel =
      typeof wizardState !== "undefined" &&
      wizardState.mode === "出庫取消";

    const selectedCheckout =
      pickerState.selectedQuantityCheckout;

    if (isCheckoutCancel && !selectedCheckout) {
      alert("取消対象の出庫履歴を選択してください");
      return;
    }

    if (
      isCheckoutCancel &&
      quantity > Number(selectedCheckout.remainingQuantity || 0)
    ) {
      alert(
        "取消可能数は" +
        selectedCheckout.remainingQuantity +
        (selectedCheckout.unit || item.unit || "個") +
        "です"
      );
      return;
    }

    addQueueRecord({
      type:"quantity",
      category:item.category,
      code:item.code,
      name:item.name,
      quantity:quantity,
      unit:item.unit || "個",
      preview:Boolean(item.preview),
      sourceQuantityLogId:
        selectedCheckout ? selectedCheckout.logId : "",
      checkoutLabel:
        selectedCheckout
          ? formatCheckoutCandidate(selectedCheckout)
          : "",
      maxCancelableQuantity:
        selectedCheckout
          ? Number(selectedCheckout.remainingQuantity || 0)
          : 0
    });
  }

  function queueKey(record) {
    if (record.type === "machine") return "machine:"+record.managedId;
    return (
      "quantity:" +
      record.code +
      (
        record.sourceQuantityLogId
          ? ":" + record.sourceQuantityLogId
          : ""
      )
    );
  }

  function addQueueRecord(record) {
    const key = queueKey(record);
    const existingIndex = pickerState.queue.findIndex(function(item){return queueKey(item) === key});
    if (existingIndex !== -1) {
      if (record.type === "quantity") {
        const nextQuantity =
          pickerState.queue[existingIndex].quantity +
          record.quantity;

        if (
          record.maxCancelableQuantity > 0 &&
          nextQuantity > record.maxCancelableQuantity
        ) {
          alert(
            "この出庫履歴の取消可能数は" +
            record.maxCancelableQuantity +
            (record.unit || "個") +
            "です"
          );
          return;
        }

        pickerState.queue[existingIndex].quantity =
          nextQuantity;
      } else {
        alert("この管理番号はすでに追加済みです");
        return;
      }
    } else {
      pickerState.queue.push(Object.assign({}, record));
    }

    renderQueue();
    clearManagedSelection();
    pickerState.item = null;
    pickerState.managedRows = [];
    pickerState.managedPage = 0;
    renderCategories();
    const queue = document.getElementById("irregularMasterQueue");
    if (queue) queue.scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function removeQueueRecord(index) {
    pickerState.queue.splice(index,1);
    renderQueue();
  }

  function renderQueue() {
    const queue = document.getElementById("irregularMasterQueue");
    const list = document.getElementById("irregularMasterQueueList");
    const count = document.getElementById("irregularMasterQueueCount");
    if (!queue || !list || !count) return;

    queue.hidden = pickerState.queue.length === 0;
    count.textContent = pickerState.queue.length + "件";
    list.replaceChildren();

    pickerState.queue.forEach(function(record,index) {
      const row = document.createElement("div");
      row.className = "irregularMasterQueueRow";
      const body = document.createElement("div");
      const main = document.createElement("div");
      main.className = "irregularMasterQueueMain";
      main.textContent = record.type === "machine" ? record.managedId : record.name+" × "+record.quantity+(record.unit || "個");
      const sub = document.createElement("div");
      sub.className = "irregularMasterQueueSub";
      sub.textContent =
        record.category + " ／ " + record.name +
        (record.checkoutLabel
          ? " ／ " + record.checkoutLabel
          : "") +
        (record.preview ? " ／ UI確認用" : "");
      body.append(main,sub);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondaryButton irregularMasterRemove";
      remove.textContent = "削除";
      remove.addEventListener("click",function(){removeQueueRecord(index)});
      row.append(body,remove);
      list.appendChild(row);
    });
  }

  function openPicker() {
    const targetPanel = panel();
    if (!targetPanel) return;
    targetPanel.hidden = false;
    renderCategories();
    renderQueue();
    targetPanel.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function closePicker() {
    const targetPanel = panel();
    if (!targetPanel) return;
    targetPanel.hidden = true;
    pickerState.category = "";
    pickerState.item = null;
    pickerState.managedRows = [];
    pickerState.managedPage = 0;
    clearManagedSelection();
  }

  function resetPickerForNextItem() {
    renderCategories();
    const targetPanel = panel();
    if (targetPanel) targetPanel.scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function sendPickerBatch() {
    if (!pickerState.queue.length) {
      alert("送信する品目がありません");
      return;
    }

    if (
      typeof window.sendIrregularMasterPickerBatch !==
      "function"
    ) {
      alert(
        "送信機能の読み込みが完了していません。画面を再読み込みしてください。"
      );
      return;
    }

    const button =
      document.getElementById(
        "irregularMasterBatchSend"
      );

    let sendingTimer = null;

    if (button) {
      button.disabled = true;
      let dots = 0;
      const updateSendingText = function() {
        button.textContent =
          "送信中" + ".".repeat(dots);
        dots = (dots + 1) % 4;
      };
      updateSendingText();
      sendingTimer =
        setInterval(updateSendingText, 400);
    }

    try {
      const accepted =
        await window.sendIrregularMasterPickerBatch(
          pickerState.queue.map(function(record) {
            return Object.assign({}, record);
          })
        );

      if (accepted) {
        pickerState.queue = [];
        renderQueue();
        closePicker();
      }
    } catch (error) {
      alert(
        "送信処理を開始できませんでした\n" +
        (error && error.message
          ? error.message
          : String(error))
      );
    } finally {
      if (sendingTimer) {
        clearInterval(sendingTimer);
      }
      if (button) {
        button.disabled = false;
        button.textContent = "まとめて送信";
      }
    }
  }

  function injectUi() {
    if (root()) return;
    const irregularArea = document.getElementById("wizardIrregularArea");
    if (!irregularArea) return;

    const container = document.createElement("div");
    container.id = ROOT_ID;
    container.innerHTML = `
      <p class="irregularMasterLead">QRがない・読めない場合は、マスタから対象を選べます。既存の直接入力・番号不明もそのまま使用できます。</p>
      <button type="button" id="irregularMasterPickerOpenButton" class="choiceButton irregularMasterOpen">マスタから選ぶ<small>大分類 → 機種・品目 → 管理番号／数量</small></button>
      <div id="irregularMasterPickerPanel" class="irregularMasterPanel" hidden>
        <div class="irregularMasterTopline"><h4 class="irregularMasterStepTitle">マスタから選ぶ</h4><span id="irregularMasterSelectedCategory" class="irregularMasterSelectedCategory"></span></div>
        <div id="irregularMasterNotice" class="irregularMasterNotice" hidden></div>
        <section class="irregularMasterStep" data-master-step="category">
          <p class="irregularMasterHint">大分類を選んでください</p><div id="irregularMasterCategoryGrid" class="irregularMasterCategoryGrid"></div>
        </section>
        <section class="irregularMasterStep" data-master-step="item" hidden>
          <p class="irregularMasterHint">機種／品目を選んでください</p><div id="irregularMasterItemGrid" class="irregularMasterItemGrid"></div>
          <button type="button" id="irregularMasterBackToCategory" class="secondaryButton irregularMasterBack">← 大分類へ戻る</button>
        </section>
        <section class="irregularMasterStep" data-master-step="managedId" hidden>
          <p class="irregularMasterHint">管理番号を選んでください（複数選択可）</p>
          <div id="irregularMasterManagedTitle" class="irregularMasterPendingMain"></div>
          <div id="irregularMasterPagerTop" class="irregularMasterPager" hidden></div>
          <div id="irregularMasterIdGrid" class="irregularMasterIdGrid"></div>
          <div id="irregularMasterPagerBottom" class="irregularMasterPager" hidden></div>
          <div id="irregularMasterPending" class="irregularMasterPending" hidden>
            <div class="irregularMasterPendingTitle">選択中</div>
            <div id="irregularMasterPendingMain" class="irregularMasterPendingMain"></div>
            <div id="irregularMasterPendingSub" class="irregularMasterPendingSub"></div>
            <button type="button" id="irregularMasterAddMachine" class="nextButton irregularMasterAddButton" data-managed-ids="[]">追加</button>
          </div>
          <button type="button" id="irregularMasterBackToItemFromId" class="secondaryButton irregularMasterBack">← 機種一覧へ戻る</button>
        </section>
        <section class="irregularMasterStep" data-master-step="quantity" hidden>
          <p class="irregularMasterHint">数量を入力してください</p>
          <div class="irregularMasterPending">
            <div id="irregularMasterQuantityName" class="irregularMasterPendingMain"></div>
            <div id="irregularMasterQuantitySub" class="irregularMasterPendingSub"></div>
            <div id="irregularMasterQuantityCheckout" class="irregularMasterQuantityCheckout" hidden>
              <label for="irregularMasterQuantityCheckoutSelect">取消対象の出庫履歴</label>
              <select id="irregularMasterQuantityCheckoutSelect"></select>
              <div id="irregularMasterQuantityCheckoutStatus" class="irregularMasterQuantityCheckoutStatus"></div>
            </div>
            <div class="irregularMasterQuantityField"><input id="irregularMasterQuantityValue" type="number" inputmode="numeric" min="1" step="1" placeholder="数量"><span id="irregularMasterQuantityUnit" class="irregularMasterQuantityUnit">個</span></div>
            <button type="button" id="irregularMasterAddQuantity" class="nextButton irregularMasterAddButton">追加</button>
          </div>
          <button type="button" id="irregularMasterBackToItemFromQuantity" class="secondaryButton irregularMasterBack">← 品目一覧へ戻る</button>
        </section>
        <section id="irregularMasterQueue" class="irregularMasterQueue" hidden>
          <div class="irregularMasterQueueHeader"><h4 class="irregularMasterQueueTitle">追加済み一覧</h4><span id="irregularMasterQueueCount" class="irregularMasterQueueCount">0件</span></div>
          <div id="irregularMasterQueueList" class="irregularMasterQueueList"></div>
          <div class="irregularMasterQueueActions"><button type="button" id="irregularMasterNextItem" class="secondaryButton irregularMasterNextItem">次の商品を追加</button><button type="button" id="irregularMasterBatchSend" class="nextButton irregularMasterBatchSend">まとめて送信</button></div>
          <div class="irregularMasterUiOnly">通常QRと同じ送信・在庫確認・写真工程で処理します</div>
        </section>
        <button type="button" id="irregularMasterPickerCloseButton" class="secondaryButton irregularMasterBack">マスタ選択を閉じる</button>
      </div>`;

    const heading = irregularArea.querySelector("h3");
    if (heading && heading.nextSibling) irregularArea.insertBefore(container,heading.nextSibling);
    else irregularArea.prepend(container);

    document.getElementById("irregularMasterPickerOpenButton").addEventListener("click",openPicker);
    document.getElementById("irregularMasterPickerCloseButton").addEventListener("click",closePicker);
    document.getElementById("irregularMasterBackToCategory").addEventListener("click",renderCategories);
    document.getElementById("irregularMasterBackToItemFromId").addEventListener("click",function(){renderItems(pickerState.category)});
    document.getElementById("irregularMasterBackToItemFromQuantity").addEventListener("click",function(){renderItems(pickerState.category)});
    document.getElementById("irregularMasterAddMachine").addEventListener("click",addPendingMachine);
    document.getElementById("irregularMasterAddQuantity").addEventListener("click",addPendingQuantity);
    document.getElementById("irregularMasterNextItem").addEventListener("click",resetPickerForNextItem);
    document.getElementById("irregularMasterBatchSend").addEventListener("click",sendPickerBatch);
  }

  function watchIrregularArea() {
    const irregularArea = document.getElementById("wizardIrregularArea");
    if (!irregularArea) return;
    const observer = new MutationObserver(function(){
      if (irregularArea.hidden) {closePicker();return;}
      if (panel() && !panel().hidden) {renderCategories();renderQueue();}
    });
    observer.observe(irregularArea,{attributes:true,attributeFilter:["hidden"]});
  }

  function init(){injectStyle();injectUi();watchIrregularArea()}
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();