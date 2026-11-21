# Mktradehome — Current Project Status

Last verified: 2026-11-19 04:02 UTC

## Project and safety
- Private personal Exness trading assistant; dashboard: https://mktradehome.pages.dev/
- Markets: BTCUSD, EURUSD, XAUUSD, USDJPY.
- Demo-first. User manually approves trades; approval does not itself place an order.
- Automatic trade execution is not enabled by this project work.
- Real account remains read-only and locked from approvals.
- Preserve 0.01-lot starting size, live-price checks, required SL/TP, duplicate prevention and expiry. Never weaken safeguards just to increase signal count.

## Verified deployed services
- `market-monitor` v63 — ACTIVE production signal engine. Scheduled requests in recent logs returned HTTP 200; recent executions were approximately 2.4–3.3 seconds.
- `market-monitor-v100-shadow` v5 — ACTIVE, isolated read-only strategy shadow. No production writes, alerts, approvals, queue items or trade execution.
- `market-monitor-v100-backtest-shadow` v11 — ACTIVE, authenticated historical replay; isolated from production trading state.
- `market-foresight` v3 — ACTIVE, authenticated baseline forecasting and historical candle archiving; no trade approvals, queue writes or execution.
- `create-mt5-approval` v22 — ACTIVE. Its isolated proof validator also checks that the saved quote price is exactly the bid/ask midpoint. Server-side validation now uses the exact independent engine scoring and multi-timeframe rules, including valid 15M pullback reversals and 5M veto logic.
- `mt5-bridge` v30 — ACTIVE. Dashboard queue and account-snapshot reads return HTTP 200 in recent logs.

## Signal rules
- 1H sets direction and must score at least +12 for BUY or -12 for SELL.
- 4H must not strongly oppose the 1H direction (opposition score no worse than -30).
- 15M structure must align, or a qualifying pullback reversal must reclaim the trend-side EMA50 with 5M momentum back in the 1H direction.
- 5M is an entry veto only when strongly opposed (opposition score below -40).
- Entry must remain within 0.75 of 15M ATR from the reference close.
- Risk distance is max(1.5 × 15M ATR, 2 × 5M ATR, 2.5 × spread); TP1 = 2R and TP2 = 3R.
- Quotes must be fresh (30 seconds or less) and the market must be open.
- Quality score is a rule-quality heuristic, not win probability.

## V100 validation
- V100 is currently a shadow copy/baseline of the V62 strategy, not yet a proven improved strategy.
- The separate shadow backtest uses completed candles, waits until the 15M signal candle closes, and enters at the next 15M candle open to reduce look-ahead bias. It warms up all four timeframes before scoring and reports the actual common coverage, not just the requested date range.
- It uses the same V100 candidate builder and validation helpers. The single full-position exit is TP1 at 2R, matching the current MT5 queue's single take-profit field; TP2 is reference-only.
- Backtest results are gross simulations. BiQuote documents OHLC as rolling windows (up to 288 M5, 192 M15, 168 H1 and 180 H4 bars), not an unlimited archive. The common test window is therefore far shorter than 14 days; the dashboard reports actual overlapping coverage, warns when it is short, and excludes setups that have not closed by the end of the history window from win-rate/profit-factor metrics. Historical bid/ask spread is unavailable, so replay uses bid=ask and omits the live spread component from stop sizing. Commission, swap, slippage, market closures and broker fills are also not modelled. Do not treat gross results as expected live performance.
- Do not promote V100 to production until code tests, runtime tests, fair out-of-sample backtests and explicit approval are complete.

