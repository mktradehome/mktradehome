# Demo close-deal accounting and MT5 EA integration plan — 2026-11-25

## Objective
Make Demo journal results reconcile to actual MT5 deal history, including all partial closes and trading costs, without changing signal generation, approval, execution eligibility, risk, or existing journal values.

## Verified current state
- Production `mt5-bridge` is ACTIVE v33. Its `close_report` accepts one `exit_price` and one `profit_loss` supplied by the EA. It does not currently accept broker close-deal ticket(s), close reason, commission, swap, fee, or gross deal profit.
- The bridge parses the opening fill from the executed queue's confirmation message and writes `requested_entry_price`, `broker_entry_price`, and `mt5_opening_deal_ticket`. This is now populated for all 28 existing Demo journal rows.
- `trades` currently has no dedicated broker exit price, close deal ticket, close reason, gross deal profit, commission, swap or fee fields.
- The repository does not contain the MT5 Expert Advisor source (.mq5/.mq4). Therefore the EA cannot currently be updated to collect and send the broker's deal history. The EA is the missing half of this integration. Do not guess or recreate its source.
- The five trades whose exit price differs from the originally saved SL/TP are journal IDs 17, 19, 21, 23 and 122. They are not automatically errors: the current record lacks close reason and any post-entry SL/TP modification history.
- USDJPY's three losses all closed at the original recorded stop-loss. They are journal IDs 74 (SELL -$1.13), 153 (BUY -$0.87), and 152 (BUY -$0.38). This suggests stop-outs, not a proven bridge malfunction. Two latest BUY positions overlapped in time and closed within 18 seconds of each other; without signal identity we cannot determine whether they were independent setups or repeated exposure.

## Required MT5 EA payload
For every position closure, the EA must select the complete deal history for the position identifier and aggregate every closing deal, including partial exits:
- account number and server
- `POSITION_IDENTIFIER` / MT5 position ID
- opening deal ticket (for matching)
- all closing deal tickets (array, not a single ticket)
- final weighted close price or individual close prices/volumes
- closing deal reason(s), preserving mixed reasons if multiple deals
- sum of `DEAL_PROFIT`, `DEAL_COMMISSION`, `DEAL_SWAP`, and `DEAL_FEE` across relevant closing deals
- currency, closed timestamp, and total closed volume
- raw per-deal values for auditability

Net realized result must be calculated as the sum of profit + commission + swap + fee across all deals belonging to the position lifecycle, with clear treatment of opening-deal commission/swap/fee too. MT5 can book commission on entry or exit, so the integration must include relevant IN and OUT deals for the position identifier rather than assuming all costs occur at closure. Preserve gross profit and each cost separately. Never infer missing cost fields as zero; represent missing/unavailable distinctly.

Use official MQL5 deal properties: DEAL_POSITION_ID, DEAL_ENTRY, DEAL_REASON, DEAL_PRICE, DEAL_PROFIT, DEAL_COMMISSION, DEAL_SWAP, DEAL_FEE, DEAL_TICKET, DEAL_VOLUME, DEAL_TIME. Source: https://www.mql5.com/en/docs/constants/tradingconstants/dealproperties.

## Backward-compatible schema proposal (draft only; not applied)
Add nullable fields to `trades`:
- `broker_exit_price numeric`
- `mt5_close_deal_tickets jsonb` (array)
- `mt5_close_reason jsonb` (array of reason codes)
- `broker_gross_profit numeric`
- `broker_commission numeric`
- `broker_swap numeric`
- `broker_fee numeric`
- `broker_net_profit numeric`
- `broker_costs_complete boolean` (default false)
- `broker_deal_audit jsonb` (validated per-deal evidence; do not store secrets)
- `close_report_version integer`

Do not backfill historical cost fields with zero. Existing records remain unchanged and nullable new fields remain NULL until real broker evidence is received.

## Bridge validation contract
- Continue authenticating the existing bridge secret and hard-binding account/server to the configured Demo account.
- Accept the new fields as optional during transition; old EA payload remains supported.
- Validate positive position/deal IDs, finite numeric values, bounded array sizes, allowed deal reason/entry enums, consistent account/server, and exact position match to an executed queue row.
- Enforce idempotency by position ID and stable deal-ticket set; duplicate close reports must not double-count.
- Reject conflicting replays (same position, different ticket set or totals) for review rather than silently overwrite.
- Store raw deal audit separately from the legacy `profit_loss` until reconciliation passes. Do not silently rewrite the legacy value.
- Never accept client-provided "net" as authoritative without recomputing it from validated deal components.

## Tests required before any deployment
1. Single close deal with all cost fields.
2. Entry commission plus exit commission and swap/fee.
3. Partial close with multiple closing deals.
4. Mixed close reasons and partial volumes.
5. Missing fee/cost field stays incomplete, not zero.
6. Duplicate identical report is idempotent.
7. Conflicting duplicate is rejected and preserved for investigation.
8. Wrong account/server or position ID is rejected.
9. Invalid numeric, oversized arrays, unknown enums are rejected.
10. Old EA payload continues to work during transition without claiming cost completeness.

## USDJPY review
Three losses in three trades is insufficient evidence to change or disable the market. All three closed at the recorded original SL. Collect a larger sample and inspect the saved signal's actual multi-timeframe evidence and entry conditions. Also add immutable candidate/setup identity before measuring repeated-signal exposure; do not infer independence from repeated scan rows.

## Release boundary
This branch is research/design only. No production database migration, Edge Function deployment, dashboard change, strategy adjustment, approval, queue write, or trade operation is authorized by this document. Implementation cannot be completed end-to-end until the actual Mktradehome MT5 EA source is added to the repository or otherwise supplied. Once available, implement the EA and bridge together on an isolated branch, run the tests above, and then review the complete diff before production rollout.
