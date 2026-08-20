/*
 * イレギュラー受付入口簡素化 v72
 *
 * 目的:
 * - 旧「番号を入力する / 番号が読めない」の選択UIを現場画面から外す。
 * - 通常は「マスタから選ぶ」を主経路にする。
 * - 本当に対象を特定できない場合だけ「対象を特定できない」を表示する。
 * - 既存GAS / buildWizardIrregularRecord() との互換性のため、旧radio/input自体はDOMに残す。
 *
 * 旧DOMを削除せず非表示化するため、既存送信ロジックには触れない。
 */
(function() {
  "use strict";

  const ROOT_ID = "irregularEntrySimplifyDev";

  function getArea() {
    return document.getElementById("wizardIrregularArea");
  }

  function getNumberTypeGrid(area) {
    if (!area) return null;
    const radio = area.querySelector('input[name="wizardIrregularNumberType"]');
    return radio ? radio.closest(".wizardRadioGrid") : null;
  }

  function getSlipGrid(area) {
    if (!area) return null;
    const radio = area.querySelector('input[name="wizardIrregularSlipStatus"]');
    return radio ? radio.closest(".wizardRadioGrid") : null;
  }

  function getLabelFor(id, area) {
    return area ? area.querySelector('label[for="' + id + '"]') : null;
  }

  function getLegacyDetailNodes(area) {
    if (!area) return [];

    const note = document.getElementById("wizardIrregularNote");
    const emphasis = note ? note.previousElementSibling : null;

    return [
      getSlipGrid(area),
      document.getElementById("wizardIrregularSlipGuide"),
      getLabelFor("wizardIrregularNote", area),
      emphasis && emphasis.classList && emphasis.classList.contains("irregularNoteEmphasis")
        ? emphasis
        : null,
      note,
      document.getElementById("wizardIrregularQuantityBox"),
      document.getElementById("wizardIrregularCheckResult"),
      document.getElementById("wizardConfirmIrregularButton")
    ].filter(Boolean);
  }

  function setLegacyDetailsVisible(visible) {
    const area = getArea();
    getLegacyDetailNodes(area).forEach(function(node) {
      node.hidden = !visible;
    });
  }

  function setNumberType(value) {
    const radio = document.querySelector(
      'input[name="wizardIrregularNumberType"][value="' + value + '"]'
    );
    if (!radio) return;

    radio.checked = true;
    radio.dispatchEvent(new Event("change", {bubbles:true}));
  }

  function closeMasterPickerIfOpen() {
    const closeButton = document.getElementById("irregularMasterPickerCloseButton");
    const panel = document.getElementById("irregularMasterPickerPanel");

    if (closeButton && panel && !panel.hidden) {
      closeButton.click();
    }
  }

  function enterUnknownMode() {
    setNumberType("番号不明");
    closeMasterPickerIfOpen();
    setLegacyDetailsVisible(true);

    const button = document.getElementById("irregularUnknownEntryButton");
    const hint = document.getElementById("irregularEntrySimplifyHint");

    if (button) button.hidden = true;
    if (hint) {
      hint.innerText =
        "対象を特定できない受付です。伝票の有無と状況・理由を入力してください。";
    }

    const note = document.getElementById("wizardIrregularNote");
    if (note) {
      setTimeout(function() {
        note.scrollIntoView({behavior:"smooth", block:"center"});
        note.focus();
      }, 100);
    }
  }

  function resetToMasterMode() {
    setNumberType("入力");
    setLegacyDetailsVisible(false);

    const button = document.getElementById("irregularUnknownEntryButton");
    const hint = document.getElementById("irregularEntrySimplifyHint");

    if (button) button.hidden = false;
    if (hint) {
      hint.innerText =
        "対象が分かる場合は上の「マスタから選ぶ」を使用してください。";
    }
  }

  function injectUi() {
    const area = getArea();
    if (!area || document.getElementById(ROOT_ID)) return;

    const numberGrid = getNumberTypeGrid(area);
    const numberLabel = getLabelFor("wizardIrregularNumber", area);
    const numberInput = document.getElementById("wizardIrregularNumber");

    /*
     * 内部互換のためDOMは残すが、現場UIからは完全に隠す。
     */
    if (numberGrid) numberGrid.hidden = true;
    if (numberLabel) numberLabel.hidden = true;
    if (numberInput) numberInput.hidden = true;

    const box = document.createElement("div");
    box.id = ROOT_ID;
    box.style.margin = "12px 0 4px";
    box.innerHTML =
      '<div id="irregularEntrySimplifyHint" class="wizardPostSummary" style="margin-bottom:8px">' +
        '対象が分かる場合は上の「マスタから選ぶ」を使用してください。' +
      '</div>' +
      '<button type="button" id="irregularUnknownEntryButton" class="secondaryButton" style="width:100%">' +
        '対象を特定できない' +
      '</button>';

    const picker = document.getElementById("irregularMasterPickerDev");
    if (picker && picker.parentElement === area) {
      picker.insertAdjacentElement("afterend", box);
    } else if (numberGrid && numberGrid.parentElement === area) {
      area.insertBefore(box, numberGrid);
    } else {
      const heading = area.querySelector("h3");
      if (heading) heading.insertAdjacentElement("afterend", box);
      else area.prepend(box);
    }

    document.getElementById("irregularUnknownEntryButton")
      .addEventListener("click", enterUnknownMode);

    resetToMasterMode();
  }

  function observeOpenState() {
    const area = getArea();
    if (!area || area.dataset.irregularSimplifyObserved === "true") return;

    area.dataset.irregularSimplifyObserved = "true";

    const observer = new MutationObserver(function() {
      if (!area.hidden) {
        /*
         * 既存 openWizardIrregularArea() は旧入力radioを初期化する。
         * その直後に表示だけ新仕様へ戻す。
         */
        setTimeout(resetToMasterMode, 0);
      }
    });

    observer.observe(area, {
      attributes:true,
      attributeFilter:["hidden"]
    });
  }

  function init() {
    injectUi();
    observeOpenState();
  }

  init();

  console.info(
    "開発版：イレギュラー受付入口簡素化 v72 読込完了"
  );
})();
