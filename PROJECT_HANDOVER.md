# Mktradehome — Project Handover & Continuity Record

**Last updated:** 2026-11-14 (Ghana time; latest known development notes included through the end of this work session)  
**Purpose:** This is the working source of truth for continuing Mktradehome when a ChatGPT conversation reaches its length limit. Update this file after every major code, database, deployment, or test change.

> **Important:** This file records project knowledge, not passwords or secret values. Never put Supabase service-role keys, database passwords, Exness passwords, Telegram bot tokens, API secrets, or private access tokens in this file or in public GitHub files. Record only the *names* of required secrets and where they are configured.

---

## 1. Project identity and purpose

- **Project name:** Mktradehome
- **Type:** Private, personal trading analysis and trade-assistance dashboard.
- **Live website:** https://mktradehome.pages.dev/
- **GitHub repository:** https://github.com/mktradehome/mktradehome
- **Default branch:** `main`
- **Current hosting:** Cloudflare Pages project named `Mktradehome`.
- **Audience:** The owner only; this is not intended as a public trading product.
- **Main goal:** Help the owner analyse markets while trading through Exness, display clear setups and alerts, and let the owner decide whether to approve or reject a trade.
- **Critical operating rule:** No autonomous trading. A human must explicitly approve each setup. The system must never silently place a trade.
- **Trading account:** Exness MT5. Prior testing focused on the Demo account. The dashboard also contains a Real-account selector, but Real execution must remain disabled until Demo testing and all safety checks pass.

Mktradehome is an assistant, not a profit guarantee. Signals can be wrong, stale, or unavailable. Always validate live prices and risk before any trade.

## 2. Owner workflow and support preferences

- Give instructions in **small, simple steps**, especially when the owner is using an iPhone or web interface.
- Say exactly what to tap, open, or paste.
- Avoid long code hunts and repeated small replacement snippets. When code changes are needed, prefer one complete, clearly identified file or one complete copy/paste block.
- Do not ask the owner to repeat information already recorded here.
- Do not replace working features or rewrite the project just to fix one bug.
- Before changing code, inspect the current deployed/repository version and identify the exact relevant function.
- Explain the purpose and risk of a change before making it.
- The owner does not plan to use a VPS and has previously said they will not add $2,000 to the trading account. Do not make either a requirement.
- The owner has used an iPhone and a laptop for the project. The laptop was previously offline during a question about whether dashboard approval would still reach the trading bridge; connectivity must be checked before a live test.

## 3. Markets and analysis requirements

The original market set is:

| Dashboard symbol | Display name |
|---|---|
| `BTCUSD` | BTC/USD — Bitcoin / US Dollar |
| `EURUSD` | EUR/USD — Euro / US Dollar |
| `XAUUSD` | XAU/USD — Gold / US Dollar |
| `USDJPY` | USD/JPY — US Dollar / Japanese Yen |

- Market-monitor source has used BiQuote OHLC candles and quote data.
- Analysis timeframes: **5m, 15m, 1h, 4h**.
- Intended chart-reading flow: 4h and 1h for broader direction; 15m for confirmation; 5m for entry timing. The owner has also accepted 10m as an alternative in some manual chart reviews, but the current deployed monitor timeframe set recorded above is 5m/15m/1h/4h.
- The owner prefers signals to show BUY, SELL, or WAIT, with a clear entry, stop loss, TP1, TP2, and risk/reward where supported by the analysis.
- Preferred target planning has included R:R around 1:2 or 1:3. This is a preference, not a guarantee or a reason to force a signal.
- A prior monitor design required four-timeframe unanimous agreement before creating a BUY or SELL; otherwise it should return WAIT. Verify the current deployed implementation before changing this rule.
- Historical monitor validation rules included valid current price, market state exactly `open`, at least 60 candles, and valid ATR. Confirm the current implementation before relying on these historical notes.
- Never invent prices, quotes, candles, fills, or signal confidence.

## 4. Current dashboard features verified in repository source

The current `main` branch `index.html` was inspected on 2026-11-14. It includes:

### Login and account access
- Supabase JavaScript client v2 is loaded from jsDelivr.
- Login panel with email/password sign-in, account creation, and forgot-password controls.
- Dashboard is hidden until login.
- Sign-out button.

### Dashboard navigation
Three dashboard pages:
1. **Trading**
2. **Records**
3. **My Journey**

