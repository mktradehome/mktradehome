# Mktradehome Vision 2.0 — Research and Safe Upgrade Plan

**Status:** Research/design only; isolated branch. No production strategy, approval, risk, database, or MT5 execution behavior changed.

## Objective

Improve the quality of opportunity selection and the reliability of trade management for the user's Exness MT5 workflow. Pocket Option is a source of product-design ideas, not a strategy to copy and not an execution venue for this project.

Mktradehome remains a multi-market MT5 assistant for BTCUSD, EURUSD, XAUUSD and USDJPY. Its job is to scan, explain, rank eligible opportunities, request the user's approval, execute only approved Demo orders, monitor broker-confirmed positions, and learn from verified outcomes.

## Useful ideas to adapt

Pocket Option's public platform materials describe multi-asset selection, charting/indicators, built-in signals, trade/session history, and a session-based AI Trader mode with user-defined session parameters. Its educational materials also discuss multi-timeframe analysis, price action, volatility, and journaling. These are product and research ideas, not evidence that its signals are profitable.

Adapt only the parts that fit MT5:

1. **Bounded analysis sessions:** Give the user a clear scan session (markets, start/end, last scan, data freshness, and status). A session must stop cleanly and must never create trades by itself.
2. **Best-opportunity ranking:** Compare only candidates that already pass the production V63 eligibility proof. Rank by transparent evidence such as rule quality, freshness, spread/cost, market regime, and independently measured historical outcomes. If none qualifies, show WAIT.
3. **Richer market context:** Research price-action structure, support/resistance proximity, candle quality, volatility regime, and tick-volume evidence where the provider's data supports it. Treat each as a separate feature first; do not add it to V63 or approval proof until it passes out-of-sample tests.
4. **Session and event awareness:** Show market session context and a configurable high-impact-event caution when a trustworthy calendar feed is available. Missing calendar data must be labelled unavailable, not silently treated as clear.
5. **Trade journal and review:** Present broker-confirmed entry/exit, costs where available, initial risk in R, realized R, holding time, setup evidence, and reason for exit. Separate user-reported results from broker-verified results.
6. **Explainable AI assistance:** Summarize why a candidate qualifies, what contradicts it, what would invalidate it, and why the other markets rank lower. The explanation is not itself a signal or probability.

## What not to copy

- Pocket Option's fixed-expiry/quick-trading mechanics: Mktradehome manages MT5 positions with price-based SL/TP and broker execution.
- Copy-trading/social-trader rankings as a source of trade instructions.
- Unverified claims of AI accuracy, win rates, or guaranteed profit.
- Unofficial Pocket Option account APIs, credential sharing, browser automation, or third-party bots.
- Any feature that bypasses the user's manual approval or the existing risk controls.

## Current baseline to protect

- Production V63 remains the only production signal-eligibility engine.
- V100 and historical replay remain isolated research/shadow systems until fair validation is complete.
- Approval proof independently rechecks the existing multi-timeframe, freshness, entry-extension, and risk-geometry rules.
- Manual approval, Demo-first validation, 0.01-lot starting size, required SL/TP, expiry, duplicate prevention, and real-account read-only restrictions remain unchanged.
- Foresight remains descriptive research until its probabilities are calibrated and tested; directional alignment is not a trade signal.

## Critical prerequisite: broker-truth and reporting

Before building a more elaborate ranking or AI layer, close the reliability gap in the MT5 lifecycle:

1. Obtain and back up the exact MktradehomeBridge `.mq5` source.
2. Add authenticated, complete Demo open-position snapshots from the EA through the bridge.
3. Persist broker-confirmed position identifiers and reconcile open/closed state without inferring closure from missing or partial snapshots.
4. Ensure close reports are retried safely after connectivity loss and are idempotent, so reconnecting cannot duplicate a close or P/L record.
5. Store broker-confirmed exit price, realized P/L, close time, and available commission/swap. Keep user-reported results clearly marked as unverified until reconciled.
6. Verify one complete Demo lifecycle: manual approval → MT5 accepted execution → open-position snapshot → broker close → durable close report → dashboard journal.

No production claims about live position tracking or complete P/L capture until this acceptance test passes.

## Research and validation gates

Each proposed feature is developed separately from production and evaluated on the same markets and completed-candle periods as the V63 baseline.

- Prevent look-ahead bias; only use information available at the decision timestamp.
- Use chronological train/validation/test splits and walk-forward evaluation.
- Include realistic spread, commission, swap, slippage, market hours and rejected/missed fills where the data permits; explicitly disclose missing cost data.
- Compare trade count, expectancy in R, profit factor, drawdown, adverse/favourable excursion, turnover, and performance by market/session/regime.
- Report sample size and uncertainty. Do not optimize for win rate alone.
- Require a meaningful out-of-sample sample and independent review before any promotion proposal.
- A new feature must not weaken any existing safety rule. Promotion requires explicit user approval and a rollback path.