## Approval verification repair
- The earlier server validator incorrectly required all timeframe categorical labels to agree. That contradicted the live engine, which uses score-based rules and allows a defined 15M pullback reversal and 5M WAIT.
- v22 now recomputes the exact score from saved indicator evidence and validates 1H direction, 4H conflict limit, 15M structure/pullback, 5M veto, entry extension, ATR/spread risk geometry and heuristic quality score.
- Pure validation logic is isolated in `supabase/functions/_shared/approval-proof.ts` with deterministic tests for BUY and SELL setups, pullback reversals, 5M conflict rejection, tampered targets, stale candles and mismatched quote midpoints in `approval-proof.test.ts`.
- Added regression fixtures copied from two real persisted production candidates (XAUUSD SELL #437 and EURUSD SELL #438). These verify that the stored proof shape, midpoint quote, indicator evidence and exact ATR/2R/3R geometry pass the same server-side validator; both tests pass in CI.
- Approval still rechecks a fresh independent live quote and entry deviation server-side. No automatic order execution was added.

## Latest live scan and approval state (2026-11-19 03:25–03:26 UTC)
- Production `market-monitor` v63 completed a scan and saved EURUSD SELL candidate #438 at 03:25:03 UTC, with a 10-minute expiry (03:35:03 UTC). The dashboard successfully fetched saved `trade_signals` rows with HTTP 200 at 03:26:02 UTC.
- The same scan correctly returned WAIT for BTCUSD and XAUUSD because the current quote was more than 0.75 of 15M ATR from the reference close, and WAIT for USDJPY because the 15M entry rule was not met. These are deliberate rule outcomes, not a broken signal engine.
- The MT5 approval queue had zero rows in `approved` or `executing` state at the last database check. A signal being saved does not create an approval; the user must manually approve it while it is still fresh. No order is placed by the approval function.

## MT5 connection status
- The latest Demo account snapshot is `2026-11-18 01:06:45 UTC`; it is stale and must not be treated as a live account heartbeat.
- The dashboard's authenticated queue/snapshot polling works (HTTP 200), but polling the dashboard is not evidence that the MT5 EA is connected.
- The EA source is not present in this GitHub repository. True live individual-position tracking still requires the MT5 EA to report open positions to the authenticated bridge. Do not fake live prices or position status.
- Latest known queue counts: 10 executed, 7 expired, 12 failed; 10 closed trade journal records. These are historical records, not current open positions.

## Repository and CI
- `supabase/functions/market-monitor/index.ts` is synchronized with the deployed V62 production source; do not accidentally deploy the older pre-V62 helper implementation.
- GitHub Actions now runs type-checks for production and shadow Edge Functions, dashboard inline JavaScript syntax checks, deterministic approval-proof tests and legacy fixtures on pushes and pull requests to main. Latest run `44451470572` for commit `3ad950668fd2407f5aa810d0d89859f3ceb50f7b` completed successfully (2026-11-19).
- Legacy shared-engine tests are retained and explicitly labelled legacy; they are not proof of production V62 parity.

## Remaining work
1. Confirm CI passes for the synced production and approval sources.
2. Run the authenticated V100 shadow backtest from the dashboard and inspect all four markets.
3. Obtain a fresh Demo MT5 EA heartbeat; then test one manual Demo approval and the complete execution/reporting cycle.
4. Locate or add the MT5 EA's individual open-position reporting path before claiming MT5-like live trade overlays are fully live.
5. Compare V62 and V100 on identical completed-candle data and out-of-sample periods before any production promotion.


## MT5 live-position integration work (2026-11-19)
- Re-inspected the deployed `mt5-bridge` v30 source and current public-schema columns. The bridge supports authenticated dashboard queue reads, account-level snapshots, execution reports and verified close reports, but it does not yet accept or persist a list of currently open positions.
- Re-inspected the complete GitHub repository tree. No MQL5 EA source file (`.mq4` or `.mq5`) is present, so the client-side reporting code cannot safely be updated from this repository.
- Saved the proposed EA-to-bridge payload, validation rules, dashboard behavior and acceptance tests in `docs/MT5_POSITION_REPORTING.md`. This is a design contract only; it is not a deployed endpoint and must not be represented as a working live feed.
- Next implementation step: obtain the exact MktradehomeBridge EA source, then implement the authenticated Demo-only position snapshot endpoint, private persistence, dashboard read action and EA polling together. Keep Real mode read-only. Reject incomplete snapshots and never infer closures from partial data.
- No database schema, execution gate, approval rule or live trading behavior was changed in this session.


## Chart overlay integrity correction (2026-11-19 03:35 UTC)
- Reviewed the live chart overlay against the actual `mt5-bridge` v30 API and database schema. The bridge currently exposes the execution queue, not a broker-confirmed open-position snapshot.
- Corrected `index.html` so the chart overlay now displays only `approved` and `executing` queue entries as pending setup references. It no longer treats `executed` queue history as proof that a position is currently open.
- Updated the card title and status labels to make clear that an approved setup is not yet open, and execution-in-progress is not confirmed open. Market-price movement is explicitly not represented as broker floating P/L.
- The actual live position feed remains unimplemented until the MT5 EA can send authenticated complete position snapshots and the bridge/database/dashboard path is deployed and tested.
- Frontend change commit: `3b9e0384046e47dc8999ee1a6f34d8ee6801fd9f`.


## Market Foresight Engine direction (2026-11-19)
- Captured the user's ambition to make Mktradehome deeply analyse markets and estimate future price paths/outcomes.
- Created `docs/MARKET_FORESIGHT_ENGINE.md` as the governing research/build contract: timestamped observation, market-regime context, calibrated probabilistic scenarios, cost-aware decisioning, walk-forward evaluation and Demo-first governance.
- Explicitly distinguishes forecasting from certainty: Mktradehome cannot control/manipulate external markets or guarantee future prices/profits. It must abstain when evidence/data quality is inadequate.
- V100 remains a read-only V62-strategy shadow, not a validated predictive AI model. No production strategy, risk gate, approval or execution path was changed in this work.
- Current rolling candle history is inadequate for robust long-horizon training; a verified historical archive and forecast/outcome dataset are prerequisites.
- Saved specification commit: `2f4041d8cbdace5dcfcf8859179e170e5c8c6ba4`.


## Market Foresight implementation (2026-11-19 03:51 UTC)
- Deployed Supabase Edge Function `market-foresight` v6 ACTIVE. It authenticates the signed-in dashboard user through Supabase Auth (or accepts the existing monitor secret server-to-server); the service credential stays server-side.
- Created four RLS-protected tables: `market_candle_archive`, `market_quote_archive`, `market_foresight_forecasts` and `market_foresight_outcomes`. Direct `anon` and `authenticated` table privileges are revoked; the Edge Function's service role is the only intended writer/reader.
- The function retrieves completed BiQuote OHLC for BTCUSD, EURUSD, XAUUSD and USDJPY on 5M/15M/1H/4H, validates timestamp freshness, OHLC geometry and cadence, then deduplicates archive rows by symbol/timeframe/candle timestamp. It also archives provider bid/ask, spread, quote age, market state and timestamp provenance for cost-aware research.
- Baseline v0.1 produces explicit 15M/1H/4H expected-price scenarios and approximately 90% normal-assumption price intervals using recent 5M log-return drift and volatility. Directional bias is qualitative. Numeric UP/DOWN/SIDEWAYS probabilities are null and marked NOT CALIBRATED; this is not an ML model or proven predictive edge.
- Each scan saves forecast records. Later scans evaluate matured forecasts against archived completed 5M candles and save realized return, high/low, absolute expected-price error and interval coverage. No outcome is invented if the required candle evidence is missing.
- Added a Market Foresight dashboard card. It runs on sign-in and refreshes every five minutes while the dashboard is open, with a manual Run Foresight Scan button. It displays reference price, directional scenario, expected price and range for each horizon.
- The feature is shadow-only. It does not modify V63 signal logic, approval rules, MT5 queue, risk controls or execution. No automatic orders were enabled.
- Security advisor reports the new RLS-protected tables have no user policies; this is intentional because direct user access is revoked and only server-side service access is intended. Other pre-existing project advisories remain.
- Live runtime invocation has not yet been confirmed from this tool session; the first dashboard scan is the next end-to-end acceptance check. Do not call the archive populated or forecasts live until the function has successfully run and database rows are verified.
- Supabase deployed function v5; GitHub source synced. Latest function source commit: `2fbb4a129630c78ac685e1fe9abe6b62a527834e`; applied quote archive schema documented in `docs/sql/market_foresight_foundation.sql`. Frontend commit: `2bca68c457ddacc765d816d1c8bac15545722e17`; function source commit: `cbb60c6d8230be912ed3ae6ca4f6f5bb7ba6fc8b`; CI workflow commit: `a6b9b87399a05f7690f813a50fbd04e21b6ec0e5`.

- Added `market_quote_archive` as a separate migration and deployed function v5; the quote archive is designed to preserve bid/ask and spread evidence rather than assuming zero spread in future evaluation.


## Market Foresight CORS repair (2026-11-19 04:02 UTC)
- User reported dashboard error: "Failed to send a request to the Edge Function."
- Supabase function logs showed successful OPTIONS preflight requests but no corresponding POST requests. This isolates the failure to browser preflight negotiation before the function handler runs.
- Root cause: `Access-Control-Allow-Headers` omitted Supabase client's `x-client-info` and `x-supabase-api-version` request headers.
- Added the full Supabase client header allowlist: authorization, x-client-info, apikey, content-type, x-monitor-secret and x-supabase-api-version.
- Deployed `market-foresight` v6 ACTIVE and synced source to GitHub. Commit: `cd5aef32417338996c84ea8af0c344be41ab567e`.
- This repairs the identified preflight blocker. A subsequent authenticated POST and first successful data archive still need to be confirmed from runtime logs and database row counts.


## Market Foresight first successful live scan (2026-11-19 03:57 UTC)
- The user confirmed the dashboard now reports LIVE with 12 forecasts saved and 3,120 candle observations archived. This confirms the browser CORS repair allowed the authenticated scan to complete.
- Independently queried Supabase: `market_candle_archive` contains 3,120 rows (latest capture 03:55:56 UTC); `market_quote_archive` contains 8 rows (latest observation 03:57:34 UTC); `market_foresight_forecasts` contains 24 rows (latest generated 03:57:35 UTC); `market_foresight_outcomes` contains 0 rows.
- All 24 forecast rows are PENDING: 8 each for 15M, 1H and 4H, generated across two scans between 03:55:54 and 03:57:34 UTC. Therefore zero matured outcomes is expected at this early stage; the first 15M forecasts need at least 15 minutes and later scans before evaluation can occur. 1H and 4H require their full horizons.
- Dashboard's “12 forecasts saved” represents the latest scan's 4 markets × 3 horizons; the database's 24 rows include both successful scans. No discrepancy in the pipeline.
- Current forecast directions and ranges are uncalibrated statistical scenarios only. Do not treat them as win probabilities, trade instructions or evidence of predictive edge. Keep the foresight engine isolated from approvals, queue and execution.
- The CORS blocker is resolved and the first live archive/forecast write is verified. Next acceptance test: allow forecasts to mature, run another scan, and verify outcome rows are written only where completed 5M candle evidence exists. Latest observed database totals are a point-in-time snapshot, not a permanent count.


## Read-only cross-engine integration (2026-11-19 04:08 UTC)
- Added a Unified Market Context panel to the dashboard. It combines the latest successful Market Foresight scan response with the existing saved `market_analysis_snapshots` produced by the V63 technical intelligence pipeline.
- For BTCUSD, EURUSD, XAUUSD and USDJPY, the panel displays technical intelligence bias/regime and 4H/1H/15M/5M context beside the 15M/1H/4H foresight directions. It labels horizon relationships as aligned, diverging, mixed or without clear agreement.
- This is deliberately a display-only comparison. It does not calculate a new BUY/SELL signal, alter V63 scoring, modify signal proofs, change approval eligibility, update risk limits, write to trade tables, or interact with the MT5 queue.
- Foresight remains an uncalibrated recent-drift/volatility baseline. Alignment is not a probability, confirmation of predictive edge, or trade instruction. Missing or abstained engine data is shown as unavailable rather than inferred.
- The panel retains the latest successful foresight response in dashboard memory and refreshes its comparison when either engine refreshes. No new database tables, policies, secrets or Edge Function deployments were required.
- Frontend commit: `6c7d74665e1b554f46fc4a9da91832b57d6e053a`.
- GitHub Actions run `44456169281` (engine/approval tests) and Pages deployment run `44456168803` were triggered by this commit; both were queued/in progress at the time of this status update. Do not call the change deployed or tests passed until both runs complete successfully.
- Next safe step: verify CI and Pages deployment, then visually inspect the Unified Market Context panel on the live dashboard. Keep production engine V63 unchanged while collecting forecast outcomes.


## Opportunity Intelligence implementation (2026-11-19)
- Added a read-only Opportunity Intelligence dashboard panel. It lists a market as a current opportunity only when the existing V63 analysis already contains a BUY/SELL candidate with engine verification PASSED, a candidate ID, fresh quote flag, valid entry/SL/TP values and passing 2R/3R geometry.
- The panel never generates a signal, changes V63 rules, upgrades a WAIT, changes approval eligibility, or writes to approvals, queue or trade tables. Manual approval remains separate.
- Market Foresight is used only as supporting context. The panel compares fresh 15M and 1H directional scenarios with the already-verified V63 direction and labels alignment, divergence, mixed/sideways, or unavailable/stale context. Forecasts remain uncalibrated and cannot create or invalidate a technical candidate.
- If no current candidate passes the existing checks, the panel explicitly displays WAIT rather than manufacturing an opportunity.
- Frontend commit: `34896e93267d966197cd51c1fea3f1890deb4318`.
- Previous GitHub Pages deployment run `44456204007` completed successfully, including Jekyll build, artifact upload and deploy. This confirms the preceding Unified Market Context commit was deployed through GitHub Pages; it does not independently verify Cloudflare Pages at `mktradehome.pages.dev`.
- The Opportunity Intelligence commit has just been saved. Its engine/approval CI and Pages deployment runs must be checked before calling this new panel tested or live.


## Forecast outcome integrity and performance scorecard (2026-11-19)
- Database inspection before this correction showed 48 forecasts pending and 0 saved outcomes. The old evaluator used the latest live quote as the realized price after a forecast matured. That was not a valid horizon-specific measurement and could distort forecast evaluation.
- Replaced that method with a read-only-tested resolver that uses the first completed archived 5M candle whose close reaches or passes the forecast's expiry. It derives realized horizon return, high/low over the forecast window, absolute price error and interval coverage from archived candle evidence. It never substitutes a later live quote.
- If the horizon-end candle is missing, malformed or not yet mature, the forecast remains PENDING; the engine abstains instead of inventing an outcome. The horizon endpoint is rounded to the first completed 5M candle close at/after expiry.
- Outcome inserts now map only to columns confirmed in the existing `market_foresight_outcomes` schema; no database schema, RLS policy or grants were changed.
- Added a server-side, service-key-only summary using the latest 2,000 saved outcomes joined to their forecast records. Dashboard scorecard reports overall and 15M/1H/4H: evaluated sample count, directional accuracy where both expected and realized return are non-zero, mean absolute return error in percentage points, and point-horizon interval coverage. It explicitly labels small samples as early/descriptive and never represents these metrics as calibrated probabilities.
- Added deterministic tests for exact horizon-close selection, early/missing/invalid evidence abstention, floating-point-safe outcome calculations, performance metrics, orphan rows and empty samples.
- CI run `44456923751` passed: production/shadow Edge Function type-check, dashboard inline JavaScript syntax, new forecast performance tests, new horizon resolver tests, independent approval proof tests and legacy fixtures.
- Deployed `market-foresight` version **7 ACTIVE**. Deployment hash: `76533e09cc7e7e456043e7ee63ce490167103fd31e6163046beee704748e684c`. Deployed imports were verified in the active function source.
- GitHub source commits: resolver `1bd2336e155d3978693f419b2f3251842cb4cb94`, outcome schema mapping `aeb6d292f208853a9f4a9ba23eaa8d35b363c99c`, performance summary `e94bf835db83637f03607e1b8e7e3b2728dcdb51`, dashboard scorecard `490c42bf8593174a69757b6b8c1a6964f2638d04`, final duplicate-import correction `d220545664d093dee22fe609666f8eb345c33966`.
- Latest GitHub Pages deployment for the dashboard scorecard (run `44456923712`) was still building when this status note was written. Cloudflare Pages at `mktradehome.pages.dev` has not been independently verified.
- Next validation: run the deployed foresight scan and confirm it writes outcomes only when horizon-close candles exist; then verify the scorecard reads the persisted outcomes. Do not claim forecast accuracy or a profitable trading edge until a meaningful sample has accumulated and been independently reviewed.


### Final validation and deployment update
- Added bounded batching for historical forecast-to-outcome joins (250 forecast IDs per PostgREST request) so the scorecard does not build an oversized URL as its sample grows.
- Clarified in the dashboard that repeated rolling forecasts overlap and are correlated; their outcomes are not independent samples.
- Deployed `market-foresight` **version 8 ACTIVE** with the batching improvement. Deployment hash: `40e779027cee89c607dabf3e95c52edb6e8c690e8ec135607ef1d687a0f2093c`.
- Latest engine/approval CI run `44457074308` passed all checks, including the two new foresight test suites, approval proof tests and existing fixtures.
- Latest GitHub Pages build/deployment run `44457074075` was still building when this update was written. The site at Cloudflare Pages `mktradehome.pages.dev` remains unverified from this environment.
- Runtime validation is still pending: no post-deployment `market-foresight` invocation appeared in the checked Edge Function log window. The first dashboard scan after opening the updated dashboard should exercise version 8 and populate the scorecard when completed horizon-close candles are available.


## Market-specific measured forecast context (2026-11-19)
- Extended the existing read-only forecast performance summary with per-market, per-horizon metrics in addition to the existing overall and horizon summaries. Metrics are matched through persisted forecast IDs and retain the existing 2,000-outcome sample cap.
- Opportunity Intelligence now displays measured 15M and 1H forecast history for the same market beside an already verified V63 candidate. It reports no measurement when no outcomes exist; below 30 outcomes it explicitly labels the evidence EARLY SAMPLE and does not use it to rank, approve or validate the setup. At 30 or more outcomes it shows descriptive directional accuracy, mean absolute return error and interval coverage, with an explicit warning that these are not win probabilities.
- This is supporting historical context only. V63 remains the sole source of trade eligibility; Market Foresight cannot create, remove, rank or approve a candidate. No production signal rules, approval logic, queue, execution, database schema, RLS or grants were changed.
- Added deterministic assertions for per-market/per-horizon grouping. Dashboard refreshes the Opportunity Intelligence panel after each successful foresight scan so it cannot silently show stale scorecard context as current.
- Supabase breaking-change review: the November 2026 changelog entries reviewed do not affect this change; no Supabase SDK, Data API, auth, schema or deployment configuration was modified.
- CI run `44457697371` completed successfully: production/shadow Edge Function type-check, dashboard inline JavaScript syntax, forecast performance tests (including per-market grouping), horizon outcome tests, independent approval proof tests and legacy fixtures all passed.
- Deployed `market-foresight` **version 9 ACTIVE** with the per-market/per-horizon performance payload. Deployment hash: `f4603fccbc11e2b624c376d8d8f01a2c4e8b8ab64add1a15b02410d18497522e`. Active function source was re-read and confirms the shared performance helper is included. No database schema, RLS or grants changed.
- GitHub Pages build/deployment run `44457697432` was still in progress at the time of this status update. Cloudflare Pages deployment and post-v9 runtime scorecard population remain unverified; do not claim the live Cloudflare dashboard has this update until independently checked.


## Vision 2.0 research plan (2026-11-21)
- Created `docs/MKTRADEHOME_VISION_2.0_PLAN.md` on isolated branch `vision-2.0-research-plan`.
- Reviewed Pocket Option's public descriptions of its charting/signals, trade history and session-based AI Trader. Adapted product ideas only: bounded scan sessions, transparent ranking of already-eligible candidates, richer market context, event/session awareness, explainable summaries and verified trade journaling.
- Explicitly excluded fixed-expiry trading, social-copy instructions, unverified AI accuracy claims, unofficial account APIs, and any bypass of manual approval.
- Phase 0 is broker-truth first: obtain and back up the exact EA source; implement complete Demo position snapshots and idempotent close-report recovery; verify one full Demo lifecycle.
- No production code, database schema, V63 rules, approval logic, risk controls, MT5 execution behavior, or deployed services were changed. This is a documentation-only research plan on an isolated branch; it is not deployed.
- Reference review: Pocket Option official platform materials and ESMA's AI-investing caution. Vendor feature descriptions are not independent proof of profitability.

- Dashboard information architecture expanded per user request: separate Overview, My Account, Watch Charts, Market Scanner, Approval Centre, Open Trades, Trade History, Performance, Alerts & Activity, and Settings. Desktop left sidebar; mobile bottom navigation plus More menu. Keep this design isolated until implementation and route tests pass.


## Vision 2.0 dashboard shell implementation (2026-11-21)
- Added `vision2-dashboard.js` and linked it from `index.html` on the isolated `vision-2.0-research-plan` branch.
- Reorganizes existing dashboard cards into separate Overview, My Account, Watch Charts, Market Scanner, Approval Centre, Open Trades, Trade History, Performance, Alerts & Activity, Settings and My Journey sections.
- Desktop uses a persistent left navigation rail; mobile uses a compact bottom navigation with a More panel. Existing cards and DOM elements are moved intact so their existing event handlers and IDs remain available.
- Added an explicit Open Trades status explaining that individual live positions are not yet available until a complete authenticated MT5 EA snapshot feed is implemented. No simulated positions or floating P/L are shown.
- This is a presentation/navigation change only. No production signal engine, V63 eligibility rules, V100 shadow, approval flow, risk limits, Supabase schema/functions, MT5 execution or account permissions were changed.
- Static JavaScript parse check for the new navigation file passed in the authoring environment. Full browser interaction, mobile layout, chart resize, auth/PIN, approval actions, and Cloudflare Pages preview still require end-to-end testing. No deployment or merge to main has been performed.
- Implementation commits: `63f3d06633ed694d4de1720ecb1dc2774c42aabb` (navigation module), `24bd5bfb186122c1ed6e1382dd8436b6662b38ae` (HTML integration).

- Follow-up layout review corrected the legacy collapsible-tools container: account monitoring now routes to My Account, historical replay to Performance, and secondary analysis cards to Market Scanner rather than being stranded under Settings. Navigation module syntax rechecked successfully. Follow-up commit: `60ecdd88611728eb97066e14f35ca5bc49929f91`.
- CI workflow now includes `node --check vision2-dashboard.js` (commit `631a5bafe0ada4879b740382f3228914445a333f`); this workflow has not yet executed for the isolated branch.


## Vision 2.0 validation and review sessions (2026-11-21)
- Opened draft PR #3 against main for isolated validation: https://github.com/mktradehome/mktradehome/pull/3. It remains draft and unmerged; no deployment was triggered.
- GitHub Actions run `44906479529` completed successfully for the first navigation-shell revision: production/shadow Edge Function type-checks, existing inline dashboard JS syntax, new navigation JS syntax, Foresight metrics/outcome tests, independent approval-proof tests and legacy shared-engine fixtures all passed.
- Added a Focused Market Review panel to the Market Scanner workspace: four-market focus checklist, 15/30/60/120-minute local timer, resume-after-refresh and end-session controls. This is deliberately a personal review timer only; it does not alter the existing all-market background scan cadence, production V63 eligibility, approval flow or execution.
- Added CI syntax checking for both Vision 2.0 JavaScript modules. A new PR check is expected for the latest commit; it has not yet completed.
- Latest UI work commits: `f9b02ab2b39481953504a49903562112b2288cd3` (review-session module), `d48a9227555ba67cf4bbcd6d59eade57ff9ac8c6` (HTML integration). The first PR CI run tested the earlier navigation-only revision, not these newest additions.
- Full browser/mobile interaction testing remains outstanding. No merge, deployment, database migration, production strategy change, risk-rule change or MT5 execution change was performed.

- GitHub Actions run `44906595619` completed successfully for the revision containing both navigation and focused review-session modules; all 11 workflow steps passed, including both new JavaScript syntax checks and all existing strategy/approval tests.
- A subsequent code review caught that the legacy `advancedTools` wrapper also has class `card`, so its generic card branch could intercept it before its children were routed. Fixed the branch order to unwrap and route its child cards first, then remove the empty wrapper. Fix commit: `8f9cdfb47f621c7b92a7b7b0b73b3997e5bc6c1a`. This correction is newer than the successful CI run and needs its own CI result.

- GitHub Actions run `44906641766` completed successfully on navigation-routing fix commit `8f9cdfb47f621c7b92a7b7b0b73b3997e5bc6c1a`. All 11 workflow steps passed, including production/shadow Edge Function type-checks, both Vision 2.0 module syntax checks, Foresight tests, approval-proof tests and legacy engine fixtures.
- Draft PR #3 remains open, mergeable and unmerged. It contains the segmented dashboard shell and focused review-session UI. No production deployment has been triggered.
- Full browser-based testing is still outstanding; CI validates syntax and existing backend tests but does not simulate authenticated browser interactions or mobile layout.


## Vision 2.0 broker-truth hardening (2026-11-21)
- Strengthened `docs/MT5_POSITION_REPORTING.md` with complete-snapshot semantics, per-terminal monotonic sequence numbers, idempotent snapshot IDs, server-side Demo account binding, out-of-order rejection, and safe empty-snapshot reconciliation.
- Added a durable EA close-report outbox contract: persist until acknowledged, deterministic broker-deal idempotency, acknowledgement only after durable commit, restart-safe retries, and conflict surfacing.
- Expanded acceptance tests for replay, stale/out-of-order snapshots, duplicate close delivery, restart recovery and acknowledgement durability.
- This remains a design contract only. The exact MQL5 EA source is still absent from the repository, and the Supabase connector did not grant read access during this session. No Edge Function, database schema, RLS, V63 rule, approval gate, account permission or execution behavior was changed.
- Verified the Vision 2.0 draft PR #3 is still open, draft, unmerged and mergeable. GitHub Actions run `44906719666` for branch head `e37db174afd44149cc1bee6ff2d1ba7dc8144075` completed successfully.
- Cloudflare's PR bot reported a successful isolated branch-preview deployment for commit `e37db17`, with preview `https://vision-2-0-research-plan.mktradehome.pages.dev`. This is a branch preview, not a merge to `main`; do not treat it as production deployment or proof of browser acceptance.
- Next required input is the exact `MktradehomeBridge.mq5` source from the Lenovo laptop. Back it up unchanged before editing; then implement and test the EA/bridge contract together on this isolated branch.


## Vision 2.0 dashboard release (2026-11-21 13:29 UTC)
- Draft PR #3 was merged into main at merge commit 90900b3c0df43ab239c3aca5812e99b2f3cade32. The merge contains the segmented dashboard navigation and Focused Market Review UI.
- GitHub Actions run 44909068947 (engine and approval tests) completed successfully for the merge commit.
- GitHub Pages build/deployment run 44909068596 completed successfully for the merge commit. Cloudflare Pages production deployment at mktradehome.pages.dev has not been independently verified from the available deployment evidence; do not equate GitHub Pages success or the earlier Cloudflare preview success with Cloudflare production confirmation.
- User manually confirmed on the Cloudflare preview that mobile navigation sections and Watch Charts work. The user also inspected Market Scanner; displayed content includes a personal review timer, four markets, stale weekend FX/gold quotes, BTC fresh quote, WAIT decisions, and uncalibrated foresight scorecard. Market closure is expected for weekend FX/gold; stale quotes must remain blocked from approvals.
- Remaining production acceptance checks: sign-in/PIN, chart resize, approval actions, history/records, logout/session handling, and explicit confirmation that Cloudflare production serves this merge. Do not claim these are tested.
- No V63 rules, approvals, risk limits, Supabase schema/functions, MT5 execution, or account permissions were changed by this dashboard release.
- Highest-value next engineering milestone remains broker-truth: obtain the exact MktradehomeBridge.mq5 source from the user's Lenovo laptop, make an unchanged backup, then implement complete authenticated Demo position snapshots and durable idempotent close reporting across EA, bridge, storage and dashboard. Do not fabricate open positions or P/L; do not edit the EA without its exact source.


## Broker position reporting — progress update (2026-11-21)

- User supplied both Demo and Real EA source files. Demo source was backed up unchanged; Real source was inspected but not edited.
- Prepared candidate Demo EA v2.22 to send the full open-position list alongside the existing account snapshot. Candidate file is not yet compiled or installed.
- Added `positions` JSONB and `positions_complete` to `public.mt5_account_snapshots`.
- Deployed `mt5-bridge` Edge Function v32. The authenticated dashboard snapshot now returns the position payload and completeness flag; old/Real bridge snapshots without the array remain explicitly incomplete.
- Updated `index.html` and `vision2-dashboard.js` so Open Trades can render actual broker-reported position details and stale/incomplete states. GitHub commits: `425f69889d74cde40b6e9e09281c790bdd30706c` and `b920322f8a836fba5f6f1daac70cf8a61d96738a`.
- Pending: compile candidate in MetaEditor, install on Demo only, verify a complete snapshot reaches Supabase and renders in the dashboard, then separately harden/retest durable close-report retry. No Real EA, V63 rules, approvals, risk limits or order-execution settings were changed.


## Market monitor diagnostic and notification logging repair (2026-11-21 15:06 UTC)
- Corrected `diagnoseCandidate` so its 1H diagnostic matches the existing production candidate gate: BUY requires 1H score >= +12; SELL requires 1H score <= -12. Previously the diagnostic checked only the absolute score, so contradictory EMA direction/momentum could be misreported as a 15M setup issue. This was an explanation/diagnostic defect; the candidate eligibility rules were not changed.
- Extended the structured `MKTRADEHOME_SCAN` log to include candidate ID, quality score, in-app alert save result, Telegram delivery result and notification-related errors when an eligible candidate is saved. No notification destination, credentials, or delivery conditions were changed.
- Deployed Supabase `market-monitor` v64 ACTIVE. Deployment SHA: `e4281b202a2222e73a58be97b9ff6df1cda96f6218e02f25b9fd9f56f42dfbdd`.
- Four focused direction/score diagnostic checks passed: mismatched SELL/+score and BUY/-score are reported as 1H bias conflicts; aligned SELL/negative score and BUY/positive score do not trigger that mismatch diagnostic.
- Triggered one manual scan through the existing monitor-secret route. HTTP 200 confirmed the v64 response. BTCUSD correctly returned WAIT with `WEAK_1H_BIAS`: EMA structure points SELL while its directional score was +30. EURUSD, XAUUSD and USDJPY remained WAIT because their quotes were stale/markets closed. No candidate, alert, approval or order was created by this run.
- The scheduled five-minute monitor remains enabled. A future eligible candidate is still required to test the new Telegram/in-app delivery fields end-to-end; delivery has not yet been verified because the latest scan did not produce a candidate.
- Synced the deployed v64 source to `supabase/functions/market-monitor/index.ts` in GitHub. The focused checks are not a substitute for the repository CI run; CI should be checked after this commit.
- The Approval Centre, `create-mt5-approval` contract, V63 entry thresholds, 4H/15M/5M gates, ATR risk sizing, TP1/TP2, approval expiry, Demo account binding, and MT5 execution safeguards were not changed. MT5 EA execution remains disabled during this signal test.


## Signal drought investigation — confirmed scan behaviour (2026-11-21)
- Reviewed production `market-monitor` v64 logs from 11:25 UTC through 15:55 UTC: 56 scheduled scans were recorded; one independently verified BTCUSD SELL candidate was saved at 11:25:03 UTC. Its stored expiry was 11:35:03 UTC (10 minutes). One corresponding unread `trade_alerts` row exists. No later qualifying candidate was saved in that window.
- Rejection diagnostics across those scans: 29 `15M_SETUP_PENDING` occurrences and 23 `WEAK_1H_BIAS` occurrences; two `5M_ENTRY_CONFLICT` occurrences. EURUSD, XAUUSD and USDJPY were rejected because quotes were stale/markets closed (Saturday). The scheduled scanner was therefore operating; it was not silently stopped.
- The Approval Centre intentionally renders only fresh, independently verified BUY/SELL candidates. The 11:25 candidate expired after 10 minutes and was no longer eligible for approval after 11:35. This explains why it disappeared; it does not prove Telegram delivery.
- Important correction for future strategy work: the existing `market-monitor-v100-shadow` v5 `buildCandidate` logic is effectively the same balanced multi-timeframe candidate pathway as production, not a genuinely different second strategy. Do not present it as an alternative strategy. Its backtest also replays that same V100 candidate logic.
- Next: develop a genuinely distinct second setup class in an isolated shadow/backtest only (no production approvals, alerts, queue writes or execution). Compare it against the existing baseline using completed candles, next-bar fills, conservative same-bar SL-first assumptions, spread/fees sensitivity and adequate sample size. Integrate only if it adds worthwhile net expectancy without unacceptable drawdown; otherwise retain the current strategy and improve the dashboard's visibility of scan/rejection status. No production thresholds, approval rules, risk limits or execution settings were changed during this investigation. MT5 EA execution remains OFF.


## Shadow-strategy research — history coverage and isolation audit (2026-11-21)
- Re-inspected deployed `market-monitor-v100-shadow` v5 and `market-monitor-v100-backtest-shadow`. The shadow monitor explicitly reports `productionWrites:false`, `createsApprovals:false`, `createsQueueItems:false`, `telegramAlerts:false` and `executesTrades:false`. The backtest uses the same V100 `buildCandidate`, `scoreTimeframe` and validation helpers as the current baseline; it is not a distinct strategy.
- Audited `public.market_candle_archive` coverage by symbol/timeframe. 5M history currently spans only about 2.4–3.2 days; 15M about 3.5–4.6 days; 1H about 9.5–11.5 days; 4H about 32–40 days. This is insufficient for a robust cross-market strategy comparison, particularly at the intended 5M entry timeframe. The archive is not a substitute for the rolling BiQuote historical download used by the V100 backtest.
- Reviewed V100 backtest mechanics: it uses completed candles, evaluates after a completed 15M candle, enters at the next 15M open, assumes SL-first if SL and TP1 touch in the same candle, and exits the full position at TP1 (2R). However, historical spread, commission, swap and slippage are unavailable; reported results are gross and cannot establish net profitability. Market-open periods are also assumed rather than independently modelled.
- Research decision: do not loosen production filters or create a second strategy by merely changing thresholds. A distinct candidate class must have a genuinely different entry mechanism (to be tested as an isolated range-breakout/volatility-expansion hypothesis), use point-in-time completed candles and next-bar fills, and report costs/coverage limitations. No alternative strategy has been coded, backtested, deployed or approved in this session. No production function, approval, alert, queue, database schema or MT5 setting was changed.
- Next gate: run an isolated comparative replay with enough common history across 4H/1H/15M/5M, including spread/fee sensitivity and out-of-sample segmentation. If data coverage is inadequate or the alternative does not improve net expectancy with controlled drawdown, retain the validated baseline. MT5 EA execution remains OFF.



## Scanner observability — read-only dashboard visibility (2026-11-21)
- Confirmed the production cron job `mktradehome-market-monitor` is active on `*/5 * * * *` (every five minutes). At 16:20 UTC, the latest run succeeded. The 24-hour run history contained 288 scheduled runs: 288 succeeded, 0 failed (first 16:25 UTC on 2026-11-20; latest 16:20 UTC on 2026-11-21).
- The 16:20 UTC v64 scan rejected BTCUSD with `WEAK_1H_BIAS` because 1H EMA structure and directional momentum did not agree strongly enough for SELL. EURUSD, XAUUSD and USDJPY were rejected because quotes were stale/invalid or markets were not confirmed open. No new candidate or trade was created by this scan.
- Corrected an important dashboard wording/architecture gap: the browser's five-minute `refreshAll` refresh is local quote/timeframe analysis and is not the server-side production monitor. The new panel reads the independent cron heartbeat so those two processes are not confused.
- Added `vision2-scan-status.js` and loaded it after the Vision2 dashboard/session scripts. The new read-only panel shows the scheduled scanner's last run and 24-hour run counts, the most recent independently verified candidate with its expiry and quality-score disclaimer, each market's current dashboard quote state and saved-analysis freshness, Telegram linkage, browser push registrations, and latest saved in-app alert time. Stale analysis is explicitly labelled stale and its old rejection reason is not shown as current. Status refreshes every 60 seconds.
- Added owner-scoped `public.mktradehome_scan_status()` RPC through migration `replace_scan_status_view_with_owner_scoped_rpc`. It reads only operational metadata and this dashboard owner's scanner/candidate/notification rows; it performs no writes and has no signal, approval, queue, alert or trade side effects. `anon` execution is revoked; the function returns `NULL` for a non-owner authenticated subject. Tested the owner claim path successfully and the non-owner path returned `NULL`.
- Security note: Supabase's generic advisor reports `authenticated_security_definer_function_executable` for this RPC because it must read the protected `cron` schema. This is intentional and narrowly constrained: no parameters, fixed dashboard-owner UUID check via `auth.uid()`, empty `search_path`, `anon` revoked, and no mutating SQL. The earlier broad view approach was removed after the advisor flagged its SECURITY DEFINER view; no such view remains. The generic authenticated SECURITY DEFINER warning is retained and documented rather than weakening the owner-only data path.
- GitHub commits: `573a1f434096dbb390d90bc38047193f6e6b4aaa` (new status module) and `b65f1286f78e6e9c987ac246d5fb80196879b8f8` (load module from `index.html`). Node.js v22.16.0 `node --check` passed for the new module. The database RPC was exercised with owner and non-owner JWT subject claims.
- Telegram: one account is linked, but delivery of a real trading alert remains unverified; no test message was sent automatically. Browser push has zero registered devices. The latest saved in-app alert is still the 11:25 UTC candidate; that candidate expired at 11:35 UTC and must not be approved.
- No production `market-monitor` logic, entry thresholds, signal quality gates, candidate expiry, Approval Centre eligibility, MT5 queues, account binding, risk limits or EA execution settings were changed. MT5 execution remains OFF. The dashboard's production deployment and browser rendering still need a live smoke check after the hosting provider finishes the commit deployment.