### Trading page
- System status and last-analysis display.
- Refresh Prices & Analysis control.
- Telegram Alerts connection/status control.
- Trading Account selector:
  - Exness Demo · Trial10
  - Exness Real · Real30 (LIVE ACCOUNT)
- Account monitor with refresh button and fields for balance, equity, used margin, free margin, currency, leverage, open-position count, and server.
- Market tiles and Market Analysis area.
- Trade Approval Centre with per-setup approve/reject workflow.
- The source explicitly says approval is account-specific and execution also depends on separate server-side and MT5 safety switches.
- The source warns not to enable execution until server-side live-price validation is completed.

### Records page
- Safety status.
- Daily recorded loss, trades recorded today, and consecutive losses.
- Configurable limits (current HTML defaults shown):
  - Maximum daily loss: GH₵5
  - Maximum trades per day: 5
  - Maximum consecutive losing trades: 3
- Save Safety Settings and Reset Daily Safety Counters controls.
- Manual completed-trade recording: market, BUY/SELL, Win/Loss/Break-even, and P/L in GH₵.
- Trade history.
- **Important limitation stated in the UI:** local safety counters are for tracking and are not enforced by the MT5 EA. Do not describe these dashboard counters as hard execution protection.

### My Journey page
- Market News Updates for BTC/USD, EUR/USD, Gold, and USD/JPY.
- Headlines are described as Google News feeds; news is context only and does not create trading signals.
- Personal project journey text.

### Other UI
- Dark trading dashboard with blue accents.
- Mobile-responsive layout.
- Floating Mktradehome AI Support chat interface.

**Repository inventory last confirmed in an earlier inspection:** root included `README.md`, `index.html`, `manifest.json`, `reset-password.html`, and `sw.js`; no `supabase/` folder was present at that time. Re-check the repository tree before assuming this inventory is still current. The full backend/EA source may be stored outside this GitHub repository.

## 5. Hosting and deployment

- Cloudflare Pages site: https://mktradehome.pages.dev/
- Cloudflare Pages project: `Mktradehome`.
- Previously recorded build settings:
  - Production branch: `main`
  - Build output directory: `.`
  - Root directory: blank
  - Automatic deployments: enabled
- A Cloudflare Zero Trust plan/payment screen previously appeared. The owner said they do not have a payment card. Do not make a paid Cloudflare plan or card a prerequisite without first checking whether the required feature can run on the Free plan.
- After a GitHub commit, verify the Cloudflare deployment completed and inspect the live page. A GitHub commit alone does not prove the live site is updated.

## 6. Supabase and backend — known facts and items to verify

Supabase is part of the project. The exact project reference/URL and complete schema were not confirmed in the handover material available at the time this file was created. Do not guess them.

Known historical backend details:
- A Supabase Edge Function named or referred to as `market-monitor` was deployed and its source had been recovered.
- The market monitor used BiQuote candles/quotes for BTCUSD, EURUSD, XAUUSD, and USDJPY.
- A five-minute scheduled invocation was previously part of the operating setup.
- A `market_signal_state` record/table was mentioned in prior debugging.
- Secret names previously mentioned:
  - `MARKET_MONITOR_SECRET`
  - Telegram bot token (secret value must remain private)
- Historical debugging found that the monitor did not insert rows into `trade_signals` or `trade_alerts`; this explained why those tables appeared empty at that time. This is a historical finding, **not proof that the issue still exists**. Inspect the current function and recent logs before making changes.
- Telegram alerts had been added previously.
- Do not expose Supabase service-role/secret keys in browser code. Only public/publishable/anon client credentials belong in a public frontend, with RLS correctly configured.
- Do not paste secrets into GitHub, this handover file, screenshots, or chat messages.

### Backend inventory to complete next
Inspect the actual Supabase project and record (without secret values):
1. Project name and project reference.
2. Tables and key columns related to market data, signals, approvals, trade queue, execution logs, account snapshots, and Telegram.
3. RLS status and policies for each exposed table.
4. Edge Function names and deployed versions.
5. Cron/scheduled jobs, exact schedule, and last successful run.
6. Function environment variable *names* only.
7. Recent function logs and errors.
8. Which component writes the approval queue and which component consumes it.
9. How duplicate approvals and stale signals are prevented.

Do not make schema or policy changes just to fill this document. Inspect first.

## 7. Exness / MT5 bridge and execution safety