## Delivery phases

**Phase 0 — Integrity first:** verify MT5 close-report recovery, live position reconciliation, EA source backup, and end-to-end Demo lifecycle.

**Phase 1 — Opportunity desk:** build a read-only ranked comparison of already-eligible V63 candidates with transparent reasons and WAIT behavior.

**Phase 2 — Research overlays:** separately test price-action structure, levels, volume/tick-volume, regime and session/event context. Promote none unless it improves out-of-sample results without unacceptable risk.

**Phase 3 — Session intelligence:** bounded scan sessions, user-defined market focus, alert summaries, and a clean session journal. No autonomous session execution.

**Phase 4 — Explainable learning:** measured performance by market, setup, session and regime, with sample-size warnings and drift monitoring.

## First implementation decision

Start with Phase 0. The recent user-reported BTCUSD +9.70 result is encouraging but is not yet a verified journal outcome in the database. Internet interruption is a plausible reason the close report was not delivered; this remains a hypothesis until the EA logs and bridge records are reconciled.

## Reference material

- Pocket Option quick-start: https://pocketoption.com/en/quick-start — platform charting, indicators, built-in signals, open-trade monitoring and session history.
- Pocket Option AI Trader update: https://pocketoption.com/blog/en/platform-updates/pocket-option-ai-trader-update/ — public description of bounded, preconfigured AI sessions.
- Pocket Option technical analysis: https://pocketoption.com/blog/en/knowledge-base/learning/technical-analysis/ — examples of indicator and chart-analysis categories.
- Pocket Option analysis tools: https://pocketoption.com/blog/en/knowledge-base/trading/pocket-option-trading-analysis/ — multi-timeframe, price-action and volume-analysis ideas.
- ESMA AI-investing warning: https://www.esma.europa.eu/sites/default/files/2025-03/ESMA_Warning_on_the_use_of_AI_-_Malta_-_EN.pdf — reminder that AI signals can be wrong and cannot guarantee outcomes.

Pocket Option's own descriptions are vendor materials, not independent validation of its AI performance or trading results.


## Dashboard information architecture (user-requested)
The dashboard must be a multi-section workspace, not one long vertical feed. Keep the existing dark premium visual identity and make navigation obvious on desktop and phone.

Primary navigation sections:
1. **Overview** — account health, balance/equity freshness, current session status, strongest eligible opportunity, and concise alerts.
2. **My Account** — connected MT5 account/server label, Demo/Real mode shown prominently, balance/equity/margin/free margin with capture time, connection status, and safe account settings. Never expose credentials.
3. **Watch Charts** — dedicated chart workspace with market selector for BTCUSD, EURUSD, XAUUSD and USDJPY; timeframe controls (5M, 15M, 1H, 4H); clear quote/data freshness; indicator/context overlays; chart must not imply a broker position unless broker-confirmed.
4. **Market Scanner** — four-market comparison and ranked eligible V63 opportunities with transparent reasons; explicit WAIT when none qualify.
5. **Approval Centre** — pending trade proposals, full entry/SL/TP/risk details, expiry, approve/reject actions, and clear approval state.
6. **Open Trades** — only broker-confirmed live positions, with direction, volume, entry/current price, SL/TP, floating P/L, and last sync time. If the bridge is offline or snapshot stale, display STALE/UNKNOWN rather than guessed values.
7. **Trade History** — closed broker-confirmed trades, realized P/L, R multiple, costs when available, close reason, and sync/verification status. User-reported P/L must be visibly distinguished from broker-verified P/L.
8. **Performance** — measured outcomes by market, strategy version, session and regime; sample sizes and uncertainty must be visible.
9. **Alerts & Activity** — signal changes, approvals, execution acknowledgements, connectivity, reconciliation failures and system events.
10. **Settings** — watchlist, chart preferences, alert preferences and risk display settings. Risk limits are protected; any changes require explicit confirmation and must never silently relax safeguards.

Navigation behavior:
- Desktop: persistent left sidebar with icons and readable labels; content changes in the main workspace without stacking every section into one page.
- Mobile: compact bottom navigation for the most-used sections (Overview, Charts, Scanner, Trades, Account) plus a clearly accessible More menu for remaining sections. Touch targets should be comfortable.
- Use distinct page titles, selected-navigation state, breadcrumbs where helpful, consistent summary cards and clear empty/loading/error states.
- Preserve responsive layout, accessible contrast, keyboard focus and large readable numbers. No fake data: unavailable/stale values must be labelled.
- The current dashboard is not to be replaced until the new navigation and all routes are implemented and tested on a separate branch. Keep existing functionality intact during migration.
