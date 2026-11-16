# Mktradehome — Project Status and Next Build Plan

Last updated: 2026-11-16 (updated after independent engine deployment)

## Project
- Private personal trading assistant for use with Exness.
- Dashboard: https://mktradehome.pages.dev/
- Supabase project: Mktradehome (`pjwqyveitncygamaaybi`).
- Supported markets: BTCUSD, EURUSD, XAUUSD, USDJPY.
- User works from iPhone and prefers short, simple, one-step-at-a-time instructions.
- Normal trade size target: 0.01 lot.
- No VPS; avoid paid upgrades and do not assume extra API budget.

## Current deployed services (verified 2026-11-16)
- `market-monitor` v48 — ACTIVE; cron scans every 5 minutes. It fetches quotes/candles, applies technical prefilters, and now generates independent fallback candidates when GPT is rate-limited, unavailable, invalid, or does not verify a candidate.
- `gpt-market-analysis` v8 — ACTIVE; OpenAI API has recently returned HTTP 429 rate-limit errors. This blocks GPT-verified signals, not market scanning itself.
- `mt5-bridge` v30 — ACTIVE; dashboard snapshots support Demo and Real as read-only views.
- `create-mt5-fallback-approval` v4 — ACTIVE; validates an independently generated Mktradehome fallback candidate and permits Demo approval only.
- `create-mt5-real-approval` v3 — ACTIVE; returns HTTP 403 and blocks Real approvals.
- `create-mt5-approval` v17 — ACTIVE.
- `create-mt5-fallback-approval` checks that a candidate was created with source `mktradehome-independent-fallback`, timeframe confirmation, fresh quote, and 1:2 / 1:3 risk-reward. `market-monitor` v48 now calls the independent generator during GPT cooldown/failure paths and saves explicitly labelled `NOT_GPT_VERIFIED` candidates, alerts, and Telegram notifications when all checks pass. The first post-deployment scheduled run must still be verified in live logs and database rows.
- `market_monitor_control.global_gpt_cooldown` limits GPT calls to protect the available API allowance and respects Retry-After responses.

## Agreed independent signal engine
Build a rule-based Mktradehome engine so the app continues scanning and can create clearly labelled Mktradehome-only signals when GPT is rate-limited or unavailable.

Markets:
- BTCUSD
- EURUSD
- XAUUSD
- USDJPY

Analysis:
- Use completed candles only.
- 4H and 1H determine directional bias.
- 15M and 5M confirm entry direction; reject clear lower-timeframe conflict.
- Require fresh live quote and sufficient candle history.
- Produce BUY, SELL, or WAIT.
- For BUY/SELL, calculate entry, Stop Loss, TP1 (minimum 1:2 reward/risk), TP2 (minimum 1:3 reward/risk).
- Store timeframe readings, quote freshness, rule checks, and source metadata for audit.
- Label signals clearly as “MKTRADEHOME VERIFIED — NOT GPT VERIFIED”; never represent them as GPT-approved.
- Keep GPT as an optional second opinion; GPT unavailability must not suppress a valid independent candidate.
- Avoid duplicate alerts and expire stale candidates.
- Test and paper-trade on Demo before relying on performance.

## Trade approval and account safeguards
- Demo: allow the user to review and approve eligible, fresh, independently generated candidates through the existing fallback approval route. Approval is not the same as order execution.
- Real account: preserve the Real account selector, dashboard visibility, and read-only snapshot monitoring. Do not remove or hide the Real account.
- Real trade execution/approval is currently locked by `create-mt5-real-approval` v3. Do not silently change this lock. Before enabling real approvals, verify the separate Real MT5 bridge, account identity, live quote freshness, order sizing, SL/TP enforcement, duplicate protection, and emergency stop. The user wants Real trading retained, not removed; explain clearly that the current lock remains until those checks pass.
- Never place a live-money trade without explicit user approval.
- Maintain required Stop Loss and Take Profit and the 0.01-lot starting limit unless the user explicitly changes it after review.

## Immediate implementation checklist
1. Verify the first `market-monitor` v48 cron run: live quote/candle checks, fallback candidate inserts, alert delivery, and absence of runtime errors.
2. Confirm the dashboard restores new fallback candidates and the Demo approval route accepts only fresh, validated candidates.
3. Test expiry, duplicate suppression, and alert delivery end-to-end on Demo.
4. Run additional Demo-only paper tests and review signal quality before relying on results.
5. Keep the Real account visible and its existing separate safety gate intact until independently verified.

## Recent changes already completed
- Added dashboard passcode screen using PBKDF2/SHA-256 and browser-local salt/hash.
- Restored Real account selector and read-only snapshot display.
- Added/maintained Demo-only fallback approval route.
- Added GPT cooldown control and deployed `market-monitor` v46 to reduce rate-limit waste.
- Kept real-money approvals locked pending separate Real connection and safety verification.

## Important limitation
This document records the verified project state and agreed next implementation. It does not claim that the independent signal engine is already connected or that Real trade execution is enabled.
\n\n## Independent engine implementation (2026-11-16)\n- Deployed `market-monitor` v48 with a server-side rule-based fallback path. It runs when GPT is in cooldown, returns an error/invalid response, or does not pass verification. GPT rate-limit cooldown is preserved.\n- Uses completed candles only as returned by the existing candle fetcher; requires at least 60 bars per timeframe. 4H and 1H must agree; 15M/5M must not oppose, and at least one lower timeframe must confirm.\n- Requires quote `stale === false`, quote age <=30 seconds, and open market except BTCUSD.\n- Entry is the live bid/ask midpoint. Stop distance is volatility-based: max(1.5 x 15M ATR, 2 x 5M ATR). TP1 = 2R; TP2 = 3R. Candidate confidence field is a fixed heuristic display score, not a probability.\n- Persists `source=mktradehome-independent-fallback`, `analysisMode=MKTRADEHOME`, `fallbackVerified=true`, `gptVerified=false`, `verificationStatus=NOT_GPT_VERIFIED`, timeframe data, quote freshness, and risk checks. Sends a clearly labelled alert and Telegram notification.\n- Duplicate candidates are suppressed for the 10-minute candidate window and when an active Demo approval/execution exists. The existing fallback approval route remains Demo-only and unchanged; it rechecks candidate age, fresh live price, timeframe agreement and 1:2/1:3 risk-reward.\n- Dashboard already restores recent fallback candidates from `trade_signals`; it only presents an actionable setup while the saved candidate and current quote remain fresh.\n- `create-mt5-real-approval` v3 was not changed. Real account visibility and read-only monitoring remain; Real approval stays locked.\n- Source backup: `supabase/functions/market-monitor/index.ts`. Deployment is live, but the first successful scheduled run and end-to-end Demo approval still require verification.\n