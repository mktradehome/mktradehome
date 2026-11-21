-- Owner-scoped, read-only scanner observability RPC.
-- No trading rules, approvals, alerts, queues or execution settings are modified.
drop view if exists public.mktradehome_scan_run_status;

create or replace function public.mktradehome_scan_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() = 'eb254614-cc9d-4846-adb6-fd45e5594a96'::uuid then
      pg_catalog.jsonb_build_object(
        'schedule',
        (
          select pg_catalog.jsonb_build_object(
            'jobName', j.jobname,
            'schedule', j.schedule,
            'active', j.active
          )
          from cron.job as j
          where j.jobname = 'mktradehome-market-monitor'
          limit 1
        ),
        'latestRun',
        (
          select pg_catalog.jsonb_build_object(
            'startedAt', r.start_time,
            'endedAt', r.end_time,
            'status', r.status
          )
          from cron.job_run_details as r
          join cron.job as j on j.jobid = r.jobid
          where j.jobname = 'mktradehome-market-monitor'
          order by r.start_time desc
          limit 1
        ),
        'recentRuns',
        (
          select coalesce(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'startedAt', recent.start_time,
                'status', recent.status
              ) order by recent.start_time desc
            ),
            '[]'::jsonb
          )
          from (
            select r.start_time, r.status
            from cron.job_run_details as r
            join cron.job as j on j.jobid = r.jobid
            where j.jobname = 'mktradehome-market-monitor'
              and r.start_time >= pg_catalog.now() - interval '24 hours'
            order by r.start_time desc
            limit 500
          ) as recent
        ),
        'markets',
        (
          select coalesce(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'symbol', s.symbol,
                'bias', s.bias,
                'regime', s.regime,
                'score', s.score,
                'summary', s.summary,
                'quoteAgeSeconds', s.quote_age_seconds,
                'updatedAt', s.updated_at,
                'timeframes', s.timeframes
              ) order by s.symbol
            ),
            '[]'::jsonb
          )
          from public.market_analysis_snapshots as s
          where s.user_id = 'eb254614-cc9d-4846-adb6-fd45e5594a96'::uuid
        ),
        'latestCandidate',
        (
          select pg_catalog.jsonb_build_object(
            'id', s.id,
            'symbol', s.symbol,
            'signal', s.signal,
            'createdAt', s.created_at,
            'analysis', s.analysis
          )
          from public.trade_signals as s
          where s.user_id = 'eb254614-cc9d-4846-adb6-fd45e5594a96'::uuid
            and s.analysis like '%mktradehome-technical-engine%'
          order by s.created_at desc
          limit 1
        ),
        'notifications',
        pg_catalog.jsonb_build_object(
          'telegramConnections',
          (select pg_catalog.count(*) from public.telegram_users as t
           where t.user_id = 'eb254614-cc9d-4846-adb6-fd45e5594a96'::uuid),
          'browserPushSubscriptions',
          (select pg_catalog.count(*) from public.push_subscriptions as p
           where p.user_id = 'eb254614-cc9d-4846-adb6-fd45e5594a96'::uuid),
          'unreadAlerts',
          (select pg_catalog.count(*) from public.trade_alerts as a
           where a.user_id = 'eb254614-cc9d-4846-adb6-fd45e5594a96'::uuid
             and a.is_read = false),
          'latestAlertAt',
          (select pg_catalog.max(a.created_at) from public.trade_alerts as a
           where a.user_id = 'eb254614-cc9d-4846-adb6-fd45e5594a96'::uuid)
        )
      )
    else null
  end;
$$;

revoke all on function public.mktradehome_scan_status() from public, anon, authenticated;
grant execute on function public.mktradehome_scan_status() to authenticated;

comment on function public.mktradehome_scan_status() is
'Owner-scoped read-only Mktradehome scanner observability. Authenticated caller must match the private dashboard owner UUID. Returns cron heartbeat, per-market stored analysis freshness, latest verified-candidate source row and notification registration counts. No writes or trade actions.';
