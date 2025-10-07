# VR Viewer

## プロジェクト概要
WebXR 対応の 360° 画像・動画ビューワーです。 
ローカルwebサーバで動かすwebアプリです。

ファイル選択用の `file.html` と、VR機器上でビュアーを表示する `view.html` に画面を分けており、PCやスマホのブラウザから操作して WebSocket を介して選択ファイルをリアルタイムに更新します。

VR機器は、MetaQuest と VisionPro を想定しています。

## 特徴
- A-Frame を使った VR/WebXRサポート  
- 360° 画像・動画の切り替え表示  
- 動画の再生・一時停止・シーク操作  
- ピンチ操作によるフリックでの視点回転  
- WebSocket で外部フォルダ監視および自動更新  
- 画像・動画ファイルのサムネイル表示  
- VR180（SBS）画像・動画の表示に対応  
- 2D画像の平面表示（アスペクト比維持）に対応  
- 2DのSBS（左右並び）画像・動画の平面ステレオ表示に対応  

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
     `https://localhost:<port>/file.html`  
   - ビュアーページ：  
     `https://<server-ip>:<port>/view.html`

## 使用方法
### 1. ファイル選択ページ (`file.html`)
1. `file.html` を開き、一覧から画像または動画をクリックで選択  
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

### 表示タイプと判定ルール（info の type 整理）
画像/動画の表示は次のタイプを使って制御できます（大文字小文字は無視）。

- VR180: `type: "vr180"`  
  - VR180（SBS）として球体ステレオ描画（画像/動画）。
  - 自動判定: ファイル名に `VR180` を含む場合もVR180として扱います（例: `clip_VR180.mp4`）。

- VR360: `type: "vr360"`  
  - 360°エクイレクタングラーとして描画。
  - 画像は `a-sky` にセットし、2:1 以外のアスペクトは自動でカバー調整します。動画はビデオスフィア描画。

- 2D SBS（左右並び）: `type: "sbs"`（`sbs2d` や `2d-sbs` など "sbs" を含む値でも可）  
  - 左右半分に分割された2Dソースを、平面に左右の目へ割り当ててステレオ表示（画像/動画）。
  - 自動判定: ファイル名に `_sbs` を含む場合（例: `photo_sbs.jpg`, `movie_sbs.mp4`）。

- 2D（デフォルト）: `type` 指定なし  
  - 画像は平面に等倍表示（アスペクト比維持）。動画は簡易対応としてビデオスフィア描画。

判定の優先順位は以下の通りです（上から順に適用）。
1) VR180  2) VR360  3) 2D SBS  4) 2D（デフォルト）

#### 指定方法
- フォルダに `.info.json` を置く（推奨。対象フォルダ配下のすべてのファイルに適用）
  ```json
  { "type": "vr180" }
  ```
  ```json
  { "type": "vr360" }
  ```
  ```json
  { "type": "sbs" }
  ```
- URLクエリで直接指定  
  - `view.html?src=data/path/to/file.jpg&type=vr180`
  - `view.html?src=data/path/to/file.jpg&type=vr360`
  - `view.html?src=data/path/to/file_sbs.jpg&type=sbs`

UI上では `.info.json` の `type` があるフォルダ名の右側に `[vr180]` / `[vr360]` / `[sbs]` のように表示されます。

## ファイル構成
```
.
├── package.json
├── vrv_server.js
├── config.json
├── ssl          # SSL 鍵・証明書
└── public
    ├── view.html    # ビューワーページ
    ├── file.html    # ファイル選択UI
    ├── file.js      # UI用クライアントスクリプト

```

## 設定ファイル (config.json)
```json
{
  "rootFolder": "./data",
  "port": 3010,
  "fileRegex": "\\.(jpg|png|mp4|webm)$",
  "selectionMode": "single"
}
```
- `rootFolder`：監視フォルダの相対/絶対パス  
- `port`：サーバー起動ポート（HTTPS）  
- `fileRegex`：読み込み対象のファイル拡張子を正規表現で指定  

## ライセンス
MIT License
