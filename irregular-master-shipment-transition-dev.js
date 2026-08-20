/*
 * 開発版 v84：イレギュラー受付 → マスタ選択 → 出庫 の画面遷移を滑らかにする。
 *
 * v83では写真画面が開くまでマスタ選択カードを再表示していたため、
 * 送信完了後に一瞬だけ操作可能なマスタ画面が見えることがあった。
 *
 * v84ではマスタ画面を再表示せず、送信受理後〜写真画面表示までの短い間だけ
 * 「出庫写真画面を準備しています…」という非操作の遷移カードを表示する。
 * 写真画面が開いたら即座に消す。
 *
 * GAS送信・在庫登録・写真保存ロジックは変更しない。
 */
(function() {
  "use strict";

  if (window.__irregularMasterShipmentTransitionDevInstalled) return;
  window.__irregularMasterShipmentTransitionDevInstalled = true;

  const originalSend = window.sendIrregularMasterPickerBatch;

  if (typeof originalSend !== "function") {
    console.warn(
      "開発版：イレギュラーマスタ出庫遷移補強を読み込めませんでした"
    );
    return;
  }

  function isShipmentPhotoVisible() {
    const photoArea = document.getElementById("wizardPhotoArea");
    return Boolean(photoArea && photoArea.hidden === false);
  }

  function getTransitionCard() {
    let card = document.getElementById(
      "wizardIrregularShipmentTransition"
    );

    if (card) return card;

    const host = document.getElementById("wizardPostSendArea");
    if (!host) return null;

    card = document.createElement("div");
    card.id = "wizardIrregularShipmentTransition";
    card.hidden = true;
    card.setAttribute("aria-live", "polite");
    card.style.margin = "16px 0";
    card.style.padding = "22px 18px";
    card.style.border = "2px solid #b7d4ff";
    card.style.borderRadius = "18px";
    card.style.background = "#f4f8ff";
    card.style.color = "#153a6b";
    card.style.fontWeight = "700";
    card.style.textAlign = "center";
    card.style.fontSize = "1.05rem";
    card.innerText = "送信完了 ✔\n出庫写真画面を準備しています…";

    host.insertBefore(card, host.firstChild || null);
    return card;
  }

  function showTransitionCard() {
    const host = document.getElementById("wizardPostSendArea");
    const card = getTransitionCard();
    if (host) host.hidden = false;
    if (card) card.hidden = false;
  }

  function hideTransitionCard() {
    const card = document.getElementById(
      "wizardIrregularShipmentTransition"
    );
    if (card) card.hidden = true;
  }

  window.sendIrregularMasterPickerBatch = async function(records) {
    if (
      wizardState.receptionType !== "irregular" ||
      wizardState.mode !== "出庫"
    ) {
      return await originalSend(records);
    }

    const irregularArea = document.getElementById("wizardIrregularArea");
    const photoArea = document.getElementById("wizardPhotoArea");
    let observer = null;

    if (irregularArea || photoArea) {
      observer = new MutationObserver(function() {
        if (isShipmentPhotoVisible()) {
          hideTransitionCard();
          return;
        }

        /*
         * v81が送信受理後にマスタカードを閉じた瞬間から、
         * 写真画面が開くまでだけ遷移カードを出す。
         * マスタ画面自体は再表示しない。
         */
        if (irregularArea && irregularArea.hidden) {
          showTransitionCard();
        }
      });

      if (irregularArea) {
        observer.observe(irregularArea, {
          attributes:true,
          attributeFilter:["hidden"]
        });
      }

      if (photoArea) {
        observer.observe(photoArea, {
          attributes:true,
          attributeFilter:["hidden"]
        });
      }
    }

    try {
      return await originalSend(records);
    } finally {
      if (observer) observer.disconnect();
      hideTransitionCard();
    }
  };

  console.info(
    "開発版：イレギュラーマスタ出庫遷移補強 v84 読込完了"
  );
})();
