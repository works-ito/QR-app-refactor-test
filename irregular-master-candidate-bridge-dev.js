/*
 * 開発版：イレギュラー受付の管理番号候補補完 v38
 *
 * 状態シートにまだ存在しない個体でも、managedMasterItems（個体マスタ由来）に
 * 登録されていれば「マスタから選ぶ」の管理番号候補へ出せるようにする。
 *
 * GAS・通常QR・送信処理は変更しない。
 * マスタ選択UIを操作する直前だけ、individualItemsへ未登録IDを補完する。
 */
(function() {
  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function getManagedId(item) {
    if (!item) return "";
    return normalizeText(
      item["管理ID"] ||
      item["管理番号"] ||
      item.managedId ||
      item.managementId ||
      ""
    );
  }

  function bridgeManagedMasterCandidates() {
    if (
      typeof managedMasterItems === "undefined" ||
      !Array.isArray(managedMasterItems) ||
      typeof individualItems === "undefined" ||
      !Array.isArray(individualItems)
    ) {
      return;
    }

    const existingIds = new Set();

    individualItems.forEach(function(item) {
      const id = getManagedId(item);
      if (id) existingIds.add(id);
    });

    managedMasterItems.forEach(function(item) {
      const id = getManagedId(item);
      if (!id || existingIds.has(id)) return;

      const fallback = Object.assign({}, item, {
        __irregularMasterFallback:true
      });

      individualItems.push(fallback);
      existingIds.add(id);
    });
  }

  /*
   * captureで先に補完してから、既存picker側のclick処理を動かす。
   * これにより通常の在庫読取フローには手を入れない。
   */
  document.addEventListener("click", function(event) {
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;

    const pickerTarget = target.closest(
      "#irregularMasterPickerOpenButton, #irregularMasterPickerDev"
    );

    if (!pickerTarget) return;

    bridgeManagedMasterCandidates();
  }, true);

  /* 開発確認用。コンソールから手動実行も可能。 */
  window.bridgeIrregularManagedMasterCandidates =
    bridgeManagedMasterCandidates;
})();
