# Depois Eu Ouço

Paste a YouTube link, download/convert the audio to MP3, and listen without keeping the tab open. Optional transcription (faster-whisper), offline translation of the transcript (argos-translate), and saved highlights.

Stack:

- **Frontend** — React 19 + Vite + TypeScript + Tailwind v4 + shadcn/ui, deployed to Cloudflare Workers (static assets + a small Worker that proxies `/api/*` to the backend).
- **Backend** — FastAPI + yt-dlp + faster-whisper + argos-translate + SQLite (SQLModel), deployed to Fly.io with a persistent volume.

No user login — personal use only. The backend is protected by a shared token the Worker injects (see [API token](#api-token)).

## Project layout

```
backend/    FastAPI app (app/main.py), Dockerfile, fly.toml
frontend/   Vite SPA (src/) + Cloudflare Worker proxy (worker/index.ts)
```

## API

| Method   | Path                    | What it does                                            |
| -------- | ----------------------- | ------------------------------------------------------- |
| `POST`   | `/api/info`             | Metadata for a URL (title, channel, duration, chapters) |
| `POST`   | `/api/convert`          | Download + convert to MP3, add to the queue             |
| `GET`    | `/api/audio/{id}`       | Stream the MP3                                          |
| `POST`   | `/api/transcribe`       | Transcribe with faster-whisper (`base` model, CPU/int8) |
| `GET`    | `/api/queue`            | List queue items                                        |
| `PATCH`  | `/api/queue/{id}`       | Update `status` / `last_position_seconds`               |
| `DELETE` | `/api/queue/{id}`       | Delete item + its audio file                            |
| `DELETE` | `/api/queue/{id}/audio` | Delete only the audio file, keep the record             |
| `POST`   | `/api/translate`        | Translate the transcript (`pt`, `en`, `es`), cached     |
| `POST`   | `/api/highlights`       | Save a highlight (text + timestamp)                     |
| `GET`    | `/api/highlights`       | List highlights (optional `?queue_item_id=`)            |
| `DELETE` | `/api/highlights/{id}`  | Delete a highlight                                      |

## Running locally

Two terminals.

**Backend** (`/backend`)

```bash
python3.13 -m venv venv   # first time only
source venv/bin/activate
pip install -r requirements.txt   # first time only
uvicorn app.main:app --reload
```

Backend runs on `http://localhost:8000`. SQLite DB and MP3s land in `backend/storage/` (override with `DATA_DIR`).

**Frontend** (`/frontend`)

```bash
yarn install   # first time only
yarn dev
```

Frontend runs on `http://localhost:5173` and proxies `/api` to `localhost:8000` via Vite.

Other scripts: `yarn lint` (oxlint), `yarn format`, `yarn build`, `yarn deploy`.

## Environment variables

**Backend**

| Var                  | Default           | What it does                                 |
| -------------------- | ----------------- | -------------------------------------------- |
| `DATA_DIR`           | `backend/storage` | Where the SQLite DB and MP3s live            |
| `AUDIO_CLEANUP_DAYS` | `14`              | Days before archived episodes lose their MP3 |
| `COOKIES_FILE`       | _(unset)_         | yt-dlp cookies file, needed in production    |
| `API_TOKEN`          | _(unset)_         | Shared token required on `/api/*`; unset disables the check |

In production (`backend/fly.toml`) `DATA_DIR=/data` and `COOKIES_FILE=/data/cookies.txt`, both on the Fly volume mounted at `/data`.

**Frontend Worker**

| Var               | What it does                                       |
| ----------------- | -------------------------------------------------- |
| `FLY_BACKEND_URL` | Backend origin the Worker proxies `/api/*` to      |
| `API_TOKEN`       | Injected as `X-API-Token` on every proxied request |

Locally, copy `frontend/.dev.vars.example` to `frontend/.dev.vars`. In production, set them as Worker secrets:

```bash
npx wrangler secret put FLY_BACKEND_URL
npx wrangler secret put API_TOKEN
```

## API token

The Fly backend has no login and its URL is public, so anyone could hit `/api/*` — burning CPU and disk on `/api/convert`, or deleting queue items. To stop that, the backend requires a shared token on every `/api/*` request and the Worker injects it; the browser never sees it.

1. Generate a token:
   ```bash
   openssl rand -hex 32
   ```
2. Set it on both sides, with the **same value**:
   ```bash
   fly secrets set API_TOKEN=<token>     # from /backend
   npx wrangler secret put API_TOKEN     # from /frontend
   ```

Order matters on the first rollout: set the Worker secret and deploy the Worker **before** setting `API_TOKEN` on Fly, otherwise the frontend gets `401` in between.

With `API_TOKEN` unset the check is skipped, so local dev keeps working with no config.

## Accessing from your phone / another device on the same network

1. Find your machine's local IP:
   ```bash
   ipconfig getifaddr en0   # macOS, Wi-Fi
   ```
2. Start the backend bound to all interfaces:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0
   ```
   Vite already listens on all interfaces (`server.host: true`), and its `/api` proxy talks to `localhost:8000` from the same machine, so no proxy change is needed.
3. On your phone, browse to `http://<your-ip>:5173`.

Both dev servers must stay running on your computer.

## Deploy

**Backend → Fly.io** (from `/backend`)

```bash
fly deploy
```

`fly.toml` uses `shared-cpu-1x` / 2 GB (whisper and argos-translate need the headroom), a `data` volume mounted at `/data`, and auto stop/start machines. `faster-whisper` and `argostranslate` are imported lazily inside the route handlers — at module level they delay the uvicorn bind past Fly's proxy timeout.

**Frontend → Cloudflare Workers** (from `/frontend`)

```bash
yarn deploy   # vite build && wrangler deploy
```

## Audio cleanup

Archived (listened) episodes have their MP3 deleted after `AUDIO_CLEANUP_DAYS` days of being archived, to save disk. The record (title, transcript, highlights) stays, and the card offers a "Reconverter" button to re-download the audio. Cleanup runs once on backend startup.

```bash
AUDIO_CLEANUP_DAYS=30 uvicorn app.main:app --reload
```

## Autenticação do YouTube (produção)

Em produção (Fly.io), o YouTube costuma bloquear requisições vindas de IP de datacenter com o erro "Sign in to confirm you're not a bot". Pra contornar isso, o backend aceita um arquivo de cookies opcional (via `COOKIES_FILE`) que é passado pro yt-dlp.

1. Gere o arquivo de cookies localmente, uma vez, logado no navegador com uma conta do YouTube:
   ```bash
   yt-dlp --cookies-from-browser firefox --cookies cookies.txt https://youtube.com
   ```
2. Suba esse arquivo pro volume persistente do Fly (via console SSH do dashboard do Fly.io), salvando em `/data/cookies.txt`.
3. Confirme que a env var `COOKIES_FILE=/data/cookies.txt` está configurada no Fly, no mesmo lugar onde `DATA_DIR` já está configurada (bloco `[env]` do `fly.toml`).

Sem `COOKIES_FILE` configurada (ou com o arquivo ausente), o backend continua funcionando normalmente, apenas logando um aviso de que requisições podem ser bloqueadas.

**Nunca commite o `cookies.txt`** — ele é uma credencial da sua conta do YouTube. Já está no `backend/.gitignore`.

Cookies do YouTube expiram (geralmente algumas semanas a meses). Quando o erro de bot-check voltar a aparecer, repita os passos 1 e 2 pra regerar e reenviar o arquivo.
