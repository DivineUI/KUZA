# KUZA

Pre-harvest tomato marketplace for Rwanda, with storage and transport coordination.
Available in English and Kinyarwanda, with an AI assistant.

## Run it on your computer
1. `npm install`
2. `node server.js`
3. Open http://localhost:3000

For Render, use a **Web Service** (not a Static Site), set the Build Command to `npm install`, the Start Command to `npm start`, and add a health check path of `/api/health`. The service must run the Node server, not just publish the `public` folder. If the current Render service is a Static Site, create a new Web Service for this project and deploy the repository there.

The first start prints the KUZA Operations login (ops@kuza.rw and a password). To choose your own password
(PowerShell): `$env:KUZA_OPS_PASSWORD="your-password"; node server.js`

## Settings (Render: Environment > Environment Variables)
| Variable | What it does |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL. Keeps your data when Render restarts. |
| `SUPABASE_KEY` | Your Supabase **secret** key (sb_secret_...). Never use the publishable key. |
| `KUZA_OPS_PASSWORD` | Password for the operations account. |
| `NODE_ENV` | Set to `production`. |
| `GEMINI_API_KEY` | Free key from Google AI Studio. Turns on the AI assistant. |
| `GEMINI_MODEL` | Optional. Defaults to `gemini-3.5-flash-lite`. Set this only if you want another model supported by the Gemini API. |

Run `supabase.sql` once in Supabase (SQL Editor) before the first start with Supabase variables set.

## The AI assistant
- Without `GEMINI_API_KEY`, or if Gemini is busy, unavailable or over its quota, the assistant answers from a built-in FAQ.
- The `/api/health` endpoint reports whether the backend is running and whether an AI key is configured. It never exposes the key. If Render already has a `GEMINI_MODEL` variable set to an older model, change it to `gemini-3.5-flash-lite` or remove it to use the new default. The server also tries the lightweight model if the configured model fails.
- To change what it knows, edit `KNOWLEDGE` and `FAQ` in `server.js`.
- Limits: 15 messages per visitor per 10 minutes, and 400 AI answers per day for everyone (protects the free quota).

## Translations
All Kinyarwanda text is in the `RW` dictionary and `RWX` pattern list in `public/common.js` (English text on the left, Kinyarwanda on the right). Dynamic text nodes created with `textContent` and `innerHTML` are translated too. Text that is not in the dictionary or patterns stays in English. Have a native speaker review it before real use.

## Approving accounts
Sign in as operations, open Operations > Applications, review, then Approve or Reject.

## Before real use
- Replace db.json with a real database when you have real users.
- Review the Kinyarwanda translations and the assistant's answers.
- Replace images/crates.jpg with a licensed photo (it carries a stock watermark).
