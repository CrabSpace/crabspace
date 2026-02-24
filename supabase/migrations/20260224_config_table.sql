-- SOL fee config table
-- Stores live lamport values fetched from CoinGecko by Vercel cron.
-- Routes read from this instead of env vars so fees stay accurate without redeployment.

create table if not exists config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Seed with current values (accurate at 2026-02-24, SOL ~$78)
insert into config (key, value) values
  ('WORK_ENTRY_FEE_LAMPORTS',    '127959'),
  ('WILL_SUCCESSION_FEE_LAMPORTS', '3198976'),
  ('SOL_USD_PRICE',              '78.15'),
  ('FEES_LAST_UPDATED',          now()::text)
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

-- Public read (fee values are not sensitive), service-role write only
alter table config enable row level security;

create policy "config_public_read"
  on config for select using (true);
