# Slack Share Button Chrome Extension

任意のWebページにSlackシェアボタンを追加し、気に入った記事を簡単にSlackで共有できるChrome拡張機能です。

## 機能

- 🎯 **自動検出**: ソーシャルシェアボタンを自動検出し、その近くにSlackボタンを追加
- 🎈 **フローティングボタン**: ソーシャルボタンがない場合は画面右下にフローティングボタンを表示
- 📄 **メタデータ取得**: Open GraphやTwitter Cardのメタデータを活用して記事情報を取得
- 🔗 **自動プレビュー**: SlackでURLが自動展開され、記事のプレビューが表示される

## セットアップ方法

### 1. Slack Webhook URLの取得

1. [Slack App Directory](https://api.slack.com/apps)にアクセス
2. 「Create New App」をクリック
3. 「From scratch」を選択
4. アプリ名とワークスペースを設定
5. 左メニューから「Incoming Webhooks」を選択
6. 「Activate Incoming Webhooks」をONにする
7. 「Add New Webhook to Workspace」をクリック
8. 投稿先のチャンネルを選択
9. 生成されたWebhook URLをコピー

### 2. 拡張機能のビルド

```bash
# 依存パッケージのインストール
npm install

# TypeScriptのビルド
npm run build
```

### 3. Chrome拡張機能のインストール

1. Chromeで `chrome://extensions/` にアクセス
2. 右上の「デベロッパーモード」をONにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このプロジェクトのディレクトリを選択

### 4. 初期設定

1. Chrome拡張機能アイコンをクリック
2. Slack Webhook URLを入力
3. （オプション）投稿先チャンネルを指定
4. 「Save Settings」をクリック
5. 「Test Connection」で接続確認

## 使い方

### 方法1: ソーシャルシェアボタンの近くから

多くのWebサイトでは、Twitter、Facebookなどのシェアボタンの近くに自動的にSlackボタンが追加されます。

### 方法2: フローティングボタンから

ソーシャルシェアボタンがないページでは、画面右下にSlackのフローティングボタンが表示されます。

### Slackでの表示

- 記事のURLが自動的に展開され、タイトルや画像のプレビューが表示されます
- Open Graphメタデータがある場合は、より詳細な情報が表示されます

## 開発

### ファイル構成

```
x-fav-slack/
├── manifest.json       # Chrome拡張機能のマニフェスト
├── src/
│   ├── background.ts   # バックグラウンドスクリプト（Slack API通信）
│   ├── content.ts      # コンテンツスクリプト（ボタン追加ロジック）
│   ├── content.css     # ボタンと通知のスタイル
│   ├── popup.html      # 設定画面HTML
│   ├── popup.ts        # 設定画面スクリプト
│   └── popup.css       # 設定画面スタイル
├── dist/              # ビルド出力
├── icons/             # 拡張機能アイコン
└── package.json       # npm設定
```

### 開発コマンド

```bash
# ビルド
npm run build

# ウォッチモード（開発時）
npm run watch

# クリーン
npm run clean
```

## 動作サイト例

- ブログ記事（Zenn、Qiita、note、はてなブログなど）
- ニュースサイト
- ドキュメントサイト
- その他、任意のWebページ

## 注意事項

- Webhook URLは安全に管理してください
- 一部のWebサイトでは、セキュリティポリシーにより動作しない場合があります
- Chrome拡張機能の仕様上、chrome://ページやChrome Web Storeでは動作しません

## ライセンス

MIT