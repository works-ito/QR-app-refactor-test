# QR在庫管理 リファクタリング設計書

## 0. 基準

- 対象リポジトリ: `works-ito/QR-app-refactor-test`
- Clean baseline: `d7a18ca9cafdc92b5d7728989f4e7fb6d35b1724`
- 基準コミット: `Reset refactor test to QR-app-development main`
- このbaselineはGitHub Pagesで実機確認済み。起動から在庫データ取得完了まで正常。
- 本設計書はコード変更前の「整頓・総点検」結果を記録する。

## 1. 最重要ルール

1. `QR-app-ver.2`（本番 ver.2.1）は触らない。
2. `QR-app-development` は触らない。
3. 作業対象は `QR-app-refactor-test` のみ。
4. Clean baselineの正常動作を絶対基準とする。
5. まず現行動作を維持する。コード量削減より「1機能1処理経路」を優先する。
6. 1機能変更 → commit → Pages反映 → 実機確認 → 回帰確認、を必ず1単位とする。
7. 正常確認できるまで次の機能へ進まない。
8. 不具合時に新しい補修ファイルやwrapperを追加して逃げない。
9. 原因不明ならClean baselineへ戻す。
10. 未ロードファイルは即削除しない。過去補修・テスト・保留として用途を確認してから判断する。

## 2. 現行アーキテクチャの大分類

現行アプリはファイル単位ではなく、次の機能領域として把握する。

1. Bootstrap / Loader
2. 共通状態・在庫基盤
3. 受付セッション
4. スキャナ
5. 状態遷移ガード
6. 通常送信
7. 数量管理
8. イレギュラー受付
9. 販売品
10. 取消
11. 写真
12. Gemini
13. キャッシュ・途中復旧
14. UI補助

各領域について、本体処理だけでなく `wrapper`、完全置換、capture guard、MutationObserver、DOM bridge、setTimeout patch、共有状態へのread/writeを含めて追跡する。

## 3. 起動・ロード構造

静的入口は概ね次の順。

```text
index.html
 ├─ scanner-try-harder-dev.js
 ├─ app.js
 └─ sales-stockin.js
```

`sales-stockin.js` は追加moduleをPromiseチェーンで直列ロードする。現行の主要ロード列は次の通り。

```text
scanner-zxing-wasm-dev.js
sales-stockin-core.js
sales-stockin-scan-enhancements.js
sales-stockin-guards.js
compact-scanner-dev.js
irregular-master-picker-dev.js
irregular-entry-simplify-dev.js
irregular-category-ui-tuning-dev.js
irregular-simple-id-alias-dev.js
irregular-master-layout-dev.js
irregular-registration-guard-dev.js
irregular-quantity-flow-dev.js
irregular-master-send-bridge-dev.js
irregular-master-shipment-photo-dev.js
quantity-transfer-dev.js
gemini-timing-dev.js
gemini-whole-image-dev.js
mode-description-hint-dev.js
wizard-session-finish-dev.js
inventory-refresh-control-dev.js
manual-refresh-ui-dev.js
```

### 構造リスク

この直列loaderは途中の1ファイルまたは先頭側外部依存のロード失敗により、後続moduleが読み込まれない可能性がある。機能上独立して見えるmodule同士にも、loader順による暗黙依存が存在する。

## 4. 全体フロー

```text
受付入口
 ├─ 通常受付
 │    ↓
 │  QR / DataMatrix
 │    ↓
 │  状態遷移・二重登録判定
 │    ↓
 │  scannedEntries
 │    ↓
 │  sendWizardBatch
 │    ↓
 │  GAS
 │    ↓
 │  成功分のみローカル反映
 │    ↓
 │  post-send
 │    ├─ 写真
 │    ├─ REC追記
 │    └─ セッション終了
 │
 ├─ イレギュラー受付
 │    ├─ マスタ選択 → scannedEntries → sendWizardBatchへ合流
 │    └─ 番号入力/不明 → 写真必須 → saveIrregularRegistration
 │
 ├─ 数量検品
 │    ↓
 │  sendQuantityInspection（通常送信とは別幹線）
 │    ↓
 │  GAS
 │
 └─ 販売品入庫
      └─ UIは存在するが仕入入庫GASは未接続

取消
 ↑
各成功送信の lastSuccessfulSend
```

## 5. 主要wrapper / 完全置換系統

```text
loadAppInitialData
app.js
 └─ inventory-refresh-control-dev.js wrapper
      → FINAL

resumeWizardContinuousScan
app.js
 └─ wizard-session-finish-dev.js wrapper
      → FINAL

resetWizard
app.js
 └─ wizard-session-finish-dev.js wrapper
      → FINAL

sendIrregularMasterPickerBatch
send-bridgeで実装/置換
 └─ irregular-master-shipment-photo-dev.js wrapper
      └─ quantity-transfer-dev.js wrapper
           → FINAL

getWizardPreparedBatchRecords
app.js
 └─ quantity-transfer-dev.js wrapper
      → FINAL

buildBatchRecordData
app.js
 └─ quantity-transfer-dev.js wrapper
      → FINAL

handleReadOnlyDecoded
app.js
 └─ sales-stockin-core.js wrapper
      → FINAL

getQuantityInspectionMasterItems
app.js
 └─ sales-stockin-core.js wrapper
      → FINAL

buildWizardIrregularRecord
app.js
 └─ sales-stockin-core.js wrapper
      → FINAL

window.fetch
native fetch
 └─ gemini-timing-dev.js wrapper
      → FINAL
```

