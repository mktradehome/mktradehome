# Signal Consolidation and Live Position Visibility — Research Design

Status: isolated research branch; not production-enabled.

## Goals

1. Test whether repeated same-direction technical candidates from one continuing market move can be represented as one consolidated trade proposal without treating refreshes as independent opportunities.
2. Show actual open Exness MT5 positions on the Mktradehome Home dashboard, including floating profit/loss, using broker-reported position data.

## Safety boundaries

- No changes to production signal acceptance, classification, risk limits, approval flow, queue, execution, or Real-account hard lock.
- No automatic averaging, pyramiding, adding volume, or opening extra positions.
- Consolidation is a research calculation only. It must not place or approve orders.
- The Demo MT5 bridge is the first and only target for position visibility testing. Real account remains read-only and disconnected from execution.
- Never display a zero-position state as verified if the snapshot is incomplete or stale.
- Show source timestamp and stale/offline state. Do not silently carry forward old floating P/L.

## Workstream A — candidate consolidation prototype

### Episode identity

Group candidates only when symbol and direction match and the evidence indicates continuity of the same setup. Preserve each candidate ID and timestamp. A changed direction, invalidated setup, material regime change, or a new independently confirmed setup starts a new episode. A ten-minute refresh alone is not proof of a new opportunity.

### Consolidated proposal

The prototype should compare, not blindly average:
- latest valid candidate entry;
- a volume-independent reference entry (for example, median of eligible candidate entries);
- a technically justified invalidation/stop level derived from the episode evidence;
- TP1 at 2R and TP2 at 3R from the chosen reference entry.

Reject the consolidated proposal if candidate freshness, price extension, stop geometry, reward/risk, or any existing hard safety gate fails. If a defensible common stop cannot be established, report "cannot consolidate" rather than inventing one. Report the resulting risk in R and price units. This is not a multi-order execution plan.

### Evaluation

Replay historical episodes and compare the consolidated proposal with the original candidates. Measure duplicate alert reduction, entry drift, invalidation frequency, stop distance, target reach, adverse excursion, missed fresh opportunities, and costs where data permits. Require out-of-sample and Demo forward evidence before considering production.

## Workstream B — live open positions

### Existing data path

The active `mt5-bridge` v32 accepts a Demo account snapshot with per-position fields and stores them in `mt5_account_snapshots.positions`; the dashboard snapshot endpoint returns `positions`, `positions_complete`, and `captured_at`. The Home page already has an account monitor and dispatches a positions event, but its chart detail still says live open positions are not connected. The existing account snapshot last seen in the database was old and contained zero positions, so it is not proof of a working live feed.

### Required fields

For each broker-reported position: position ID/ticket, symbol, BUY/SELL, volume, entry price, current price, SL, TP, floating profit, swap, and open time. Display account currency and timestamp. Sum floating P/L only across a complete, fresh snapshot; make clear whether swap is included and whether commission is excluded/not available.

### Reliability requirements

- Snapshot must be marked complete only if every open broker position was enumerated and serialized successfully. If any item is skipped or the payload is truncated, mark incomplete.
- Validate identity, numeric values, symbol, and account/server on the server.
- Preserve position ID as the stable identity; ticket may differ under netting/partial-close operations.
- Poll/refresh at a measured interval and show last update age, stale, offline, incomplete, and no-open-positions as distinct states.
- Never infer live P/L from signal entry/target values or from the trade queue.
- Home screen is view-only: no close, modify, approve, or execute controls are added by this workstream.

## EA source investigation

The Library contains stable `MktradehomeBridge_Demo_v2.21.mq5` and a `MktradehomeBridge_v2.22_open_positions.mq5` variant. The latter adds a per-position JSON builder and includes it in the account snapshot. It has not been compiled or accepted as safe. A prior report of 90 compiler errors must be reconciled against the exact source/compiler output before any installation. Keep v2.21 unchanged as the recovery baseline.

## Promotion gates

1. EA compiles cleanly in MetaEditor with zero errors and warnings reviewed.
2. Test Demo positions across BUY/SELL, multiple positions, symbols, partial close, stop/TP absent, swap, and no positions.
3. Confirm payload completeness, correct floating P/L/currency, stable identity, and stale/offline handling.
4. Verify dashboard totals equal MT5 terminal totals on repeated snapshots.
5. Review source and regression tests; deploy only the minimum required bridge/dashboard changes.
6. No Real-account execution path or lock changes.

## Current status

- Research branch created: `research/signal-consolidation-and-live-positions`.
- No production source or database schema changed.
- No EA installed, compiled, or run.
- No trades placed.


## Completed-candle evidence review (2026-11-22)

- Reviewed the repository's current `market-monitor` candidate path without modifying it. `normalizeCandles` excludes provider rows explicitly marked open, validates OHLC and cadence, requires at least 60 completed bars, and rejects a stale/invalid latest completed candle. This gives a defensible basis for reconstructing the engine's completed-candle state in research.
- Each saved `trade_signals.analysis` proof stores the 4H/1H/15M/5M indicator snapshot and quote, but does not store each timeframe's exact latest completed-candle timestamp or the full candle window. The separate `market_candle_archive` table does store OHLC candles and timestamps, so candidate-time reconstruction is possible where archive coverage is complete.
- Read-only archive coverage check (latest available at review): all four markets have 4H history from 2026-10-09/20 onward, 1H history from 2026-11-09/12 onward, 15M history from 2026-11-17 onward, and 5M history from 2026-11-18 onward. Exact coverage differs by market; every replay must calculate its own common window and report gaps rather than assume complete history.
- Recent persisted candidates #848–#852 include repeated BTCUSD BUY refreshes with unchanged 4H/1H/15M indicator snapshots while their entry quotes move. This is a useful research sample, not proof by itself that they are one episode. A stable fingerprint must be derived from reconstructed completed-candle structure and tested against genuine new setups before automatic linking.
- Important design constraint: do not use the 5M fingerprint as the primary episode identity because it is the entry-timing layer and changes more frequently. Use completed 4H/1H/15M structure plus invalidation/regime evidence; preserve the 5M state as per-candidate evidence.
- No production source, signal logic, notifications, database schema, approvals, execution, EA or Real-account lock was changed during this review. The classifier remains isolated and unconnected.

