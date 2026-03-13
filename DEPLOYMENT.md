# Deployment Guide

This project is deployment-ready for:
- `ipl-web` (React frontend)
- `ipl-api` (Node API)
- `ipl-ml` (FastAPI model service)

Recommended setup is **all services on Render** using `render.yaml`.

## 1) Prerequisites

- GitHub repo with this code
- Neon Postgres database (`DATABASE_URL`)
- Cricket API key (`CRICKET_API_KEY`)
- Your custom domain in a DNS provider (Cloudflare, GoDaddy, Namecheap, etc.)

## 2) Deploy All Services on Render

1. Go to Render -> `New` -> `Blueprint`.
2. Select this GitHub repo.
3. Render will read `render.yaml` and create:
   - `ipl-web`
   - `ipl-api`
   - `ipl-ml`
4. Set required secret env vars:
   - On `ipl-api`: `DATABASE_URL`, `CRICKET_API_KEY`
   - On `ipl-ml`: `DATABASE_URL`
5. Deploy all services.

Notes:
- `ipl-api` gets `ML_SERVICE_URL` from `ipl-ml` automatically.
- `ipl-web` gets `VITE_API_URL` from `ipl-api` automatically.
- `ipl-ml` auto-trains pre-match model if artifact is missing (`AUTO_TRAIN_PREMATCH=1`).

## 3) Verify Health

After deploy, confirm:
- `https://<ipl-web>.onrender.com`
- `https://<ipl-api>.onrender.com/api/health`
- `https://<ipl-ml>.onrender.com/health`

Then trigger fixture sync:

```bash
curl -X POST https://<ipl-api>.onrender.com/api/admin/sync/fixtures
```

## 4) Configure Custom Domain

Recommended domain mapping:
- `app.yourdomain.com` -> `ipl-web`
- `api.yourdomain.com` -> `ipl-api`
- Optional: `ml.yourdomain.com` -> `ipl-ml`

Steps:
1. In Render service settings, add each custom domain.
2. Render shows DNS records (CNAME/A) per service.
3. Add exactly those records in your DNS provider.
4. Wait for SSL to become active.

## 5) Update CORS For Your Real Domain

On `ipl-api`, set:

```env
CORS_ORIGINS=https://app.yourdomain.com,https://www.yourdomain.com
```

If you need wildcard subdomains:

```env
CORS_ORIGINS=https://*.yourdomain.com
```

Then redeploy/restart `ipl-api`.

## 6) Optional: Use Vercel For Frontend Instead

`vercel.json` is included for root deployment.

If you use Vercel:
1. Deploy repo to Vercel.
2. Set frontend env var:
   - `VITE_API_URL=https://api.yourdomain.com`
3. Keep `ipl-api` and `ipl-ml` on Render.
4. Set API CORS:
   - `CORS_ORIGINS=https://your-vercel-domain.vercel.app,https://app.yourdomain.com`

## 7) Final Smoke Test

1. Open frontend domain and verify upcoming matches load.
2. Check API:
   - `GET /api/health`
   - `GET /api/matches?season=2026&status=upcoming`
3. Check ML:
   - `GET /health`
4. Trigger one prediction:

```bash
curl -X POST https://api.yourdomain.com/api/predictions/pre-match/<matchId>
```