- The owner trades through Exness.
- A separate MT5 Expert Advisor (EA) / bridge has been part of the setup. Prior logs included a message similar to `SUCCESS: Demo account` from `MktradehomeBridge (EURUSDm,H1)`.
- The owner has referred to an Exness Demo account and an Exness Real account. Current dashboard labels are Demo · Trial10 and Real · Real30; verify exact account/server mapping with the MT5 bridge before any action.
- The dashboard selector changes displayed account information and approval destination; the HTML explicitly says it does **not** enable trading by itself.
- Execution has been protected by two independent switches (server-side and MT5/EA). Keep both execution protections OFF until the Demo workflow is verified end to end.
- Real-account execution must stay disabled until a successful, controlled Demo test has passed and the owner explicitly authorizes any change.
- Never enable autonomous trading. Explicit user approval is required for every setup.
- Do not claim that approving a setup on the dashboard guarantees the order will reach MT5. The laptop/MT5 terminal, network, bridge, server function, account mapping, and EA must all be online and healthy.
- The owner has previously used 0.01 lot size in manual trading discussions. Do not hard-code this as the EA's approved lot size without inspecting the current EA settings and confirming the intended risk calculation.
- Do not claim the dashboard's local daily-loss/trade counters are enforced by the EA. The current UI says they are local tracking only.

### Execution flow intended by the owner
1. Mktradehome analyses the market and produces a candidate setup.
2. Normally GPT may independently review/verify the setup when available.
3. If GPT verification is unavailable, Mktradehome may provide its own clearly labelled fallback analysis.
4. The owner reviews the setup and explicitly approves or rejects it.
5. Only an approved setup may enter the MT5 execution queue.
6. Server-side and MT5 safety switches plus live-price/risk checks must still pass.
7. Record the outcome and logs.
8. No automatic trade without the owner's approval.

The owner accepted fallback operation for both Demo and Real analysis/approval, but this does **not** mean Real execution is authorized. Keep Real execution disabled until Demo is proven.

## 8. Latest known approval-price issue and reported fix

### Reported issue
The dashboard displayed:

`Approval failed: Price moved more than 0.05% from this fallback setup. Refresh analysis.`

The owner said this could happen even when the analysis was fresh.

### Latest known engineering update (2026-11-14)
A subsequent development note reported:
- The overly strict 0.05% price limit belonged to the fallback approval/server path.
- The dashboard had a different restored-setup price check based on 25% of the original stop-loss risk.
- A fallback approval v3 change was reported as deployed, using:
  - a scaled **25% of original SL-risk** price-movement rule,
  - setup age limit of **10 minutes**,
  - quote age limit of **30 seconds**.
- The error was attributed to the fallback approval/server path; the dashboard also had restored-setup price checks.
- **No successful approval/trade test had yet been completed after this reported fix.**

Treat the v3 deployment as reported, not independently verified. Before changing anything:
1. Inspect the deployed fallback approval function and current dashboard code.
2. Confirm the v3 logic and limits are actually deployed.
3. Check the latest invocation logs and exact returned error.
4. Confirm the live quote timestamp and setup timestamp.
5. Do not loosen or remove price/risk checks blindly.

### Last known test stopping point
The owner was waiting for a fresh signal labelled exactly:
`MKTRADEHOME VERIFIED — NOT GPT VERIFIED`

The intended test conditions were:
- Laptop online.
- Exness MT5 connected.
- Demo selected.
- Wait for a fresh signal.
- Review the setup/screenshot before approving.
- Test approval only after verifying the setup is fresh and the bridge is connected.
- No approval or completed trade test was confirmed in the latest note.

If this signal has not appeared, do not invent one or force a trade. First inspect monitor invocation, quote validity, and signal-generation conditions.

## 9. Historical monitor behaviour and known debugging findings

Earlier recovered monitor source/diagnostics recorded:
- Four markets: BTCUSD, EURUSD, XAUUSD, USDJPY.
- Timeframes: 5m, 15m, 1h, 4h.
- BiQuote OHLC and quote data.
- EMA/ATR-based analysis.
- Four-timeframe unanimous agreement required for BUY/SELL; otherwise WAIT.
- Price had to be valid, `marketState` exactly `open`, at least 60 candles available, and ATR valid.
- Telegram notification support.
- A five-minute schedule.
- `market_signal_state` was used.
- At the time of that diagnostic, no inserts were being made to `trade_signals` / `trade_alerts`.

These notes are useful debugging leads. The current deployed code and logs are authoritative; re-check them before making a fix.

