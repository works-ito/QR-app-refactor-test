/* 開発版：状態なし機械でマスタ索引を汚染しないための互換パッチ */
(function() {
  "use strict";

  const DYNAMIC_MASTER_KEYS = [
    "現在状態",
    "最新状態",
    "状態",
    "作業区分",
    "status",
    "現在拠点",
    "保管拠点",
    "location",
    "最終作業者"
  ];

  function sanitizeManagedMasterItem(item) {
    if (!item || typeof item !== "object") return item;

    DYNAMIC_MASTER_KEYS.forEach(function(key) {
      if (Object.prototype.hasOwnProperty.call(item, key)) {
        delete item[key];
      }
    });

    return item;
  }

  function sanitizeManagedMasterItems(items) {
    if (!Array.isArray(items)) return items;
    items.forEach(sanitizeManagedMasterItem);
    return items;
  }

  if (
    typeof IDBObjectStore !== "undefined" &&
    IDBObjectStore.prototype &&
    typeof IDBObjectStore.prototype.get === "function"
  ) {
    const originalGet = IDBObjectStore.prototype.get;

    IDBObjectStore.prototype.get = function() {
      const request = originalGet.apply(this, arguments);
      const storeName = String(this.name || "");

      if (storeName === "inventory" && request) {
        request.addEventListener(
          "success",
          function() {
            const cached = request.result;
            if (
              cached &&
              Array.isArray(cached.managedMasterItems)
            ) {
              sanitizeManagedMasterItems(cached.managedMasterItems);
            }
          },
          { once:true }
        );
      }

      return request;
    };

    if (typeof IDBObjectStore.prototype.put === "function") {
      const originalPut = IDBObjectStore.prototype.put;

      IDBObjectStore.prototype.put = function(value) {
        let valueToStore = value;

        if (
          String(this.name || "") === "inventory" &&
          value &&
          typeof value === "object" &&
          Array.isArray(value.managedMasterItems)
        ) {
          valueToStore = Object.assign({}, value, {
            managedMasterItems:
              value.managedMasterItems.map(function(item) {
                return sanitizeManagedMasterItem(Object.assign({}, item));
              })
          });
        }

        const args = Array.prototype.slice.call(arguments);
        args[0] = valueToStore;
        return originalPut.apply(this, args);
      };
    }
  }

  setTimeout(function() {
    if (
      typeof getLocalManagedItem !== "function" ||
      typeof normalizeLookupKey !== "function" ||
      typeof normalizeManagedIdKey !== "function"
    ) {
      console.warn("状態分離パッチ：app.jsの対象関数を確認できませんでした");
      return;
    }

    getLocalManagedItem = function(qrText, managementType) {
      const key = normalizeLookupKey(qrText);
      const managedKey = normalizeManagedIdKey(qrText);
      const normalizedType = String(managementType || "");
      const targetMap =
        normalizedType === "simple"
          ? simpleItemMap
          : normalizedType === "rec"
            ? recItemMap
            : individualItemMap;
      const targetItems =
        normalizedType === "simple"
          ? simpleItems
          : normalizedType === "rec"
            ? recItems
            : individualItems;

      const existing = targetMap.get(key) || targetMap.get(managedKey);
      if (existing) return existing;

      const masterItem =
        managedMasterItemMap.get(key) ||
        managedMasterItemMap.get(managedKey) ||
        null;

      if (!masterItem) return null;

      const stateItem = sanitizeManagedMasterItem(Object.assign({}, masterItem));
      targetItems.push(stateItem);

      if (key) targetMap.set(key, stateItem);
      if (managedKey) targetMap.set(managedKey, stateItem);

      return stateItem;
    };

    console.log("状態分離パッチ有効：マスタ索引と現在状態を分離しました");
  }, 0);
})();

