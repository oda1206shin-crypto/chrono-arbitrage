# Chrono Arbitrage — デプロイガイド

## 前提条件

- Node.js 18+
- GitHub アカウント
- Vercel アカウント（無料プランで OK）
- Supabase プロジェクト（作成済み）
- Stripe アカウント（テストモード）

---

## 手順①: GitHub に push

```bash
git init
git add .
git commit -m "feat: initial release - Chrono Arbitrage v0.1"

# GitHub でリポジトリを作成してから:
git remote add origin https://github.com/{your-username}/chrono-arbitrage
git push -u origin main
```

---

## 手順②: Supabase SQL マイグレーション

Supabase ダッシュボード → **SQL Editor** で以下を順番に実行：

1. `supabase/schema.sql`
2. `supabase/migrations/001_watch_listings.sql`
3. `supabase/migrations/002_stripe_fields.sql`
4. `supabase/migrations/003_beta_users.sql`

---

## 手順③: Supabase 認証設定

**Authentication → URL Configuration**

```
Site URL:
  https://{your-vercel-domain}.vercel.app

Redirect URLs（改行区切りで追加）:
  https://{your-vercel-domain}.vercel.app/auth/callback
  http://localhost:3000/auth/callback
```

**Authentication → Providers → Google**
- Google Cloud Console で OAuth 2.0 クライアントを作成
- Client ID / Secret を設定

---

## 手順④: Stripe 設定

### 商品作成

| 商品名 | 月額価格 | 年額価格 |
|--------|---------|---------|
| Collector | $49/月 | $529/年 |
| Pro | $99/月 | $1,069/年 |
| Dealer | $299/月 | $3,229/年 |

各商品の Price ID を `.env.local` に設定：
```
STRIPE_PRICE_COLLECTOR=price_xxx
STRIPE_PRICE_COLLECTOR_YEARLY=price_xxx
STRIPE_PRICE_PRO=price_xxx
...
```

### Webhook 設定

```
URL: https://{your-vercel-domain}.vercel.app/api/stripe/webhook

イベント:
  - checkout.session.completed
  - customer.subscription.updated
  - customer.subscription.deleted
  - invoice.payment_failed
```

Webhook Signing Secret を `.env.local` の `STRIPE_WEBHOOK_SECRET` に設定。

---

## 手順⑤: Vercel デプロイ

1. [vercel.com](https://vercel.com) → **Add New Project**
2. GitHub リポジトリを選択
3. Framework: **Next.js**（自動検出）
4. **Environment Variables** に以下を全て設定：

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_COLLECTOR
STRIPE_PRICE_COLLECTOR_YEARLY
STRIPE_PRICE_PRO
STRIPE_PRICE_PRO_YEARLY
STRIPE_PRICE_DEALER
STRIPE_PRICE_DEALER_YEARLY
SCRAPINGBEE_API_KEY
NEXT_PUBLIC_APP_URL=https://{your-vercel-domain}.vercel.app
CRON_SECRET={ランダムな強力な文字列}
```

5. **Deploy** をクリック

---

## 手順⑥: デプロイ後の確認

### デプロイ前チェック

```bash
bash scripts/deploy-checklist.sh
```

### 動作確認チェックリスト

```
□ https://{domain}/waitlist にアクセスできる
□ waitlist でメールを登録 → beta_users に追加される
□ https://{domain}/auth/signup でメール登録できる
□ Google ログインが動く
□ /auth/callback 後に /pricing にリダイレクトされる
□ Stripe テストカード 4242 4242 4242 4242 で決済が通る
□ 決済後に users.plan が更新される
□ /dashboard で「アップグレードしました」バナーが出る
□ beta_users に approved 登録がない場合 /waitlist にリダイレクトされる
```

### Cron 動作確認

```bash
# ローカルでテスト（CRON_SECRET が必要）
curl -H "Authorization: Bearer {CRON_SECRET}" \
  https://{domain}/api/cron/scrape
```

Vercel ダッシュボード → **Cron Jobs** タブで実行ログを確認。

---

## β招待管理

### ユーザーを承認する

```bash
curl -X POST https://{domain}/api/beta/approve \
  -H "Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "action": "approve"}'
```

承認すると：
1. `beta_users.status` が `approved` に更新
2. Supabase Auth から招待メールが送信される

### 一覧を取得する

```bash
curl https://{domain}/api/beta/waitlist \
  -H "Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}"
```

---

## テストカード

| カード番号 | 結果 |
|-----------|------|
| 4242 4242 4242 4242 | 成功 |
| 4000 0000 0000 9995 | 残高不足 |
| 4000 0025 0000 3155 | 3D セキュア必要 |

有効期限: 任意の将来日付 / CVV: 任意の3桁

---

## トラブルシューティング

### Webhook が届かない
- Stripe CLI でローカルテスト: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- 本番 Webhook URL が正しいか確認
- `STRIPE_WEBHOOK_SECRET` が本番用か確認

### Google OAuth が動かない
- Supabase の Redirect URLs に本番 URL を追加したか確認
- Google Cloud Console の認証済みリダイレクト URI に追加したか確認

### Cron が実行されない
- Vercel Pro プラン以上が必要（Hobby は Cron 非対応）
- `vercel.json` の cron 設定を確認
- `CRON_SECRET` を Vercel 環境変数に設定したか確認
