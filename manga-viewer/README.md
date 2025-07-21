# Manga Viewer

AWS S3を活用したクラウド対応の漫画ビューワー。ZIP形式の漫画ファイルを直接S3にアップロードし、動的に画像を配信・表示する現代的なWebアプリケーションです。

## 特徴

- **クラウドファースト**: ファイルをローカルに展開せず、S3に直接保存・配信
- **ZIP対応**: ZIP形式の漫画ファイルを動的に処理
- **レスポンシブデザイン**: デスクトップ・モバイル対応のUI
- **リーディングエクスペリエンス**: フルスクリーン表示、キーボードナビゲーション
- **進捗管理**: 読書進捗の自動追跡と表示
- **モダンテックスタック**: Remix + TypeScript + Tailwind CSS

## 技術スタック

- **フロントエンド**: Remix, React 19, TypeScript, Tailwind CSS v4
- **バックエンド**: Remix (SSR), Prisma ORM
- **データベース**: SQLite
- **ストレージ**: AWS S3
- **ビルド**: Vite
- **画像処理**: JSZip (動的展開)

## セットアップ

### 前提条件

- Node.js 18+
- AWS アカウント（S3バケット）

### インストール

```bash
# 依存関係をインストール
npm install

# データベースを初期化
npm run db:push

# 環境変数を設定
cp .env.example .env
# .envファイルを編集してAWS認証情報とS3バケット名を設定
```

### 環境変数

`.env`ファイルに以下の設定が必要です：

```env
# Database
DATABASE_URL="file:./manga-viewer.db"

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key  
AWS_REGION=ap-northeast-1
S3_BUCKET_NAME=your-bucket-name

# Application
NODE_ENV=development
```

### 開発サーバー起動

```bash
npm run dev
```

ブラウザで http://localhost:5173 を開きます。

## 使い方

### 漫画のアップロード

1. メインページの「ZIPファイルを選択」をクリック
2. 漫画のZIPファイルを選択（画像ファイルが含まれたもの）
3. アップロードが完了すると自動的にビューワーが開きます

### 読書

- **ナビゲーション**: 左右矢印キー、A/Dキー、スペースキー
- **フルスクリーン**: Fキー
- **戻る**: Escキー（フルスクリーン時は終了、通常時はライブラリへ戻る）
- **マウス操作**: 画像の左半分クリックで前ページ、右半分で次ページ

### 進捗管理

- 読書進捗は自動的に保存されます
- ライブラリページで進捗状況を確認できます
- 最近読んだ漫画が優先表示されます

## API エンドポイント

- `POST /api/upload-manga` - 漫画ファイルのアップロード
- `GET /api/extract-zip-image/:collectionId/:pageIndex` - 動的画像配信
- `POST /api/update-progress` - 読書進捗の更新

## スクリプト

```bash
npm run dev          # 開発サーバー起動
npm run build        # プロダクションビルド
npm run start        # プロダクションサーバー起動
npm run typecheck    # TypeScript型チェック
npm run db:generate  # Prismaクライアント生成
npm run db:push      # データベーススキーマ同期
```

## アーキテクチャ

### データフロー

1. ユーザーがZIPファイルをアップロード
2. サーバーがZIPファイルをS3にアップロード
3. ZIP内の画像リストを抽出してメタデータを保存
4. ビューワーで画像リクエスト時に動的にS3からZIPを取得・展開
5. 抽出した画像をストリーミング配信

### ディレクトリ構造

```
manga-viewer/
├── app/                    # Remixアプリケーション
│   ├── routes/            # ページとAPI routes
│   ├── models/            # データベースモデル  
│   ├── utils/             # S3関連ユーティリティ
│   └── lib/               # 共通ライブラリ
├── prisma/                # データベーススキーマ
└── public/                # 静的アセット（なし）
```

### データベース設計

```
MangaCollection {
  id: String              # 一意ID
  title: String           # タイトル
  originalFilename: String # 元ファイル名
  fileHash: String        # ファイルハッシュ
  fileSize: Int           # ファイルサイズ
  totalPages: Int         # 総ページ数
  lastPageRead: Int       # 最後に読んだページ
  storageType: String     # ストレージタイプ（s3固定）
  zipS3Key: String        # S3のZIPファイルキー
  thumbnailS3Key: String  # サムネイル画像キー
  // その他のメタデータフィールド
}
```

## トラブルシューティング

### よくある問題

1. **CSSが適用されない**
   - Tailwind CSS v4の設定を確認
   - PostCSS設定（postcss.config.js）を確認

2. **画像が表示されない**  
   - AWS認証情報とS3バケット設定を確認
   - S3バケットのCORS設定を確認

3. **アップロードに失敗する**
   - ファイルサイズ制限（100MB）を確認  
   - ZIPファイル内に画像ファイルが含まれているか確認

### デバッグ

開発環境では詳細なログが出力されます：

```bash
npm run dev
# アップロード処理やS3操作のログを確認
```

## ライセンス

MIT License

## 貢献

プルリクエストや課題報告を歓迎します。大きな変更を行う前にissueで議論してください。