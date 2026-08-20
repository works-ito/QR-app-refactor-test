/* 開発版 v40：イレギュラー受付マスタ選択の一覧密度・画面遷移位置調整 */
(function() {
  const STYLE_ID = "irregularMasterLayoutDevStyle";
  const ROOT_ID = "irregularMasterPickerDev";

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* 管理番号はSE(375px)でも2列。画面幅に追従して均等配置 */
      #${ROOT_ID} .irregularMasterIdGrid {
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 1fr));
        gap:8px;
      }

      #${ROOT_ID} .irregularMasterIdGrid .irregularMasterChoice {
        min-width:0;
        min-height:48px;
        padding:9px 8px;
        text-align:center;
        font-size:13px;
        overflow-wrap:anywhere;
      }

      /* 6.1インチ級では余白を少し広げるが、列数は2列のまま */
      @media (min-width:400px) {
        #${ROOT_ID} .irregularMasterIdGrid {
          gap:9px;
        }
        #${ROOT_ID} .irregularMasterIdGrid .irregularMasterChoice {
          min-height:50px;
          padding:10px 9px;
          font-size:13.5px;
        }
      }

      /* SE最優先。押しやすさを残したまま縦方向を圧縮 */
      @media (max-width:390px) {
        #${ROOT_ID} .irregularMasterIdGrid {
          gap:7px;
        }
        #${ROOT_ID} .irregularMasterIdGrid .irregularMasterChoice {
          min-height:46px;
          padding:8px 6px;
          font-size:12.5px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function scrollMasterTop() {
    const panel = document.getElementById("irregularMasterPickerPanel");
    if (!panel || panel.hidden) return;

    window.setTimeout(function() {
      panel.scrollIntoView({
        behavior:"smooth",
        block:"start"
      });
    }, 40);
  }

  function bindNavigationScroll() {
    const ids = [
      "irregularMasterBackToCategory",
      "irregularMasterBackToItemFromId",
      "irregularMasterBackToItemFromQuantity",
      "irregularMasterNextItem"
    ];

    ids.forEach(function(id) {
      const button = document.getElementById(id);
      if (!button || button.dataset.masterScrollBound === "1") return;
      button.dataset.masterScrollBound = "1";
      button.addEventListener("click", scrollMasterTop);
    });
  }

  function bindForwardNavigationScroll() {
    const root = document.getElementById(ROOT_ID);
    if (!root || root.dataset.masterForwardScrollBound === "1") return;

    root.dataset.masterForwardScrollBound = "1";

    root.addEventListener("click", function(event) {
      const button = event.target.closest(".irregularMasterChoice");
      if (!button || !root.contains(button)) return;

      /*
       * 大分類 → 機種／品目、機種／品目 → 管理番号／数量へ
       * 進んだときは、必ずマスタ選択パネル上部へ戻す。
       *
       * 管理番号そのものを選択したときは、直下の「追加」を
       * 押しやすくするためスクロールさせない。
       */
      if (
        button.closest(".irregularMasterCategoryGrid") ||
        button.closest(".irregularMasterItemGrid")
      ) {
        scrollMasterTop();
      }
    });
  }

  function init() {
    injectStyle();
    bindNavigationScroll();
    bindForwardNavigationScroll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once:true});
  } else {
    init();
  }
})();