### Geminiの重要なタイミング競合

`scanner-try-harder-dev.js` は静的に先読みされ、約50ms後に `analyzeWizardSlipPhoto` へ再試行wrapperを付ける。一方、`gemini-whole-image-dev.js` は動的ロード列後半で `window.analyzeWizardSlipPhoto = analyzeWholeImageOnce` と完全置換する。

そのため端末・キャッシュ・ロード速度によって、

- retry wrapper → 後からGemini完全置換 → retryが消える
- Gemini完全置換 → 50ms後にretry wrapper → retryが残る

のどちらにもなり得る可能性がある。これは現行正常動作を否定するものではないが、ロードタイミング依存の構造リスクとして扱う。

## 6. 見えない介入方式

迷路化の主因はファイル数だけではない。次の方式が併存している。

1. 関数wrapper
2. 関数完全置換
3. MutationObserverによるDOM生成後補正
4. captureイベント + `stopImmediatePropagation()` による元処理の横取り
5. DOM要素そのものの移動・旧DOMをhidden互換として利用
6. `setTimeout()` による後付けpatch
7. 未ロードの旧補修・テストファイルが同一repo内に残存

今後は「関数定義元」だけで挙動を判断しない。

## 7. 共有状態・基幹

`app.js` は在庫配列、各Map、`wizardState`、`scannedEntries`、送信中状態、取消情報、写真状態、検品状態など、アプリの中心メモリを広く保持する。

したがってリファクター単位はファイルではなく、「共有状態を誰が読む/書くか」で切る。

特に次は中心幹線として扱う。

- `sendWizardBatch()`
- `loadAppInitialData()`
- `sendIrregularMasterPickerBatch()`
- `getWizardPreparedBatchRecords()`
- `buildBatchRecordData()`
- `resetWizard()`
- `resumeWizardContinuousScan()`
- `handleReadOnlyDecoded()`
- `analyzeWizardSlipPhoto()`
- `window.fetch`

## 8. 機能別の重要構造

### 8.1 スキャナ

通常ZXingとWASM DataMatrix補助の2経路があり、最終的に共通読取処理へ合流する。`compact-scanner-dev.js` は主として表示サイズ・位置調整であり、ロジック介入は比較的少ない。

### 8.2 イレギュラー

概ね次の責務に分かれる。

```text
候補生成
 ↓
簡易個体ID alias
 ↓
登録可否guard
 ↓
数量補助
 ↓
通常送信へのbridge
 ↓
写真補強
 ↓
拠点移動補強
```

`irregular-entry-simplify-dev.js` は単なる外観変更ではなく、新UIから旧radio/inputを内部的に操作して既存 `app.js` と互換を維持するUI互換bridgeである。

### 8.3 数量管理・拠点移動

`quantity-transfer-dev.js` はUIだけでなく、`getWizardPreparedBatchRecords`、`buildBatchRecordData`、`sendIrregularMasterPickerBatch` に介入する。`sourceLocation` を複数地点で保持しているため、重複に見えても即削除しない。

### 8.4 販売品

`sales-stockin-core.js` は未完成の販売品入庫UIだけではない。現行機能として、

- `getQuantityInspectionMasterItems()` をwrapして販売品を検品候補から除外
- `handleReadOnlyDecoded()` をwrapして通常QRで販売品の作業区分を制限
- `buildWizardIrregularRecord()` をwrapしてイレギュラー受付でも販売品制限

を担う。最初期の整理対象にはしない。

### 8.5 検品

`sendQuantityInspection()` は `sendWizardBatch()` を通らない独立送信系統。ただし成功後は `lastSuccessfulSend` を保存し、取消系統へ合流する。

### 8.6 取消

直前成功送信を `lastSuccessfulSend` で保持し、5分制限内でGAS `cancelSend` を実行する。成功後は送信前snapshotをローカルへ復元し、直近作業ブロックも解除し、キャッシュを保存する。検品取消では追加で在庫再取得・未検品一覧再構築を行う。

### 8.7 写真

- 通常出庫: 送信成功後に写真フロー
- 通常返却: 送信成功後に写真フロー
- イレギュラー直接登録: 写真込みで登録
- 最大6枚
- `photoRequestId` を再試行でも維持して重複保存を防ぐ
- AI解析失敗でも写真保存自体は継続する

### 8.8 セッション終了

`wizard-session-finish-dev.js` により、

- 正常完了 → 受付入口へ戻る
- 失敗レコード残存 → 従来通り読取継続
- 取消完了 → その場で再読取可能

という1受付1セッション仕様が成立する。

### 8.9 在庫更新

