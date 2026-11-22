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
