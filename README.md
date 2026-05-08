# connpass-fukuoka-events-bluesky-bot

[connpass](https://connpass.com) で会場が福岡県のイベントを新着順に取得し、新規分を [Bluesky](https://bsky.app) に自動投稿する bot。

GitHub Actions の cron で 5 分間隔で動く。

## 仕組み

```
GitHub Actions (*/5 * * * *)
  └─ node src/main.ts
       ├─ connpass API: GET /api/v2/events/?prefecture=fukuoka&order=3&count=100
       ├─ posted-events.json と diff して未投稿のイベントを抽出
       ├─ 古い順に投稿 (text + facets + OGP カード)
       └─ 投稿成功した ID を posted-events.json に追記して commit & push
```

- 「新着」= ID をはじめて見たもの。更新は無視
- 初回実行(`posted-events.json` 不存在)は何も投稿せず、現在の上位 100 件を「投稿済み」として記録する
- 中止イベント (`open_status=cancelled`) は除外
- 1 件の投稿が失敗しても他は続ける。失敗した ID は記録しないので次回 cron で自動リトライ
- 状態ファイル `posted-events.json` は GitHub App の installation token で push（リポジトリの ruleset を bypass する必要あり）

## セットアップ

### 1. ローカル環境

[mise](https://mise.jdx.dev/) を入れて、リポジトリ直下で:

```sh
mise install        # Node.js / pnpm を .mise.toml のバージョンで取得
pnpm install
```

### 2. Bluesky bot アカウント

1. Bluesky で bot 用アカウントを作る
2. 設定 → プライバシーとセキュリティ → アプリパスワード で App Password を発行
3. ハンドル(`your-bot.bsky.social`、`@` は付けない)とパスワードをメモ

### 3. connpass API キー

[connpass API 利用申請](https://help.connpass.com/api/) からキーを取得。

### 4. GitHub App (状態ファイルの commit 用)

リポジトリの ruleset で main への直接 push が禁止されているため、bot 専用の GitHub App を経由して commit する。

1. **Settings (アカウント全体)** → **Developer settings** → **GitHub Apps** → **New GitHub App**
   - Name: 任意 (例: `connpass-fukuoka-bot`)
   - Webhook: **Active のチェックを外す**
   - **Repository permissions** → **Contents: Read and write**
2. App の作成画面で **Generate a private key** をクリックして `.pem` をダウンロード
3. 同じく **Install App** からこのリポジトリに install
4. リポジトリの **Settings → Rules → Default branch ruleset** を開き、**Bypass list** に作成した App を追加

### 5. Repository secrets

リポジトリの **Settings → Secrets and variables → Actions** に以下を追加:

| Secret              | 内容                                       |
| ------------------- | ------------------------------------------ |
| `BSKY_HANDLE`       | bot のハンドル(例: `your-bot.bsky.social`) |
| `BSKY_APP_PASSWORD` | bot の App Password                        |
| `CONNPASS_API_KEY`  | connpass API キー                          |
| `BOT_CLIENT_ID`     | GitHub App の Client ID                    |
| `BOT_PRIVATE_KEY`   | GitHub App の `.pem` の中身 (改行ごと)     |

## ローカルで動作確認

`.env` をリポジトリ直下に作る (`.gitignore` 済み):

```env
BSKY_HANDLE=your-bot.bsky.social
BSKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
CONNPASS_API_KEY=...
DRY_RUN=1
```

dry-run で投稿はせずに動きを確認:

```sh
DRY_RUN=1 \
BSKY_HANDLE=... BSKY_APP_PASSWORD=... CONNPASS_API_KEY=... \
pnpm start
```

または `dotenv` 系のツールを併用してください。

`DRY_RUN=1` のときは `agent.post` を呼ばず、対象イベントを `[dry-run] would post: ...` でログ出力するだけ。`posted-events.json` も書きません。

## 本番投稿の動作確認

GitHub 上で:

1. Actions タブ → **Post Events** workflow → **Run workflow**
2. `dry_run` を **true** にして実行 → 配線確認
3. `dry_run` を **false** で実行 → 初回は「上位 100 件を `posted-events.json` に記録するだけ」で投稿は 0 件
4. 2 回目以降の cron で新着分のみ投稿される

cron は `*/5 * * * *` (5 分間隔)。GitHub Actions の遅延により実際は数分のずれが生じることがある。

## スクリプト

| Command             | 用途                       |
| ------------------- | -------------------------- |
| `pnpm start`        | bot を 1 回実行            |
| `pnpm test`         | vitest で単体・統合テスト  |
| `pnpm test:watch`   | vitest watch モード        |
| `pnpm lint`         | oxlint                     |
| `pnpm format`       | oxfmt で整形               |
| `pnpm format:check` | 整形ずれの検査 (CI で利用) |
| `pnpm typecheck`    | `tsc --noEmit`             |

## ファイル構成

```
src/
├── main.ts                # cron からのエントリ。runOnce / main を export
├── config.ts              # 環境変数読み込み
├── connpass/
│   ├── client.ts          # /api/v2/events/ への fetch ラッパ
│   ├── filter.ts          # cancelled の除外など
│   └── types.ts           # API レスポンス型
├── bluesky/
│   ├── client.ts          # @atproto/api を使った login と postEvent
│   ├── post-builder.ts    # 投稿テキスト + facets の生成
│   └── ogp.ts             # connpass の画像を OGP カードとして添付
└── format/
    └── datetime.ts        # ISO-8601 → 「M月D日(曜) HH:mm〜」(JST)

.github/workflows/
├── ci.yml                 # PR/push のテスト・lint・format・typecheck
└── post.yml               # 5 分 cron で bot を実行する本番 workflow

posted-events.json         # 直近 100 件の投稿済みイベント ID
```

## 投稿フォーマット

```
[イベントタイトル]

📅 5月15日(金) 19:00〜
📍 福岡市中央区天神

https://connpass.com/event/12345/
```

会場は `place` を優先し、`place` が無ければ `address` を使う。両方とも無ければ場所行を省略する。

300 文字 (graphemes) を超える場合はタイトル末尾を `…` で切り詰める。

## 依存バージョン管理

すべてのツールは具体バージョンでピン留め (`.mise.toml`、`package.json`、Workflow の Action SHA)。更新は [Renovate](https://docs.renovatebot.com/) (`renovate.json`) が毎週土曜の朝にまとめて PR を作成する。