## 10. Current priorities — do these in order

### Priority 1 — Preserve and inspect
- Do not rewrite the app.
- Confirm the live Cloudflare deployment and GitHub `main` commit.
- Inspect the current approval dashboard logic, fallback approval v3 function, monitor function, schedule, and MT5 EA/bridge status.
- Identify exactly which approval endpoint the UI calls and which queue the EA polls.

### Priority 2 — Complete one safe Demo test
- Ensure the owner is signed in.
- Confirm Demo is selected.
- Confirm MT5 terminal and bridge are online and mapped to Demo.
- Wait for a fresh valid setup.
- Confirm the setup label and timestamp.
- Review current price, entry, SL, TP1/TP2, direction, symbol, account destination, and risk.
- Owner explicitly approves or rejects.
- If approved, verify the approval record/queue and EA acknowledgement.
- Verify whether an order was placed on Demo and record its ticket/result.
- If approval fails, capture exact server response and logs; do not repeatedly retry blindly.
- If any connection or price is stale, stop and refresh rather than bypassing safety.

### Priority 3 — Verify records and alerts
- Confirm signal creation and persistence.
- Confirm approval/rejection history is recorded.
- Confirm Telegram alerts arrive and do not leak secrets.
- Confirm the dashboard reflects current account and trade status.

### Priority 4 — Only after Demo is proven
- Review risk limits and EA enforcement.
- Review Real account mapping and server-side safeguards.
- Keep Real execution disabled unless the owner separately and explicitly authorizes a controlled next step.

## 11. Do-not-break list

- Do not remove the four requested markets.
- Do not remove the 5m/15m/1h/4h analysis flow without agreement.
- Do not remove login, account selection, account monitor, Approval Centre, Telegram alerts, Records, News, or Journey pages as part of an unrelated bug fix.
- Do not remove explicit approve/reject control.
- Do not turn on automatic trading.
- Do not enable Real execution during Demo testing.
- Do not bypass stale-price, quote-age, setup-age, stop-loss, or account checks.
- Do not represent local dashboard safety counters as EA-enforced limits.
- Do not replace a working backend function with an unverified rewrite.
- Do not commit secret values or private account credentials.

## 12. Repository snapshot and change discipline

Verified repository:
- Owner/repo: `mktradehome/mktradehome`
- Branch: `main`
- Current inspected root files included: `README.md`, `index.html`, `manifest.json`, `reset-password.html`, `sw.js` (older inventory; verify current tree).
- Current `index.html` included the UI features documented in Section 4.
- Cloudflare Pages deploys from `main` with output directory `.` (last known setting).

For every change:
1. Read the current file/function first.
2. Make the smallest safe change.
3. Commit with a descriptive message.
4. Verify GitHub commit.
5. Verify Cloudflare deployment.
6. Test the actual page/function and inspect logs.
7. Update this handover with date, file/function changed, commit, test evidence, and remaining issue.

## 13. Details still missing — do not guess

The next developer/session must retrieve and record:
- Exact Supabase project URL/reference and project name.
- Exact names and deployed versions of all Edge Functions, especially monitor and fallback approval.
- Exact schema for signals, approvals, execution queue, account state, and logs.
- Exact cron job definition and last successful invocation.
- Exact BiQuote endpoint/configuration and any other data provider.
- Exact Telegram delivery function and secret variable names.
- Exact EA source filename/version, MT5 terminal/bridge URL or polling mechanism, and safety switch locations.
- Exact account/server identifiers for Demo and Real (do not put passwords here).
- Current deployed commit SHA and Cloudflare deployment ID.
- Whether the fallback approval v3 fix is actually live and whether a successful Demo approval has since been completed.

## 14. New-chat continuation prompt

When starting a new ChatGPT conversation, paste this file or provide its GitHub link and say:

> Continue Mktradehome from this handover. First read the current GitHub and deployed versions before changing anything. Keep all working features. Give me one small step at a time. Our immediate priority is to verify the fallback approval v3 price-check fix and complete one safe Demo approval test. Do not enable Real execution or autonomous trading. Update this handover after meaningful progress.

---

## 15. Change log

| Date | Update |
|---|---|
| 2026-11-14 | Created initial continuity record from current repository inspection and available project history. Recorded dashboard features, hosting, intended approval workflow, safety constraints, prior monitor findings, and the latest reported fallback approval v3 change. Backend schema, secrets configuration, and EA implementation still require direct inspection. |
