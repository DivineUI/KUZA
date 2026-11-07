# KUZA

Pre-harvest tomato marketplace for Rwanda, with storage and transport coordination.

## Run it
1. Delete any old `db.json` (the old test data has no accounts).
2. `npm install`
3. `npm start` (from this folder, the one that contains `package.json`)
4. Open http://localhost:3000

The first time the server starts it prints the KUZA Operations login (email ops@kuza.rw and a random password).
Save it, it is shown once. To choose your own password, start with (PowerShell):

    $env:KUZA_OPS_PASSWORD="your-password"; node server.js

## Approving accounts
New farmers and businesses sign up for free, but cannot forecast or order until KUZA approves them.
Sign in as operations, open **Operations > Applications**, review the details (farm photos, cooperative, seasons, website), then Approve or Reject.
Farm photos are saved in the `uploads` folder and are only visible to the farmer and KUZA operations.

## Pages
- index.html: landing page
- login.html: sign in and create account
- buyer.html: marketplace and "My orders"
- farmer.html: farmer dashboard
- ops.html: KUZA operations

## Before real use
- Replace the placeholder fee, deposit and cancellation rules (ops page and server.js).
- Serve over HTTPS and add "Secure" to the session cookie in server.js.
- Replace images/crates.jpg with a licensed photo (it carries a stock watermark).
- Replace db.json with a real database when you have real users.

## Notifications
When KUZA approves or rejects an account, the server logs a notice and stores it in `db.json` (`outbox`).
To send real SMS or email, set `KUZA_NOTIFY_WEBHOOK` to the URL of your SMS/email service or automation tool.
Each notice is POSTed to it as JSON: `{ to: {name, email, phone}, subject, message, at }`.

## Farmer profile
Farmers can edit their phone, cooperative and season estimates at `profile.html`.

## New in this version
- **Glut Radar** (`radar.html`, `/api/radar`): forecast kg per week, glut weeks flagged, and harvest-timing tips for farmers.
- **Cold rooms**: farmers request storage for harvested tomatoes with no buyer; KUZA operations confirms with Cold Solutions Rwanda; buyers see "Ready now, in cold room".
- **Certified agents**: operations adds agents (Operations > Add certified agent). Agents record grade and measured kg at `agent.html`; buyers see the result.
- **Farmer trust score** (0-100) from forecast accuracy, verified quality and cancellations.
- Buyer location filters always list every province and district.

## Hosting
Set these environment variables: `NODE_ENV=production`, `KUZA_OPS_PASSWORD`, and `KUZA_DATA_DIR` (a path on a persistent disk).
`db.json` and `uploads/` live in that folder, so it must survive restarts. Never commit them (see `.gitignore`).
