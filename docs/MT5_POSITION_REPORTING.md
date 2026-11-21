# MT5 Open-Position Reporting — Integration Contract

Status: DESIGN SPECIFICATION ONLY. This endpoint is not deployed and the EA does not yet send this payload.

## Goal
Show actual open Exness Demo positions on the Mktradehome chart using broker-reported values. Never infer an open position from an approved queue row or a market quote.

## Current blocker
The repository does not contain the MQL5 Expert Advisor source. The deployed `mt5-bridge` v30 accepts account snapshots and closed-trade reports, but it has no open-position snapshot action. The dashboard's queue is execution history, not a live position feed. Do not claim live position tracking until the EA, bridge, database persistence, and dashboard are all connected and tested.

## Proposed EA-to-bridge request
- Method: POST
- Endpoint: Supabase Edge Function `mt5-bridge`
- Header: existing bridge authentication secret, transmitted only from the EA and never exposed in dashboard JavaScript.
- JSON body (illustrative contract):

```json
{
  "action": "positions_snapshot",
  "account_number": "<registered demo account number>",
  "account_server": "<registered demo server>",
  "snapshot_id": "<unique id for this complete snapshot>",
  "snapshot_sequence": 12345,
  "complete": true,
  "captured_at_unix": 1795059000,
  "positions": [
    {
      "position_id": 123456789,
      "symbol": "EURUSD",
      "side": "BUY",
      "volume": 0.01,
      "entry_price": 1.085,
      "current_price": 1.086,
      "stop_loss": 1.08,
      "take_profit": 1.095,
      "floating_profit": 1.0,
      "swap": 0.0,
      "commission": 0.0,
      "opened_at_unix": 1795050000
    }
  ]
}
```

Values above are examples only, not an actual account or trade. Account identity must be resolved against the server-side registered Demo account; do not trust a client-supplied mode flag to decide whether an account is Demo or Real.

## Required server validation
1. Authenticate the EA before processing the body.
2. Accept only the registered Demo account/server for the first rollout; keep Real mode read-only and separate.
3. Require `complete: true`, a non-empty snapshot ID, a strictly increasing per-terminal sequence, a plausible capture timestamp, and bounded request/position counts.
4. Reject unknown symbols, invalid side, non-finite or non-positive volume/prices, invalid position IDs, impossible timestamps, duplicate position IDs within one snapshot, and oversized arrays.
5. Validate SL/TP direction relative to BUY/SELL when those values are non-zero. Preserve zero only where MT5 legitimately means “not set”; do not silently manufacture a stop or target.
6. Upsert by registered account + server + MT5 position identifier. Repeated delivery of the same snapshot ID must be idempotent.
7. Record broker capture time, server receive time, terminal identity and sequence separately. Reject out-of-order snapshots so an old delayed request cannot overwrite newer state.
8. Only reconcile positions absent from a newly accepted, complete snapshot. A partial, malformed, stale, duplicate or rejected snapshot must never close or delete positions.
9. Treat an empty positions array as “no open positions” only when the complete snapshot passes every validation and sequence check.
10. Never create approvals, queue items, or orders from a position snapshot.

## Close-report recovery and idempotency
- The EA must persist each close report locally until the bridge acknowledges durable acceptance. Network failure, timeout or app restart must not discard an unacknowledged report.
- Each close report must carry a stable broker deal/ticket identifier and a deterministic idempotency key. Re-sending the same close report must update/acknowledge the same journal record, never create a duplicate.
- Server-side uniqueness must be enforced on the registered account plus broker deal identifier (and position identifier where useful); do not rely on an in-memory duplicate check.
- Acknowledgement is sent only after the close record is durably committed. The EA may then remove that item from its local retry queue.
- Preserve broker exit price, realized profit, swap, commission, close time, reason and original position identifier when supplied. Missing fields remain explicitly unavailable; never estimate them from the last quote.
- Reconcile the close report against the position snapshot/history before marking the journal item broker-verified. Conflicts are surfaced for review, not silently overwritten.
- Retry with bounded exponential backoff and jitter; keep the outbox durable across terminal restarts. The server must tolerate duplicate delivery.

## Dashboard requirements
- Read only the latest accepted Demo position snapshot through an authenticated dashboard action.
- Draw actual broker entry, SL, TP, current price, direction, volume, floating P/L and MT5 position ID.
- Display broker capture time, server receive time, sequence and stale/connected state.
- Remove a position from the live overlay only after a later accepted complete snapshot omits it or a verified close report confirms closure.
- Keep historical queue entries visually separate from live positions.
- If the snapshot is stale or the bridge is unreachable, show STALE/UNKNOWN and the last successful capture time; do not present cached values as live.

## Acceptance tests before calling it live
- Authenticated valid Demo snapshot inserts/updates one position.
- Repeated snapshot ID is idempotent; a lower sequence cannot overwrite a higher sequence.
- Same position ID updates rather than duplicates.
- Wrong account, wrong secret, malformed values, duplicate IDs and unknown symbols are rejected.
- Partial/rejected/stale snapshots never close existing positions.
- Empty complete snapshot clears live positions safely only after acceptance.
- Dashboard renders BUY and SELL positions and shows stale heartbeat correctly.
- Close report survives simulated timeout/restart, is retried, and is stored once despite duplicate delivery.
- Acknowledgement is not returned before durable storage.
- Conflicting close and snapshot evidence is surfaced, not silently reconciled.
- No test changes execution gates or places an order.

## Implementation gate
Do not implement the server/database/dashboard contract against guesses about the EA. First obtain the exact `.mq5` source and make an untouched backup. Inspect its existing authentication, polling cadence, account-mode guard, execution acknowledgement and close-report code. Then implement the matching EA and server changes together on an isolated branch, test Demo-only with synthetic payloads, and run one manually approved Demo trade through the complete lifecycle. No Real-account write path, production deployment or execution automation is part of this phase.
