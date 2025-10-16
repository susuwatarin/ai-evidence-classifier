# AI証拠分類ツール (ai-evidence-classifier)

Google Gemini AIを使用した会計資料の自動分類Webアプリケーションです。

## 機能

- 📁 **ドラッグ&ドロップ**でファイルアップロード
- 🤖 **Gemini AI**による自動分類
- 📊 **リアルタイム進捗表示**
- 💾 **CSV結果ダウンロード**
- 📱 **モバイル対応**

## 対応ファイル形式

- **画像**: PNG, JPG, JPEG, GIF
- **PDF**: PDF文書

## 分類カテゴリ

- 請求書
- 領収書
- 契約書
- 給与明細
- 税務書類
- 銀行取引明細
- 会計帳簿
- その他

## デプロイ方法

### 1. GitHubリポジトリ作成

1. GitHubで新しいリポジトリを作成
2. このプロジェクトのファイルをアップロード

### 2. Vercelでデプロイ

1. [Vercel](https://vercel.com)にアクセス
2. GitHubアカウントでログイン
3. 「New Project」をクリック
4. 作成したリポジトリを選択
5. 「Deploy」をクリック

### 3. 環境変数設定

Vercelダッシュボードで以下の環境変数を設定：

```
GEMINI_API_KEY=あなたのGemini_APIキー
```

## 使用方法

1. ファイルをドラッグ&ドロップまたは選択
2. 「分類開始」ボタンをクリック
3. AI分析結果を確認
4. 必要に応じてCSVダウンロード

## 技術仕様

- **フロントエンド**: HTML, CSS, JavaScript
- **バックエンド**: Node.js, Express
- **AI**: Google Gemini API
- **デプロイ**: Vercel

## ライセンス

MIT License

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。
test
