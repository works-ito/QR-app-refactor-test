/*
 * 数量管理品：拠点移動 送信補強 v91
 *
 * 目的：
 * - 数量管理品の拠点移動では、送信直前のpayloadを必ず
 *   mode=拠点移動 / location=受入先 / sourceLocation=移動元 に固定する。
 * - v90のように「prepared側のmodeが既に拠点移動であること」を前提にしない。
 * - 必須値が欠けている場合はGASへ送信せず、その場で明示エラーにする。
 * - 正常成功時は旧マスタ選択パネルを再露出させない。
 *
 * GASは変更しない。
 */
(function() {
  "use strict";

  function normalize(value) {
    return String(value == null ? "" : value).trim();
  }

  function isTransferContext() {
    try {
      return (
        typeof wizardState !== "undefined" &&
        normalize(wizardState.mode) === "拠点移動"
      );
    } catch (error) {
      return false;
    }
  }

  function currentDestination() {
    try {
      return normalize(wizardState.location);
    } catch (error) {
      return "";
    }
  }

  function currentUser() {
    try {
      return normalize(wizardState.user);
    } catch (error) {
      return "";
    }
  }

  function patchPreparedBatchRecords() {
    if (typeof getWizardPreparedBatchRecords !== "function") return false;
    if (getWizardPreparedBatchRecords.__quantityTransferSendFixV91) return true;

    const original = getWizardPreparedBatchRecords;

    const patched = function() {
      const prepared = original.apply(this, arguments);
      if (!Array.isArray(prepared)) return prepared;

      const transferContext = isTransferContext();
      const destination = currentDestination();
      const worker = currentUser();

      prepared.forEach(function(data, index) {
        if (!data || normalize(data.recordType) !== "quantity") return;

        let live = null;
        try {
          live = Array.isArray(scannedEntries) ? scannedEntries[index] : null;
        } catch (error) {}

        const shouldForceTransfer =
          transferContext ||
          normalize(data.mode) === "拠点移動" ||
          normalize(live && live.mode) === "拠点移動";

        if (!shouldForceTransfer) {
          if (live && live.sourceLocation) {
            data.sourceLocation = normalize(live.sourceLocation);
          }
          return;
        }

        const source = normalize(
          data.sourceLocation ||
          (live && live.sourceLocation)
        );

        const target = normalize(
          destination ||
          data.location ||
          (live && live.location)
        );

        if (!target) {
          throw new Error(
            (data.itemCode || data.qr || "数量管理品") +
            "の受入先拠点が送信データにありません"
          );
        }

        if (!source) {
          throw new Error(
            (data.itemCode || data.qr || "数量管理品") +
            "の移動元拠点が送信データにありません"
          );
        }

        if (source === target) {
          throw new Error(
            "移動元と受入先は別の拠点を指定してください"
          );
        }

        /*
         * ここがv91の本体。
         * 元のpreparedレコードのmodeが空・別値でも、
         * 現在のウィザードが拠点移動なら送信値を正規化する。
         */
        data.mode = "拠点移動";
        data.location = target;
        data.sourceLocation = source;

        if (worker) {
          data.user = worker;
        }

        if (live) {
          live.mode = "拠点移動";
          live.location = target;
          live.sourceLocation = source;
          if (worker) live.user = worker;
        }

        console.info(
          "v91 数量拠点移動 payload確認",
          {
            itemCode:data.itemCode || data.qr || "",
            mode:data.mode,
            location:data.location,
            sourceLocation:data.sourceLocation,
            quantity:data.quantity
          }
        );
      });

      return prepared;
    };

    patched.__quantityTransferSendFixV91 = true;
    patched.__original = original;

    getWizardPreparedBatchRecords = patched;
    window.getWizardPreparedBatchRecords = patched;
    return true;
  }

  function closeTransferPickerAfterSuccess() {
    const panel = document.getElementById("irregularMasterPickerPanel");
    if (panel) panel.hidden = true;

    const root = document.getElementById("irregularMasterPickerDev");
    if (root) {
      root.querySelectorAll(".irregularMasterStep").forEach(function(step) {
        step.hidden = true;
      });
    }
  }

  function patchIrregularTransferCompletion() {
    if (typeof window.sendIrregularMasterPickerBatch !== "function") return false;
    if (window.sendIrregularMasterPickerBatch.__quantityTransferCompletionV91) return true;

    const original = window.sendIrregularMasterPickerBatch;

    const patched = async function(records) {
      const isTransfer =
        isTransferContext() &&
        typeof wizardState !== "undefined" &&
        wizardState.receptionType === "irregular";

      if (isTransfer) {
        const destination = currentDestination();

        if (!destination) {
          throw new Error("受入先拠点が選択されていません");
        }

        if (!Array.isArray(records) || !records.length) {
          throw new Error("送信する品目がありません");
        }

        records.forEach(function(record) {
          if (!record || normalize(record.type) !== "quantity") return;

          const source = normalize(record.sourceLocation);
          const quantity = Number(record.quantity || 0);
          const itemCode = normalize(record.code || record.itemCode);

          if (!source) {
            throw new Error(
              (itemCode || "数量管理品") +
              "の移動元拠点がありません"
            );
          }

          if (source === destination) {
            throw new Error("移動元と受入先は別の拠点を指定してください");
          }

          if (!Number.isInteger(quantity) || quantity < 1) {
            throw new Error(
              (itemCode || "数量管理品") +
              "の数量は1以上の整数で指定してください"
            );
          }
        });
      }

      const accepted = await original.apply(this, arguments);

      if (isTransfer && accepted) {
        let hasRemaining = false;
        try {
          hasRemaining = Array.isArray(scannedEntries) && scannedEntries.length > 0;
        } catch (error) {}

        if (!hasRemaining) {
          closeTransferPickerAfterSuccess();
        }
      }

      return accepted;
    };

    patched.__quantityTransferCompletionV91 = true;
    patched.__original = original;
    window.sendIrregularMasterPickerBatch = patched;
    return true;
  }

  function install() {
    if (!patchPreparedBatchRecords()) {
      setTimeout(patchPreparedBatchRecords, 300);
      setTimeout(patchPreparedBatchRecords, 1000);
    }

    if (!patchIrregularTransferCompletion()) {
      setTimeout(patchIrregularTransferCompletion, 300);
      setTimeout(patchIrregularTransferCompletion, 1000);
    }

    console.info("開発版：数量管理品 拠点移動送信補強 v91 読込完了");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {once:true});
  } else {
    install();
  }
})();
