# MT5 Open-Position Reporting — Integration Contract

Status: DESIGN SPECIFICATION ONLY. This endpoint is not deployed and the EA does not yet send this payload.

## Goal
Show actual open Exness Demo positions on the Mktradehome chart using broker-reported values. Never infer an open position from an approved queue row or a market quote.

## Current blocker
The repository does not contain the MQL5 Expert Advisor source. The deployed `mt5-bridge` v30 accepts account snapshots and closed-trade reports, but it has no open-position snapshot action. The dashboard's queue is execution history, not a live position feed. Do not claim live position tracking until the EA, bridge, database persistence, and dashboard are all connected and tested.

## Proposed EA-to-bridge request
- Method: POST
- Endpoint: Supabase Edge Function `mt5-bridge`
- Header: `x-bridge-secret: <existing MT5_BRIDGE_SECRET>`
- JSON body (illustrative contract):

```json
{
  "action": "positions_snapshot",
  "account_number": "<registered demo account number>",
  "account_server": "Exness-MT5Trial10",
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

Values above are examples only, not an actual account or trade.

## Required server validation
1. Verify the existing bridge secret before processing the body.
2. Accept only the registered Demo account/server for this first rollout; keep Real mode read-only and separate.
3. Reject unknown symbols, invalid side, non-finite or non-positive volume/prices, invalid position IDs, impossible timestamps, and oversized arrays.
4. Validate SL/TP direction relative to BUY/SELL when those values are non-zero.
5. Upsert by account + server + MT5 position ID so each EA poll refreshes the same position.
6. Mark positions absent from a complete, valid snapshot as closed/stale only after a successful full snapshot. Never close positions based on a partial or rejected payload.
7. Store broker capture time and server receive time separately; dashboard must display stale status when heartbeat age exceeds a small configured threshold.
8. Never create approvals, queue items, or orders from a position snapshot.

## Dashboard requirements
- Read only the latest accepted Demo position snapshot through an authenticated dashboard action.
- Draw actual broker entry, SL, TP, current price, direction, volume, floating P/L and MT5 ticket/position ID.
- Display source timestamp and stale/connected state.
- Remove a position from the live overlay only after a later complete snapshot omits it or a verified close report confirms closure.
- Keep historical queue entries visually separate from live positions.

## Acceptance tests before calling it live
- Authenticated valid snapshot inserts/updates one position.
- Same position ID updates rather than duplicates.
- Wrong account, wrong secret, malformed values and unknown symbol are rejected.
- Partial/rejected snapshots never close existing positions.
- Empty complete snapshot clears live positions safely.
- Dashboard renders BUY and SELL positions and shows stale heartbeat correctly.
- No test changes execution gates or places an order.
