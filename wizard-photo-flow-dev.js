/*
 * 共通写真画面フロー v1
 *
 * 責務：
 * - context と表示オプションを受け取り、共通の写真添付画面を初期化する。
 * - 写真選択、AI解析、保存、GAS通信は担当しない。
 * - 既存の送信処理や post-send 分岐は上書きしない。
 */
(function() {
  "use strict";

  function normalizeOptions(context, options) {
    const settings = options || {};
    const isIrregular = Boolean(context && context.isIrregular);
    const irregularRecord =
      context && context.irregularRecord
        ? context.irregularRecord
        : null;

    const defaultHeading = isIrregular
      ? "イレギュラー受付写真"
      : context && context.mode === "出庫"
        ? "出庫写真の添付"
        : "返却写真の添付";

    let defaultSummary = "";

    if (isIrregular && irregularRecord) {
      defaultSummary =
        (irregularRecord.slipStatus === "伝票あり"
          ? "1枚目は伝票写真を選択してください。"
          : "機械全体・管理番号・QRラベル・状態が分かる写真を選択してください。") +
        "\n写真は1枚以上必須・最大6枚です。";
    } else if (context) {
      defaultSummary =
        String(context.mode || "") +
        "送信完了：" +
        (Array.isArray(context.records) ? context.records.length : 0) +
        "件\n送信ID：" +
        String(context.sendId || "");
    }

    return {
      heading:
        typeof settings.heading === "string"
          ? settings.heading
          : defaultHeading,
      summary:
        typeof settings.summary === "string"
          ? settings.summary
          : defaultSummary,
      preview:
        typeof settings.preview === "string"
          ? settings.preview
          : isIrregular
            ? "写真はまだ選択されていません。"
            : "写真はまだ選択されていません。最大6枚まで追加できます。",
      skipAllowed:
        typeof settings.skipAllowed === "boolean"
          ? settings.skipAllowed
          : !isIrregular
    };
  }

  function open(context, options) {
    if (!context) {
      throw new Error("写真画面contextがありません");
    }

    const settings = normalizeOptions(context, options);
    const heading = document.getElementById("wizardPhotoHeading");
    const summary = document.getElementById("wizardPhotoSummary");
    const preview = document.getElementById("wizardPhotoPreview");
    const saveButton = document.getElementById("wizardSavePhotosButton");
    const skipButton = document.getElementById("wizardSkipPhotosButton");
    const photoArea = document.getElementById("wizardPhotoArea");

    if (!heading || !summary || !preview || !saveButton || !skipButton || !photoArea) {
      throw new Error("写真画面UIを初期化できません");
    }

    heading.innerText = settings.heading;
    summary.innerText = settings.summary;
    preview.innerText = settings.preview;
    saveButton.hidden = true;
    skipButton.hidden = !settings.skipAllowed;
    photoArea.hidden = false;

    if (typeof window.scrollToWizardPostSend === "function") {
      window.scrollToWizardPostSend("wizardPhotoArea");
    } else {
      setTimeout(function() {
        photoArea.scrollIntoView({
          behavior:"smooth",
          block:"start"
        });
      }, 120);
    }
  }

  window.wizardPhotoFlow = {
    open: open
  };

  console.info("開発版：共通写真画面フロー v1 読込完了");
})();
