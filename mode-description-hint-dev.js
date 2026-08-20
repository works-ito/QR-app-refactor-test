/* 開発版：作業区分の長押し案内を見落としにくくする */
(function() {
  const STYLE_ID = "modeDescriptionHintDevStyle";

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #modeStep .modeLongPressGuide {
        display:flex;
        align-items:center;
        gap:8px;
        margin:7px 0 12px;
        padding:9px 10px;
        border:1px solid #c8ddfa;
        border-radius:11px;
        background:#eef6ff;
        color:#145aa8;
        font-size:13px;
        line-height:1.4;
        font-weight:800;
      }

      #modeStep .modeLongPressGuideIcon {
        flex:0 0 auto;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:24px;
        height:24px;
        border-radius:50%;
        background:#1677ff;
        color:#fff;
        font-size:14px;
        line-height:1;
      }

      #modeStep .modeLongPressGuide strong {
        font-weight:900;
      }

      @media (max-width:390px) and (max-height:700px) {
        #modeStep .modeLongPressGuide {
          margin:5px 0 8px;
          padding:7px 8px;
          gap:7px;
          font-size:12px;
          border-radius:10px;
        }

        #modeStep .modeLongPressGuideIcon {
          width:22px;
          height:22px;
          font-size:13px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function enhanceGuide() {
    const modeStep = document.getElementById("modeStep");
    if (!modeStep || modeStep.querySelector(".modeLongPressGuide")) return;

    const hint = modeStep.querySelector(".questionHint");
    if (!hint) return;

    hint.textContent = "今から行う作業を1つ選択します";

    const guide = document.createElement("div");
    guide.className = "modeLongPressGuide";
    guide.setAttribute("role", "note");
    guide.innerHTML = `
      <span class="modeLongPressGuideIcon" aria-hidden="true">i</span>
      <span>ボタン長押しで説明を確認できます</span>
    `;

    hint.insertAdjacentElement("afterend", guide);
  }

  function init() {
    injectStyle();
    enhanceGuide();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once:true});
  } else {
    init();
  }
})();
