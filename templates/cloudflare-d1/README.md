# Deploy Drizby to Cloudflare

## Prerequisites
- Cloudflare account (Workers Paid plan, $5/mo)
- Wrangler CLI: `npm i -g wrangler && wrangler login`

## Steps

1. Clone the repo and change into this directory:
   ```sh
   git clone https://github.com/cliftonc/drizby.git
   cd drizby/templates/cloudflare-d1
   ```

2. Create D1 databases and note the `database_id` from each output:
   ```sh
   wrangler d1 create drizby-db
   # → note the database_id (this is your D1_DATABASE_ID)

   wrangler d1 create drizby-demo-db
   # → note the database_id (this is your D1_DEMO_DATABASE_ID)
   ```

3. Apply migrations to the platform DB:
   ```sh
   wrangler d1 execute drizby-db --remote --file=../../drizzle/0000_short_freak.sql
   ```

4. Get your Cloudflare credentials:

   **CF_ACCOUNT_ID:** Go to the [Cloudflare dashboard](https://dash.cloudflare.com) → click the three-dot menu (⋮) next to your account name → "Copied account ID".

   **CF_API_TOKEN:** Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → Create Token → use the "Edit Cloudflare Workers" template, then add **D1 Edit** permissions under Account resources.

5. Set secrets (you'll be prompted for each value):
   ```sh
   wrangler secret put CF_ACCOUNT_ID
   wrangler secret put CF_API_TOKEN
   wrangler secret put D1_DATABASE_ID
   wrangler secret put D1_DEMO_DATABASE_ID
   ```

6. Deploy:
   ```sh
   wrangler deploy
   ```

Demo data is seeded automatically when you create your admin account.

## Architecture

```
Browser → Cloudflare Worker (thin router) → Container (Drizby/Hono)
                                               ├── D1 HTTP API → drizby-db (platform DB)
                                               ├── D1 HTTP API → drizby-demo-db (demo data)
                                               └── Outbound TCP → External Postgres (user connections)
```

## Limitations

- Container disk is ephemeral — all persistent data lives in D1
- Local SQLite user connections don't work (only D1 + external Postgres)
- D1 HTTP API adds ~50-100ms latency per query
- Cold start ~2-3s when container wakes from sleep
- Containers are in public beta
