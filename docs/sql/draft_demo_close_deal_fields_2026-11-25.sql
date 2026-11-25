-- DRAFT ONLY — do not apply until the MT5 EA and bridge implementation are reviewed.
-- Nullable fields preserve historical rows and avoid fabricating costs.
alter table public.trades
  add column if not exists broker_exit_price numeric,
  add column if not exists mt5_close_deal_tickets jsonb,
  add column if not exists mt5_close_reason jsonb,
  add column if not exists broker_gross_profit numeric,
  add column if not exists broker_commission numeric,
  add column if not exists broker_swap numeric,
  add column if not exists broker_fee numeric,
  add column if not exists broker_net_profit numeric,
  add column if not exists broker_costs_complete boolean not null default false,
  add column if not exists broker_deal_audit jsonb,
  add column if not exists close_report_version integer;

alter table public.trades
  add constraint trades_mt5_close_deal_tickets_array_check
    check (mt5_close_deal_tickets is null or jsonb_typeof(mt5_close_deal_tickets) = 'array'),
  add constraint trades_mt5_close_reason_array_check
    check (mt5_close_reason is null or jsonb_typeof(mt5_close_reason) = 'array'),
  add constraint trades_mt5_broker_deal_audit_object_check
    check (broker_deal_audit is null or jsonb_typeof(broker_deal_audit) = 'object');
