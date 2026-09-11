-- ─── Keep the Render backend awake (free tier sleeps after ~15 min idle) ───
-- Paste into the Supabase SQL Editor and run once. Pings /api/health every 5 minutes
-- via pg_cron + pg_net (both available on the free tier), so MCP connections from
-- Claude never hit a cold start.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any previous keep-alive job to make this idempotent
select cron.unschedule(jobid)
from cron.job
where jobname = 'sentery-backend-keepalive';

-- Ping the Render backend every 5 minutes. 60s timeout so a cold start
-- (30-60s boot) is still counted as a request and resets the idle timer.
select cron.schedule(
  'sentery-backend-keepalive',
  '*/5 * * * *',
  $$ select net.http_get(url := 'https://api.sentery.it.com/api/health', timeout_milliseconds := 60000) $$
);

-- Confirm: should return one row with the job scheduled
select jobid, jobname, schedule, command
from cron.job
where jobname = 'sentery-backend-keepalive';