# Erpeos Foundation Checklist

This keeps the current VibeSDK foundation intact while preparing your own local and production setup.

## 1. Local prerequisites

- Install dependencies: `npm install` or `bun install`
- Keep `.dev.vars` for local development
- Run local app with `npm run dev`
- Optional backend worker dev loop: `npm run dev:worker`
- Optional browser sidecar for local preview tooling: `npm run dev:browser`

## 2. Production secrets file

- Fill [`.prod.vars`](C:/Nabil/vibesdk/.prod.vars) before deployment
- Required minimum values:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CUSTOM_DOMAIN`
  - one AI key such as `GOOGLE_AI_STUDIO_API_KEY`
  - `JWT_SECRET`
  - `WEBHOOK_SECRET`
  - `SECRETS_ENCRYPTION_KEY`
- Runtime secrets do not become live Worker bindings just because `wrangler deploy --env-file .prod.vars` succeeds
- After each production deploy, sync runtime secrets too:
  - Core app: `npm run secrets:core`
  - Preview-capable worker: `npm run secrets:preview`

## 3. Cloudflare resources you need to create in your own account

- 1 D1 database
- 1 R2 bucket for templates
- 1 KV namespace
- 1 AI Gateway
- 1 custom domain routed through Cloudflare
- 1 dispatch namespace if you want the current Workers for Platforms flow

## 4. Optional Daytona backup sandbox

Use this only as the backup sandbox route for code generation / preview. The default Cloudflare sandbox path stays untouched unless you explicitly switch it.

- Add these secrets to [`.prod.vars`](C:/Nabil/vibesdk/.prod.vars) when you want Daytona enabled:
  - `SANDBOX_SERVICE_TYPE=daytona`
  - `DAYTONA_API_KEY=...`
  - optional: `DAYTONA_API_URL=...`
  - optional: `DAYTONA_TARGET=...`
  - optional: `DAYTONA_AUTO_STOP_INTERVAL=30`
  - optional: `DAYTONA_AUTO_DELETE_INTERVAL=1440`
  - optional: `DAYTONA_PREVIEW_URL_TTL_SECONDS=86400`
- If `SANDBOX_SERVICE_TYPE` is not `daytona`, the app still uses the existing sandbox path.
- If `SANDBOX_SERVICE_TYPE=daytona` but `DAYTONA_API_KEY` is missing, the app falls back to the built-in Cloudflare sandbox path.
- Daytona preview URLs are preserved as external preview URLs and are not rewritten onto your Cloudflare preview domain.

## 5. What must point to your own resources

Even if you keep the current naming style, these must become your own account resources:

- `d1_databases.database_id`
- `kv_namespaces.id`
- `routes`
- `vars.CUSTOM_DOMAIN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_AI_GATEWAY_TOKEN`

## 6. Recommended production setup order

1. Create the Cloudflare API token with Workers, D1, R2, KV, routes, and account read permissions.
2. Create your D1, R2, KV, AI Gateway, and domain resources in your Cloudflare account.
3. Update [wrangler.jsonc](C:/Nabil/vibesdk/wrangler.jsonc) with your new resource IDs and route/domain values.
4. Fill [`.prod.vars`](C:/Nabil/vibesdk/.prod.vars).
5. Install dependencies.
6. Run local smoke test with `npm run dev`.
7. Deploy core with `npm run deploy:core:full`.
8. If you want Daytona as beta backup sandbox, sync the new Daytona secrets with `npm run secrets:core` or `npm run secrets:preview` after deploy.

## 7. Preview and plan limits

- `npm run deploy:core:full` works on the current setup and publishes the main app to Workers.
- `npm run deploy:preview:full` is prepared in this repo, but the current Cloudflare account still blocks it on the free plan because `worker_loaders` needs Workers Paid.
- Separate from that, dispatch namespaces are still unavailable on this account, so publish-per-generated-app using Workers for Platforms remains blocked until that product is enabled.
- With the new Daytona route, generated-app preview can be offloaded to Daytona without changing the current Cloudflare sandbox foundation.
- Summary:
  - Main product app: ready now
  - Preview under your own Worker without separate publish: config ready, but needs Workers Paid
  - Generated app publish through dispatch namespace: still needs Workers for Platforms
  - Backup generated-app preview via Daytona: now wired behind `SANDBOX_SERVICE_TYPE=daytona`

## 8. First local smoke test

- Confirm `http://localhost:5173` opens
- Confirm one AI provider key in `.dev.vars` is valid
- Confirm auth secrets are non-placeholder values
- If preview/deploy features are used locally, add Cloudflare account credentials to `.dev.vars`

## 9. First production smoke test

- Confirm main app loads on `CUSTOM_DOMAIN`
- Confirm auth works
- Confirm AI generation works
- Confirm template access works
- Confirm preview/deploy flow works only after the required Cloudflare plan features are enabled, or switch to Daytona backup sandbox for beta preview