IndexedDBキャッシュ復元後にGAS最新データを取得し、Map等を再構築する。自動更新制御は `inventory-refresh-control-dev.js` が `loadAppInitialData` をwrapして担う。手動［更新］は単なる再取得ではなく、キャッシュバスター付きページ全体リロード。

## 9. 未ロード・過去補修候補

現行正規ロード列に含まれないものは、即削除せず隔離して考える。確認済み候補には以下がある。

- `quantity-transfer-send-fix-dev.js`
- `irregular-master-shipment-transition-dev.js`
- `irregular-master-candidate-bridge-dev.js`
- `datamatrix-test.html`（テスト用途）

`irregular-master-candidate-bridge-dev.js` は旧方式として `managedMasterItems` を `individualItems` へ混ぜる補修を持つが、現在の設計思想ではマスタ索引と現在状態を分離して扱う方向とみられる。

## 10. 絶対維持する現行仕様（回帰契約）

### P0: 崩したら即ロールバック

- 状態遷移判定
- 二重出庫・二重返却等の防止
- 直近成功送信ブロック
- 数量在庫計算
- 拠点移動 `sourceLocation`
- GAS payload
- 成功分のみローカル反映、失敗分は残す
- 取消5分制限
- 取消後のローカルsnapshot復元
- 写真保存
- AI失敗時も写真保存継続

### P1: 実機操作が変わったらロールバック

- QR / DataMatrix読取
- 返却追記
- イレギュラーマスタ選択
- 1受付1セッション終了
- 取消後その場で再読取
- 途中作業復旧
- 販売品制限
- 在庫更新制御
- 検品専用送信

### P2: 比較的安全だが挙動確認は必要

- ボタン間隔
- 文字サイズ
- スクロール位置
- 案内文
- カメラ枠レイアウト

MutationObserverやhidden DOM互換を使うUIはP2でも単純削除しない。

## 11. 現行仕様チェックリスト

- 状態なしを段階導入中の正常状態として許容する。
- マスタ情報と現在状態を混同しない。
- 状態遷移は共通判定を利用する。
- 直近成功送信の重複をブロックする。
- QRとDataMatrixは最終的に共通登録判定へ合流する。
- 数量入力は整数1以上。
- 在庫を減らす処理では在庫超過を許さない。
- 拠点移動では移動元と受入先を区別する。
- イレギュラーマスタ選択は通常送信へ合流する。
- 簡易個体だけ必要なゼロ埋めaliasを吸収する。
- 販売品制限を通常QR・検品・イレギュラーで維持する。
- 販売品仕入入庫GASおよび出庫取消履歴選択は現時点で未接続であることを前提にする。
- 検品は通常送信と別幹線。
- 返却は送信前に追記確認を挟む。
- 成功分だけ一覧から除去し、失敗分を残す。
- 取消は直前成功送信・5分制限。
- 取消後にローカル状態を送信前へ戻す。
- 写真は最大6枚。
- AI解析失敗でも写真保存を継続する。
- 正常終了時は受付入口へ戻る。
- 取消時はその場で再読取可能。
- 手動更新はページ全体リロード。
- 途中作業は復元対象。ただし写真そのものは再選択が必要。

## 12. 変更前の固定手順

1. 対象機能の入口関数を特定する。
2. wrapper / 完全置換の有無を確認する。
3. capture guardを確認する。
4. MutationObserverを確認する。
5. DOM bridge / hidden互換を確認する。
6. `setTimeout` 等の遅延patchを確認する。
7. 共有状態へのread/writeを確認する。
8. GAS payloadへの影響を確認する。
9. 未ロード旧補修との責務重複を確認する。
10. 変更は1機能だけ行う。
11. commitする。
12. Pages反映後、実機確認する。
13. P0/P1/P2回帰チェックを行う。
14. 正常確認後のみ次へ進む。

## 13. 初期リファクター候補

現時点では `wizard-session-finish-dev.js` が比較的責務が明確な候補。

ただし、実装前に以下を再確認する。

- `resumeWizardContinuousScan` の全呼出元
- `resetWizard` の全呼出元
- 取消完了フラグの扱い
- 失敗レコード残存時の分岐
- 正常終了時のscanner停止・UI復帰

`scanner-try-harder-dev.js`、`sales-stockin-core.js`、`quantity-transfer-dev.js` は複数領域へ介入しているため初手では避ける。

## 14. Copilot等の第三者レビュー時のルール

この設計書を鵜呑みにせず、Clean baseline `d7a18ca9cafdc92b5d7728989f4e7fb6d35b1724` の実コードと必ず照合する。

レビューでは以下を報告する。

1. 設計書と実コードが一致する点
2. 設計書の誤り・不足・古い理解
3. 設計書にないwrapper / 完全置換
4. 設計書にないMutationObserver / capture guard / DOM bridge / setTimeout patch
5. ロード順依存・タイミング依存
6. 共有状態の隠れたread/write
7. GAS action / payloadの経路
8. 現行ロード列にないファイルと、その役割
9. P0/P1回帰契約で不足している項目
10. 最初のリファクター対象として `wizard-session-finish-dev.js` が本当に安全か

レビュー段階ではコードを変更しない。修正案を出す場合も、まず差分と影響範囲だけを提示する。
