/* 開発版 v62：イレギュラー受付 大分類UIの可読性調整 */
(function() {
  "use strict";

  const ROOT_ID = "irregularMasterPickerDev";
  const STYLE_ID = "irregularCategoryUiTuningV55";

  const DISPLAY_LABELS = {
    "ハウス関連商品": "ハウス関連",
    "トランシーバー関連商品": "トランシーバー関連"
  };

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* ボタンの大きさは変えず、縦方向の間隔だけを圧縮する */
      #${ROOT_ID} .irregularMasterCategoryGrid,
      #${ROOT_ID} .irregularMasterItemGrid {
        row-gap: 3px !important;
        column-gap: 4px !important;
      }
      #${ROOT_ID} .irregularMasterCategoryGrid .irregularMasterChoice,
      #${ROOT_ID} .irregularMasterItemGrid .irregularMasterChoice {
        margin-top: 0 !important;
        margin-bottom: 0 !important;
      }

      #${ROOT_ID} .irregularMasterCategoryGrid .irregularMasterChoice {
        font-size: 14px !important;
        font-weight: 800 !important;
        line-height: 1.28 !important;
      }
      #${ROOT_ID} .irregularMasterCategoryGrid .irregularMasterChoice small {
        font-size: 11px !important;
        font-weight: 600 !important;
        line-height: 1.3 !important;
      }
      @media (max-width:390px) {
        #${ROOT_ID} .irregularMasterCategoryGrid .irregularMasterChoice {
          font-size: 13px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function tuneLabels() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    root.querySelectorAll(".irregularMasterCategoryGrid .irregularMasterChoice").forEach(function(button) {
      Array.from(button.childNodes).forEach(function(node) {
        if (node.nodeType !== Node.TEXT_NODE) return;
        const original = String(node.nodeValue || "").trim();
        if (!DISPLAY_LABELS[original]) return;
        node.nodeValue = DISPLAY_LABELS[original];
      });
    });
  }

  injectStyle();
  tuneLabels();

  const observer = new MutationObserver(function() {
    tuneLabels();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.info("開発版 v62：大分類名短縮 + 分類名文字サイズ拡大 有効");
})();
