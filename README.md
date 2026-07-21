# Depois Eu Ouço

Paste a YouTube link, download/convert the audio to MP3, and listen locally without keeping the tab open. Optional local transcription via faster-whisper.

Stack: React + Vite + TypeScript + Tailwind + shadcn/ui (frontend), FastAPI + yt-dlp + faster-whisper + SQLite (backend). Everything runs locally, no Docker, no auth (personal use only).

## Running locally

Two terminals.

**Backend** (`/backend`)

```bash
python3.13 -m venv venv   # first time only
source venv/bin/activate
pip install -r requirements.txt   # first time only
uvicorn app.main:app --reload
```

Backend runs on `http://localhost:8000`.

**Frontend** (`/frontend`)

```bash
yarn install   # first time only
yarn dev
```

Frontend runs on `http://localhost:5173` and proxies `/api` to the backend.

Open `http://localhost:5173` and paste a YouTube link.

## Accessing from your phone / another device on the same network

1. Find your machine's local IP:
   ```bash
   ipconfig getifaddr en0   # macOS, Wi-Fi
   ```
2. Start the backend bound to all interfaces:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0
   ```
   The frontend's Vite dev server is already configured to listen on all interfaces (`server.host: true` in `vite.config.ts`), and its `/api` proxy talks to `localhost:8000` from the same machine, so no proxy target change is needed.
3. On your phone, browse to `http://<your-ip>:5173`.

Both dev servers must stay running on your computer; the phone just talks to them over the LAN. No login is required.

## Audio cleanup

Archived (listened) episodes have their MP3 file automatically deleted after they've been archived for a while, to save disk space — the record (title, transcript) stays, and the card offers a "Reconverter" button to re-download the audio. Configurable via the `AUDIO_CLEANUP_DAYS` env var (default `14`):

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

Cookies do YouTube expiram (geralmente algumas semanas a meses). Quando o erro de bot-check voltar a aparecer, repita os passos 1 e 2 pra regerar e reenviar o arquivo.
