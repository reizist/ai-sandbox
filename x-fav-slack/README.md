# X to Slack Share Chrome Extension

X（Twitter）で気に入った投稿を簡単にSlackにシェアできるChrome拡張機能です。

## 機能

- X上の投稿に「Slackにシェア」ボタンを追加
- ワンクリックでSlackの指定チャンネルに投稿を共有
- Slack Webhook URLによる簡単な設定

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

1. X（https://x.com または https://twitter.com）にアクセス
2. シェアしたい投稿の下部にSlackアイコンが表示される
3. Slackアイコンをクリックすると自動的にSlackに投稿される

## 開発

### ファイル構成

```
x-fav-slack/
├── manifest.json       # Chrome拡張機能のマニフェスト
├── src/
│   ├── background.ts   # バックグラウンドスクリプト（Slack API通信）
│   ├── content.ts      # コンテンツスクリプト（X上でボタン追加）
│   ├── content.css     # コンテンツスタイル
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

## 注意事項

- Webhook URLは安全に管理してください
- 拡張機能はローカルでのみ動作します（Chrome Web Storeへの公開が必要な場合は別途申請が必要）

## ライセンス

MIT