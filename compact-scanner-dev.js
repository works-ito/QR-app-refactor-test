/* 開発版 v53：10:9カメラを画面幅へふんわり追従 */
(function() {
  "use strict";

  /*
   * iPhone SE 375px幅ではv52とほぼ同じ大きさを維持。
   * 画面幅が広い端末ではカメラだけ少しずつ広げ、最大430pxで止める。
   * 常に画面中央配置。読取ロジック・ズーム・入力解像度は変更しない。
   */
  const style = document.createElement("style");
  style.id = "compactScannerV53Style";
  style.textContent = `
    .scannerViewport {
      width: clamp(351px, 94vw, 430px) !important;
      max-width: none !important;
      left: 50%;
      transform: translateX(-50%);
      margin-left: 0 !important;
      margin-right: 0 !important;
    }

    .scannerVideo {
      aspect-ratio: 10 / 9 !important;
      object-fit: cover !important;
    }

    .scannerFrame {
      left: 30% !important;
      top: 27.5% !important;
      width: 40% !important;
      height: 45% !important;
      border-width: 3px !important;
      border-radius: 12px !important;
    }

    @media (max-width: 374px) {
      .scannerViewport {
        width: calc(100vw - 18px) !important;
      }
    }
  `;
  document.head.appendChild(style);

  console.info("開発版 v53：10:9カメラ幅レスポンシブ + ガイド40% 有効");
})();
