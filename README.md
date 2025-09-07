# VR Viewer

## プロジェクト概要
WebXR 対応の 360° 画像・動画ビューワーです。 
ローカルwebサーバで動かすwebアプリです。

ファイル選択用の `ui.html` と、VR機器上でビュアーを表示する `view.html` に画面を分けており、PCやスマホのブラウザから操作して WebSocket を介して選択ファイルをリアルタイムに更新します。

VR機器は、MetaQuest と VisionPro を想定しています。

## 特徴
- A-Frame を使った VR/WebXRサポート  
- 360° 画像・動画の切り替え表示  
- 動画の再生・一時停止・シーク操作  
- ピンチ操作によるフリックでの視点回転  
- WebSocket で外部フォルダ監視および自動更新  
- 画像・動画ファイルのサムネイル表示  
- VR180（SBS）画像・動画の表示に対応  

## 前提条件
- Node.js と npm がインストールされていること  
- SSL 鍵・証明書を生成（`npm install` 後に自動実行される `postinstall` スクリプト）  
- `config.json` でファイル選択対象フォルダ（`rootFolder`）を設定 (デフォルトではpublic/dataの下にあることを想定)  

## インストール & 起動方法
1. リポジトリをクローン  
   ```bash
   git clone git@github.com:wakufactory/VRViewer.git
   cd VRViewer
   ```
2. 依存パッケージをインストール  
   ```bash
   npm install
   ```
3. サーバーを起動  
   ```bash
   npm start
   ```
4. ブラウザで以下の URL にアクセス  
   - ファイル選択ページ：  
     `https://localhost:<port><basePath>/ui.html`  
   - ビュアーページ：  
     `https://<server-ip>:<port><basePath>/view.html`

## 使用方法
### 1. ファイル選択ページ (`ui.html`)
1. `ui.html` を開き、一覧から画像または動画をクリックで選択  
2. フォルダの場合はそのフォルダに移動  
3. フォルダに".thumb"フォルダがある場合に、その中の同名画像をサムネイルとしてリストに表示します。  

### 2. ビュアーページ (`view.html`)
- 選択されたファイルが自動で表示・再生されます。  
- 動画: 再生・一時停止ボタン、シークバーで操作可能  
- 画像: タイル内のドラッグやピンチで向きを調整  
- URL クエリパラメータを使って直接ファイル指定可能  
  ```
  https://<server-ip>:<port>/view.html?path/to/file.jpg
  ```

### VR180（SBS）表示について
- 対応するSBSソース: 左右が横並び（Side-by-Side）になっているVR180画像/動画。
- 検出方法は以下の通りです。
  - ファイル名に「_sbs」が含まれる場合（例: `myphoto_sbs.jpg`, `movie_sbs.mp4`）はVR180として表示します。
  - フォルダに `.info.json` を置き、その中で `{"type":"vr180"}` を指定すると、そのフォルダ内のファイルをVR180として扱います。
  - ビューワーURLに `type=vr180` を付けても指定可能です（例: `view.html?data/path/to/file.jpg&type=vr180` あるいは `view.html?src=data/path/to/file.jpg&type=vr180`）。

#### `.info.json` の例
対象フォルダ配下に `.info.json` を配置してください（`config.json` の `rootFolder` 配下）。

```json
{
  "type": "vr180"
}
```

UI上ではフォルダ名の右側に `[vr180]` と表示され、`view.html` ではSBS用のステレオ表示でレンダリングされます。

## ファイル構成
```
.
├── package.json
├── vrv_server.js
├── config.json
├── ssl          # SSL 鍵・証明書
└── public
    ├── view.html    # ビューワーページ
    ├── ui.html      # ファイル選択UI
    ├── app.js       # UI用クライアントスクリプト

```

## 設定ファイル (config.json)
```json
{
  "rootFolder": "./data",
  "port": 3010,
  "fileRegex": "\\.(jpg|png|mp4|webm)$",
  "selectionMode": "single",
  "basePath": "/"
}
```
- `rootFolder`：監視フォルダの相対/絶対パス  
- `port`：サーバー起動ポート（HTTPS）  
- `fileRegex`：読み込み対象のファイル拡張子を正規表現で指定  
- `basePath`：リバースプロキシ配下でサブパスに公開する場合のルート（例：`/vrv`）。ルート直下で運用する場合は `/`。

## ライセンス
MIT License
