-- Applied to Supabase project pjwqyveitncygamaaybi via migration market_foresight_foundation.
create table if not exists public.market_candle_archive (
  symbol text not null check (symbol in ('BTCUSD','EURUSD','XAUUSD','USDJPY')),
  timeframe text not null check (timeframe in ('5M','15M','1H','4H')),
  candle_time timestamptz not null,
  open numeric not null check (open > 0),
  high numeric not null check (high > 0),
  low numeric not null check (low > 0),
  close numeric not null check (close > 0),
  source text not null,
  captured_at timestamptz not null default now(),
  primary key (symbol,timeframe,candle_time),
  check (high >= greatest(open,close)),
  check (low <= least(open,close)),
  check (high >= low)
);
create index if not exists market_candle_archive_time_idx on public.market_candle_archive (timeframe,candle_time desc);
create table if not exists public.market_foresight_forecasts (
  id uuid primary key default gen_random_uuid(),
  symbol text not null check (symbol in ('BTCUSD','EURUSD','XAUUSD','USDJPY')),
  generated_at timestamptz not null,
  source text not null,
  model_version text not null,
  model_type text not null,
  horizon text not null check (horizon in ('15M','1H','4H')),
  horizon_minutes integer not null check (horizon_minutes > 0),
  reference_price numeric not null check (reference_price > 0),
  expected_return numeric,
  expected_price numeric,
  lower_price numeric,
  upper_price numeric,
  realized_volatility numeric,
  directional_bias text not null check (directional_bias in ('UP','DOWN','SIDEWAYS','UNCERTAIN')),
  probabilities_calibrated boolean not null default false,
  probability_up numeric,
  probability_down numeric,
  probability_sideways numeric,
  scenario jsonb not null default '{}'::jsonb,
  feature_snapshot jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  evaluation_status text not null default 'PENDING' check (evaluation_status in ('PENDING','READY','INSUFFICIENT_DATA','EVALUATED')),
  created_at timestamptz not null default now()
);
create index if not exists market_foresight_forecasts_symbol_time_idx on public.market_foresight_forecasts (symbol,generated_at desc);
create index if not exists market_foresight_forecasts_pending_idx on public.market_foresight_forecasts (evaluation_status,generated_at);
create table if not exists public.market_foresight_outcomes (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.market_foresight_forecasts(id) on delete cascade,
  evaluated_at timestamptz not null default now(),
  actual_price numeric,
  actual_return numeric,
  actual_high numeric,
  actual_low numeric,
  absolute_error numeric,
  interval_covered boolean,
  outcome_status text not null check (outcome_status in ('REALIZED','MISSING_DATA','INVALID_DATA')),
  source text not null,
  unique (forecast_id)
);
alter table public.market_candle_archive enable row level security;
alter table public.market_foresight_forecasts enable row level security;
alter table public.market_foresight_outcomes enable row level security;
revoke all on public.market_candle_archive, public.market_foresight_forecasts, public.market_foresight_outcomes from anon, authenticated;
grant all on public.market_candle_archive, public.market_foresight_forecasts, public.market_foresight_outcomes to service_role;
