# VRV API とデータフロー

本書は `vrv_server` と `file.html`・`param.html`・`view.html` の各クライアント間でやり取りされる API とデータの流れをまとめたものです。

## システム構成
- `vrv_server.js` が Express/HTTPS サーバーと WebSocket サーバーを兼務し、`public/` 以下を静的配信する。
- 選択状態 `lastSelection` と表示パラメータ `lastParameters` をサーバー側メモリに保持し、クライアント接続時に即時配布する。
- `file.html`（ファイルセレクタ）、`view.html`（A-Frame ビューア）、`param.html`（パラメータパネル）は全て同じ WebSocket エンドポイントに接続し、最新状態を双方向に同期する。

## REST API

### `GET /api/files?path=<relative path>`
- 指定ディレクトリ配下の一覧を `folders` と `files` に分けて返す。結果にはソート用の `mtime`、サムネイル URL（`thumbUrl`）、フォルダ情報 `.info.json` の内容（`info`）が含まれる。
- `selectionMode` はクライアントが複数選択可能かを判断するために利用する。
- `public/app.js:33` から呼び出され、レスポンスは UI 表示と `state` 更新に使われる。

### `POST /api/select`
- ボディ例: `{ "files": ["folder/file.mp4"], "info": { "type": "vr360" }, "path": "folder" }`
- サーバーは受信内容を `lastSelection` に保存し、WebSocket 経由で全クライアントへブロードキャストする。
- ファイルセレクタが選択確定時に送信し、ビューアがその通知を受けてメディアを切り替える。

### `GET /api/last-selection`
- サーバー起動後に記録された最新の `lastSelection` を返却。
- ビューアは初期表示時にこのエンドポイントを参照し、未指定時でも直前の選択状態を再現する。

## WebSocket プロトコル
- エンドポイント: `wss://<host>/<base path>/`
- 接続直後にサーバーが `lastSelection` と `{"type":"params","params":{...}}` を push し、クライアントは状態を初期化する。
- ファイルセレクタは選択確定時に JSON（配列のみの場合も含む）を送信。サーバーはそのまま他クライアントに転送する。
- パラメータパネルは `{"type":"params","params":{modelScale, modelOrientation}}` を送信。サーバーは `lastParameters` を更新し、全クライアントへ再送する。
- ビューアは `type === "params"` のメッセージで `parameterStore` を更新し、現在のビューモジュールにパラメータ差分を渡す。

## クライアント別の役割

### `file.html` / `public/app.js`
- `GET /api/files` でディレクトリ一覧を取得し、クリック操作でハッシュ遷移と表示を更新する。
- ファイル選択確定時に `POST /api/select` を呼び出し、同時に WebSocket 経由で他クライアントへ通知される。

### `view.html` / `public/view.js`
- クエリ `?src=` または `GET /api/last-selection` の結果を初期メディアとして読み込み、`public/data/` から静的配信されたファイルにアクセスする。
- WebSocket の `selection` メッセージで渡されたパスを `data/<relative path>` に解決し、メディア種別から適切なビューモジュール（`vr360`, `flat-video`, `model-glb` など）を動的 import する。
- `type === "params"` を受信すると `parameterStore` に保存し、モデルビュー時はスケールや向きを即時反映する。

### `param.html`
- UI 操作で `latestState` を更新し、WebSocket 接続が開いていれば即座に `{"type":"params"}` を送信する。未接続時はフラグを立てて再接続後に同期する。
- `type === "params"` を受信すると UI 状態へ反映し、サーバー→ビューア→パネルの一貫した同期を保証する。

## データフローまとめ
1. ファイルセレクタが `GET /api/files` で一覧を取得し、ユーザーがファイルを選択すると `POST /api/select` を実行。
2. サーバーは選択情報を `lastSelection` に保存し、WebSocket でビューアとパネルに配信。ビューアは `data/` 配下から実ファイルを読み込み表示する。
3. パラメータパネルは `{"type":"params"}` を送信し、サーバーが `lastParameters` を更新。ビューアは受信したパラメータをビューモジュールへ適用し、パネル UI もサーバー経由で最新状態を受け取る。
4. 新規にクライアントが接続した場合でも、サーバーが保持している `lastSelection` と `lastParameters` が送信され、直前の状態をそのまま再現できる。

