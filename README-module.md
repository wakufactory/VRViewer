# 新しい対応フォーマットとビュー・モジュール追加ガイド

このプロジェクトでは、`public/view.js` がファイル種別やメタ情報に応じて適切なビュー・モジュールを動的に import し、`public/view-modules/` 配下のアダプタが A-Frame のエンティティを生成・再利用します。新しい表示フォーマットに対応させる場合は、下記の手順に従ってください。

## 1. 表示要件の整理
- 対応したいメディア種別（画像 / 動画 / 双方）や投影方法（例：立体視、特定平面上のレンダリングなど）を明確にします。
- 再利用したい既存のアセット（`#imageAsset` / `#videoAsset`）が使えるか確認します。
- 固有の幾何形状やシェーダー設定が必要な場合は、A-Frame でどのようなエンティティを生成するか決めておきます。

## 2. モジュールファイルの作成
1. `public/view-modules/` に `<新フォーマット名>.js` を追加します（例: `my-format.js`）。
2. `createView` ファクトリ関数をエクスポートし、初回呼び出しで必要な A-Frame エンティティを生成します。
   ```js
   export function createView({ viewRoot, imageAsset, videoAsset }) {
     let entity = null;

     const ensureEntity = () => {
       if (!entity) {
         entity = document.createElement('a-entity');
         entity.id = 'my-format-entity';
         // 必要な geometry / material / component を設定
         viewRoot.appendChild(entity);
       }
       return entity;
     };

     return {
       async show({ isVideo }) {
         const el = ensureEntity();
         // メディア種別に応じた属性更新
         el.setAttribute('visible', 'true');
       },
       hide() {
         if (entity) entity.setAttribute('visible', 'false');
       }
     };
   }
   ```
3. 既存モジュールを参考に、サイズ計算・テクスチャ差し替え・イベントリスナ管理などを実装します。
4. 同じフォーマットを再表示する際に使い回せるよう、エンティティ生成は必ず `ensureXxx()` のような関数で一度だけ行います。

## 3. `view.js` での対応
1. `viewModuleLoaders` に新しいキーを追加します。
   ```js
   const viewModuleLoaders = {
     ...,
     'my-format': () => import('./view-modules/my-format.js'),
   };
   ```
2. `resolveViewModuleKey` 内で、フォーマット判定とキーの返却を行います。
   - ファイル名や `.info.json` などのメタ情報から判定できるようにします。
   - 例: 拡張子・サフィックス・クエリパラメータで `myfmt` が指定されたら `'my-format'` を返す。
3. 必要であれば `detectMode` に判定ロジックを追加し、その結果に応じて `resolveViewModuleKey` が使用するようにします。

## 4. 判定ロジックの拡張（任意）
- `detectMode` はファイル名やメタ情報から表示モードを抽出します。既存の正規表現を参考に、新しいキーワード・パターンを追加してください。
- 判定結果を URL クエリ（`?type=myfmt` など）や WebSocket の `info.type` から受け取れるようにする場合は、送信側の実装も合わせて更新します。

## 5. 動作確認
1. `view.html` をブラウザで開き、対象ファイルをドラッグ＆ドロップまたは URL パラメータで指定し、期待どおりに表示されるか確認します。
2. 既存モードと切り替えた際に UI が崩れないか、再生制御（動画の場合）が成立しているかを確認します。
3. WebSocket を利用している場合は、フォルダ変更時に新フォーマットが呼び出されるか、再接続時の状態が正しく復旧するかをチェックします。

## 6. よくある注意点
- `show` 内でイベントリスナを追加する場合、`hide` で必ず解除してメモリリークを防ぎます。
- `imageAsset` / `videoAsset` のロード完了タイミングに依存する場合は、`load` / `loadedmetadata` イベントを使ってリサイズやテクスチャ更新を行います。
- 可能であれば `view-modules/` ディレクトリ内にテスト用の簡単なコメントやメモを残すと、将来のメンテナンスが容易になります。

以上の手順で新しいフォーマットを安全に追加できます。不明点があれば既存モジュール（`vr360.js`・`vr180.js`・`sbs.js` など）を参考にしてください。
