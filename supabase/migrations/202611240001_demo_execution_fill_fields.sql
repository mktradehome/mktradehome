-- Additive Demo journal fields. Existing entry_price remains unchanged for backward compatibility.
alter table public.trades
  add column if not exists requested_entry_price numeric,
  add column if not exists broker_entry_price numeric,
  add column if not exists mt5_opening_deal_ticket text;

-- Backfill only from explicit successful MT5 confirmation messages.
-- Preserve legacy entry_price and leave broker_entry_price NULL when the message is not parseable.
update public.trades t
set requested_entry_price = q.entry_price,
    broker_entry_price = case
      when q.execution_message ~ '^MT5 market order confirmed\\..*; price=[0-9]+(\\.[0-9]+)?; retcode=10009(;|$)'
      then substring(q.execution_message from '; price=([0-9]+(\\.[0-9]+)?); retcode=10009')::numeric
      else null
    end,
    mt5_opening_deal_ticket = q.mt5_ticket
from public.mt5_trade_queue q
where q.account_number = t.account_number
  and q.account_server = t.account_server
  and q.mt5_position_id = t.mt5_position_id
  and q.status = 'executed'
  and t.mt5_position_id is not null
  and (t.requested_entry_price is null or t.broker_entry_price is null or t.mt5_opening_deal_ticket is null);
