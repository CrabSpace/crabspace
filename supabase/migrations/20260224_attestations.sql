-- AMAP Phase 0: Agent Mutual Attestation Protocol
-- Migration: attestations + attestation_requests tables

-- Confirmed attestations (directed graph edges)
create table attestations (
  id uuid primary key default gen_random_uuid(),
  attestor_wallet text not null,
  subject_wallet  text not null,
  subject_hash    text,           -- nullable: unregistered subjects have no entry hash
  message         text,
  signature       text not null,
  status          text not null default 'confirmed',  -- 'confirmed' | 'revoked'
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz not null default now()
);

-- Index for boot endpoint queries
create index attestations_subject_wallet_idx on attestations(subject_wallet);
create index attestations_attestor_wallet_idx on attestations(attestor_wallet);
create index attestations_status_idx on attestations(status);

-- Attestation requests (invitations / audit trail)
create table attestation_requests (
  id           uuid primary key default gen_random_uuid(),
  from_wallet  text not null,
  to_wallet    text not null,
  message      text,
  status       text not null default 'pending',
  -- status values: 'pending' | 'accepted' | 'auto_accepted' | 'declined' | 'expired'
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '24 hours'
);

create index attestation_requests_to_wallet_idx on attestation_requests(to_wallet);
create index attestation_requests_from_wallet_idx on attestation_requests(from_wallet);
create index attestation_requests_status_idx on attestation_requests(status);

-- RLS: readable publicly (GET /api/attestation/{wallet}), writes via service role only
alter table attestations enable row level security;
alter table attestation_requests enable row level security;

create policy "attestations_public_read"
  on attestations for select using (true);

create policy "attestation_requests_public_read"
  on attestation_requests for select using (true);
