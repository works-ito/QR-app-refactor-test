/*
 * 手動更新UI v95
 *
 * - 在庫データ表示の右側に［更新］ボタンを追加する。
 * - 通常時の件数表示は隠し、在庫キャッシュの updatedAt を
 *   yyyy/MM/dd HH:mm 形式で表示する。
 * - 表示中の「2分前」等の相対文字列から日時を推測しない。
 * - 更新ボタンはホーム画面追加版でも使えるよう、ページ全体を
 *   キャッシュバスター付きURLで再読込する。
 */
(function() {
  "use strict";

  const STATUS_ID = "inventoryDataStatus";
  const ROW_ID = "inventoryRefreshRowDev";
  const BUTTON_ID = "manualAppRefreshButtonDev";

  let renderingFromCache = false;

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatAbsoluteMinute(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";

    return (
      date.getFullYear() + "/" +
      pad2(date.getMonth() + 1) + "/" +
      pad2(date.getDate()) + " " +
      pad2(date.getHours()) + ":" +
      pad2(date.getMinutes())
    );
  }

  async function renderLatestCacheTimestamp(status) {
    if (!status || renderingFromCache) return;
    if (typeof restoreInventoryCache !== "function") return;

    const text = String(status.textContent || "").trim();

    /* 読込中・更新中・エラー表示はそのまま残す */
    if (
      text.indexOf("確認中") >= 0 ||
      text.indexOf("更新中") >= 0 ||
      text.indexOf("更新失敗") >= 0
    ) {
      return;
    }

    renderingFromCache = true;

    try {
      const cache = await restoreInventoryCache();
      const updatedAt = cache && cache.updatedAt
        ? formatAbsoluteMinute(cache.updatedAt)
        : "";

      if (updatedAt) {
        const nextText = "在庫データ：" + updatedAt;
        if (status.textContent !== nextText) {
          status.textContent = nextText;
        }
      }
    } catch (error) {
      console.warn("在庫データ更新時刻の表示に失敗しました", error);
    } finally {
      renderingFromCache = false;
    }
  }

  function runFullRefresh(button, status) {
    if (button.disabled) return;

    button.disabled = true;
    button.textContent = "更新中…";

    if (status) {
      status.textContent = "在庫データ：更新中…";
    }

    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("appRefresh", String(Date.now()));
    window.location.replace(url.toString());
  }

  function install() {
    const status = document.getElementById(STATUS_ID);
    if (!status) {
      setTimeout(install, 300);
      return;
    }

    if (document.getElementById(ROW_ID)) return;

    const row = document.createElement("div");
    row.id = ROW_ID;
    row.className = "inventoryRefreshRowDev";

    status.parentNode.insertBefore(row, status);
    row.appendChild(status);

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.className = "manualAppRefreshButtonDev";
    button.type = "button";
    button.textContent = "更新";
    button.addEventListener("click", function() {
      runFullRefresh(button, status);
    });
    row.appendChild(button);

    const style = document.createElement("style");
    style.textContent =
      ".inventoryRefreshRowDev{" +
        "display:flex;align-items:center;justify-content:space-between;" +
        "gap:8px;margin-bottom:8px;" +
      "}" +
      ".inventoryRefreshRowDev #inventoryDataStatus{" +
        "min-width:0;flex:1;margin:0;" +
      "}" +
      ".manualAppRefreshButtonDev{" +
        "flex:0 0 auto;min-width:62px;min-height:34px;padding:6px 11px;" +
        "border:1px solid #d9e0ea;border-radius:9px;background:#fff;" +
        "color:#475467;font-size:13px;font-weight:800;" +
      "}" +
      ".manualAppRefreshButtonDev:active{transform:translateY(1px);background:#f4f6f8;}" +
      ".manualAppRefreshButtonDev:disabled{opacity:.65;}";
    document.head.appendChild(style);

    void renderLatestCacheTimestamp(status);

    const observer = new MutationObserver(function() {
      void renderLatestCacheTimestamp(status);
    });
    observer.observe(status, {
      childList:true,
      characterData:true,
      subtree:true
    });

    console.info("開発版：手動更新UI v95 読込完了");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {once:true});
  } else {
    install();
  }
})();