/* 開発版：LINE内ブラウザ対策の途中作業復旧＋AI解析安定化 */
(function() {
  "use strict";

  const DRAFT_KEY = "qrInventoryWizardDraftV1";
  const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

  function byId(id) {
    return document.getElementById(id);
  }

  function inputValue(id) {
    const element = byId(id);
    return element ? String(element.value || "") : "";
  }

  function checkedValue(name) {
    const element = document.querySelector(
      'input[name="' + name + '"]:checked'
    );
    return element ? String(element.value || "") : "";
  }

  function cloneJsonSafe(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return null;
    }
  }

  function serializeScannedEntries() {
    if (typeof scannedEntries === "undefined" || !Array.isArray(scannedEntries)) {
      return [];
    }

    return scannedEntries.map(function(record) {
      const copy = Object.assign({}, record);
      delete copy.managedItem;
      delete copy.sourceItem;
      return copy;
    });
  }

  function getVisiblePostSendPhase() {
    const candidates = [
      ["wizardIrregularArea", "irregular"],
      ["wizardRecMemoArea", "recMemo"],
      ["wizardPhotoArea", "photo"],
      ["wizardPhotoTitleArea", "photoTitle"]
    ];

    for (let i = 0; i < candidates.length; i++) {
      const element = byId(candidates[i][0]);
      if (element && element.hidden === false) return candidates[i][1];
    }

    return "";
  }

  function draftHasMeaningfulWork(draft) {
    if (!draft) return false;
    if (Array.isArray(draft.scannedEntries) && draft.scannedEntries.length > 0) return true;
    if (draft.postSendPhase) return true;
    if (draft.irregularNumber || draft.irregularNote) return true;
    if (draft.returnMemo) return true;
    return false;
  }

  function saveDraftNow() {
    if (typeof wizardState === "undefined") return;

    const draft = {
      savedAt:Date.now(),
      wizardState:{
        receptionType:wizardState.receptionType || "",
        receptionLabel:wizardState.receptionLabel || "",
        mode:wizardState.mode || "",
        modeLabel:wizardState.modeLabel || "",
        location:wizardState.location || "",
        user:wizardState.user || "",
        recTarget:wizardState.recTarget || "",
        recDate:wizardState.recDate || "",
        previousLocation:wizardState.previousLocation || "",
        previousUser:wizardState.previousUser || "",
        hasPreviousSettings:Boolean(wizardState.hasPreviousSettings),
        usePreviousSettings:Boolean(wizardState.usePreviousSettings),
        lastInputStep:wizardState.lastInputStep || "user",
        currentStep:wizardState.currentStep || "reception"
      },
      scannedEntries:serializeScannedEntries(),
      returnMemoType:checkedValue("wizardReturnMemoType"),
      returnMemo:inputValue("wizardReturnMemoText"),
      irregularNumberType:checkedValue("wizardIrregularNumberType"),
      irregularSlipStatus:checkedValue("wizardIrregularSlipStatus"),
      irregularNumber:inputValue("wizardIrregularNumber"),
      irregularNote:inputValue("wizardIrregularNote"),
      irregularQuantity:inputValue("wizardIrregularQuantity"),
      recMemo:inputValue("wizardRecMemoText"),
      postSendPhase:getVisiblePostSendPhase(),
      postSendContext:
        typeof wizardPostSendContext !== "undefined"
          ? cloneJsonSafe(wizardPostSendContext)
          : null,
      hadSelectedPhotos:
        typeof wizardSelectedPhotos !== "undefined" &&
        Array.isArray(wizardSelectedPhotos) &&
        wizardSelectedPhotos.length > 0
    };

    try {
      if (draftHasMeaningfulWork(draft)) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch (error) {
      console.warn("途中作業の自動保存に失敗しました", error);
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch (error) {}
  }

  function restoreRadio(name, value) {
    if (!value) return;
    document
      .querySelectorAll('input[name="' + name + '"]')
      .forEach(function(radio) {
        radio.checked = radio.value === value;
      });
  }

  function restoreInput(id, value) {
    const element = byId(id);
    if (element && value !== undefined && value !== null) {
      element.value = String(value);
    }
  }

  function restoreDraft(draft) {
    if (!draft || typeof wizardState === "undefined") return;

    Object.assign(wizardState, draft.wizardState || {});

    if (Array.isArray(draft.scannedEntries)) {
      scannedEntries = draft.scannedEntries.slice();
    }

    restoreRadio("wizardReturnMemoType", draft.returnMemoType);
    restoreInput("wizardReturnMemoText", draft.returnMemo);
    restoreRadio("wizardIrregularNumberType", draft.irregularNumberType);
    restoreRadio("wizardIrregularSlipStatus", draft.irregularSlipStatus);
    restoreInput("wizardIrregularNumber", draft.irregularNumber);
    restoreInput("wizardIrregularNote", draft.irregularNote);
    restoreInput("wizardIrregularQuantity", draft.irregularQuantity);
    restoreInput("wizardRecMemoText", draft.recMemo);

    if (typeof updateWizardReturnMemoInput === "function") {
      updateWizardReturnMemoInput();
      restoreInput("wizardReturnMemoText", draft.returnMemo);
    }
    if (typeof updateWizardIrregularNumberType === "function") {
      updateWizardIrregularNumberType();
      restoreInput("wizardIrregularNumber", draft.irregularNumber);
    }
    if (typeof updateWizardIrregularSlipGuide === "function") {
      updateWizardIrregularSlipGuide();
    }

    const settings =
      typeof buildWizardSettings === "function"
        ? buildWizardSettings()
        : null;

    if (
      wizardState.currentStep === "complete" &&
      settings &&
      typeof renderCompleteSettings === "function"
    ) {
      renderCompleteSettings(settings);
      if (typeof syncWizardSettingsToLegacyFields === "function") {
        syncWizardSettingsToLegacyFields(settings);
      }
    }

    if (typeof showStep === "function") {
      showStep(wizardState.currentStep || "reception");
    }

    if (typeof renderScannerResults === "function") {
      renderScannerResults();
    }

    if (draft.postSendContext) {
      wizardPostSendContext = draft.postSendContext;
    }

    if (draft.postSendPhase) {
      const postArea = byId("wizardPostSendArea");
      if (postArea) postArea.hidden = false;

      [
        "wizardIrregularArea",
        "wizardRecMemoArea",
        "wizardPhotoArea",
        "wizardPhotoTitleArea"
      ].forEach(function(id) {
        const element = byId(id);
        if (element) element.hidden = true;
      });

      if (draft.postSendPhase === "irregular" && byId("wizardIrregularArea")) {
        byId("wizardIrregularArea").hidden = false;
      } else if (draft.postSendPhase === "recMemo" && byId("wizardRecMemoArea")) {
        byId("wizardRecMemoArea").hidden = false;
      } else if (
        (draft.postSendPhase === "photo" || draft.postSendPhase === "photoTitle") &&
        byId("wizardPhotoArea")
      ) {
        byId("wizardPhotoArea").hidden = false;
        wizardSelectedPhotos = [];
        wizardPendingPhotoSave = null;
        const preview = byId("wizardPhotoPreview");
        if (preview) {
          preview.innerText =
            "前回の作業を復元しました。\n写真だけもう一度選択してください。";
        }
      }
    }

    if (
      wizardState.currentStep === "complete" &&
      wizardState.receptionType === "normal" &&
      wizardState.mode !== "検品" &&
      typeof startScannerAfterInventoryReady === "function"
    ) {
      startScannerAfterInventoryReady();
    }

    console.log("途中作業を復元しました");
  }

  function offerDraftRestore() {
    let draft = null;

    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    } catch (error) {
      clearDraft();
      return;
    }

    if (!draft || !draftHasMeaningfulWork(draft)) {
      clearDraft();
      return;
    }

    if (Date.now() - Number(draft.savedAt || 0) > DRAFT_MAX_AGE_MS) {
      clearDraft();
      return;
    }

    const shouldRestore = window.confirm(
      "前回の入力途中データがあります。\n\n続きから再開しますか？"
    );

    if (shouldRestore) {
      restoreDraft(draft);
    } else {
      clearDraft();
    }
  }

  function installDraftAutosave() {
    ["input", "change", "click"].forEach(function(eventName) {
      document.addEventListener(
        eventName,
        function() {
          setTimeout(saveDraftNow, 0);
        },
        true
      );
    });

    document.addEventListener("visibilitychange", function() {
      if (document.visibilityState === "hidden") {
        saveDraftNow();
      }
    });

    window.addEventListener("pagehide", saveDraftNow);

    if (typeof renderScannerResults === "function") {
      const originalRenderScannerResults = renderScannerResults;
      renderScannerResults = function() {
        const result = originalRenderScannerResults.apply(this, arguments);
        setTimeout(saveDraftNow, 0);
        return result;
      };
    }
  }

  function installAiAnalysisRetry() {
    if (typeof analyzeWizardSlipPhoto !== "function") return;

    const originalAnalyzeWizardSlipPhoto = analyzeWizardSlipPhoto;

    analyzeWizardSlipPhoto = async function(file, photoType) {
      let result = await originalAnalyzeWizardSlipPhoto(file, photoType);

      if (result) return result;

      const preview = byId("wizardPhotoPreview");
      if (preview) {
        preview.innerText =
          "AI解析をもう一度試しています...\n写真保存は失敗しても続行できます。";
      }

      await new Promise(function(resolve) {
        setTimeout(resolve, 1600);
      });

      result = await originalAnalyzeWizardSlipPhoto(file, photoType);

      if (!result && preview) {
        preview.innerText =
          "AI解析はできませんでした。\n写真保存はこのまま続行します。";
      }

      return result;
    };

    console.log("AI伝票解析の追加再試行を有効にしました");
  }

  setTimeout(function() {
    installDraftAutosave();
    installAiAnalysisRetry();
    offerDraftRestore();
  }, 50);
})();