## Next research gate

Build a deterministic historical reconstruction tool that, for each saved candidate, selects only candles completed at that candidate's timestamp, recomputes the same 4H/1H/15M indicators, and creates a documented structure fingerprint. Replay candidates in chronological order through the classifier. Manually audit both linked refreshes and split/new episodes, measure duplicate-alert reduction and false-merge/missed-new-setup rates, and test alternate fingerprint definitions out of sample. Do not connect to production notifications until this evidence is acceptable.

## Trade performance study — broker-linked lifecycle ledger (2026-11-23)

### Purpose and boundary
- Track every Demo trade attempt across BTCUSD, EURUSD, XAUUSD and USDJPY from signal/candidate through approval, execution and broker-confirmed closure.
- This is a research and measurement workstream. Do not change production signal filters, approval, execution, lot/risk limits, or the Real-account hard lock as part of the study.
- Keep broker-executed trades, signal-only candidates, and historical/backtest outcomes in separate populations. Never count repeated refresh notifications from one setup episode as independent trades.

### Existing lifecycle evidence
- mt5_trade_queue stores approved/executed/failed lifecycle evidence, planned entry/SL/TP, lot size, approval/execution timestamps, MT5 ticket and MT5 position ID.
- The mt5-bridge close_report matches by Demo mt5_position_id (with opening-deal-ticket recovery) and upserts the closed position into trades using account/server/position ID as its conflict identity.
- trades currently stores symbol, direction, planned entry/SL/TP, exit price, lot, status, profit_loss, open/close timestamps, account/server, position ID and currency. The inspected schema does not expose dedicated commission, swap, fee, signal-category, signal-ID, setup-episode-ID, close-reason, or provenance columns.
- The existing close report is a useful broker-linked starting point, but the present journal is not yet a complete net-performance ledger. Do not label its P/L net of all costs unless broker evidence confirms costs are included. Do not infer TP/SL/manual close reason from price alone.

### Current reconciled sample
- BTCUSD BUY 0.01, Demo position ID 593313802: queue record is executed; matching trades journal row 118 is CLOSED, exit 61299.31, reported P/L +$4.72, opened 2026-11-22 21:00:33 UTC and closed 2026-11-22 23:38:30 UTC. This matches the MT5 close notification previously supplied by the user. Count as one broker-linked closed trade; cost completeness and close reason remain unverified from the inspected journal fields.
- EURUSD SELL 0.01, Demo position ID 593630527: queue record remains executed; no matching closed journal row was returned in the latest check. Keep it as executed/open pending broker closure evidence. Do not count it as a win or loss.
- This is an early sample, not evidence of strategy profitability.

### Required ledger fields and evidence grades
- Identity: account type/server, broker position ID, queue ID, signal/candidate ID, setup episode ID (when validated), market, broker symbol, side.
- Plan: signal quality/category, planned entry, original SL/TP1/TP2, volume, signal/approval/expiry timestamps.
- Execution: actual fill, broker ticket, execution timestamp, slippage vs approved entry, approval-to-fill delay, execution status/message.
- Closure: actual exit, broker close/deal evidence, realized P/L and currency, commission, swap, fees, close reason, open/close times, holding duration.
- Provenance/status: broker-confirmed, database-linked, screenshot/manual evidence, backtest-only; candidate, approved, expired, failed, executed/open, closed, or awaiting reconciliation.
- Use stable broker position identity for idempotent matching. Replayed close reports must not create duplicate trades. Partial closes and multiple deal records must be researched before changing the current one-row-per-position model.

### Dashboard measurement rules
- Headline realized results use broker-linked closed Demo trades only. Separate gross, net, and cost-incomplete results.
- Show verified closed count, wins/losses, win rate, realized P/L, profit factor, expectancy, drawdown, average win/loss, holding time, slippage, close reason, and sample size; suppress or label metrics that cannot yet be supported.
- Break down only when enough independent observations exist: market, BUY/SELL, GOOD AND CLEAR/NORMAL, and validated setup episode.
- Display data freshness and reconciliation status. Missing fields remain unknown, never guessed. Backtests stay in a separate panel and are clearly labelled simulated/gross-only where applicable.
- Do not infer confidence or strategy quality from one or two trades; show sample sizes and uncertainty.

### Next research steps
1. Audit the EA close_report payload and MT5 history/deal fields to determine whether profit includes swap/commission and how close reason and partial-close history can be captured.
2. Inspect constraints, indexes, triggers, RLS and bridge idempotency before proposing any schema changes.
3. Build a read-only reconciliation report linking queue rows to trades by broker position ID and flagging executed positions without a closure record.
4. Prototype the ledger/dashboard in this research branch first. Only propose production schema/bridge changes after a reviewed design, deterministic tests and explicit approval.