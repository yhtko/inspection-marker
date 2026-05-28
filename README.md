# Inspection Marker

PDF図面をブラウザで開き、検査用のマーカー、PPAPバルーン、任意文字を手動で追加してPNG保存するWebアプリです。

PDFや作業データは外部サーバーへ送信せず、ブラウザ内で処理します。

## 主な機能

- PDF表示
- マーカー追加
- PPAPバルーン追加
- 任意文字追加
- マーク一覧表示
- マーク一覧のドラッグ&ドロップ並び替え
- マーク削除
- 選択中マークのサイズ調整
- PDF表示回転
- 全体FIT / 幅FIT
- `Ctrl + マウスホイール` で表示倍率変更
- PNG保存
- JSON保存 / JSON読込による作業再開
- UI言語切替
  - 日本語
  - English
  - 中文
  - ไทย
  - Indonesia
  - Tiếng Việt

## セットアップ

```powershell
cd C:\conda\PDFDrawing
npm install
```

## 開発実行

```powershell
npm run dev
```

表示されたURLをブラウザで開きます。

## 本番ビルド

```powershell
npm run build
```

ビルド結果は `dist` フォルダに出力されます。

## GitHub Pagesへ公開する場合

このリポジトリにはGitHub Actionsによる自動公開設定を含めています。

おすすめ手順:

1. GitHubで新しいリポジトリを作成します。
2. このプロジェクトのソース一式をpushします。
3. GitHubの `Settings` → `Pages` を開きます。
4. `Build and deployment` の `Source` を `GitHub Actions` にします。
5. `main` ブランチへpushすると、自動で `npm ci` と `npm run build` が実行され、`dist` がPagesへ公開されます。

Git管理するもの:

- `.github/workflows/pages.yml`
- `src`
- `index.html`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vite.config.ts`
- `README.md`

Git管理しないもの:

- `node_modules`
- `dist`
- `output`
- `samples`

このプロジェクトは `vite.config.ts` で `base: "./"` を指定しているため、GitHub Pagesでも動きやすい設定です。

## 操作

- `PDFを開く`: ローカルPDFをブラウザで読み込み
- `言語`: UI表示言語を切り替え
- `マーカー`: ドラッグで矩形ハイライトと自動Noを追加
- `バルーン`: 寸法箇所からバルーン位置までドラッグしてPPAPバルーンを追加
- `文字`: クリック位置に任意文字を追加
- `左回転` / `右回転`: PDF表示を90度ずつ回転
- `全体FIT`: 表示領域内にページ全体が収まる倍率へ調整
- `幅FIT`: 表示領域の幅にページを合わせる
- `PNG保存`: 現在ページをマーク込みPNGとして保存
- `JSON保存` / `JSON読込`: 作業状態を保存・再開

右ペイン:

- マーク一覧をクリックして選択
- ドラッグ&ドロップでNo順を並び替え
- `削除` ボタンで不要なマークを削除
- 選択中のマーカー、バルーン、文字のサイズや色を編集

## 制限事項

- PDFそのものを編集するツールではありません。
- 出力はPNGです。
- PDF内の文字認識や公差自動検出は行いません。
- ブラウザでPDFを表示するため、非常に大きいPDFでは端末性能の影響を受けます。
