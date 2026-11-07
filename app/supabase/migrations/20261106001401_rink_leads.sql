-- Rinks asking to join or claim their page, from the website's claim form.
create table if not exists rink_leads (
  id serial primary key,
  rink_id int references rinks(id) on delete set null,
  rink_name text not null,
  city text,
  contact_name text not null,
  role text,
  email text not null,
  phone text,
  league_count text,
  scheduler text,
  founding boolean not null default true,
  notes text,
  status text not null default 'new' check (status in ('new', 'contacted', 'onboarding', 'won', 'lost')),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rink_leads_status on rink_leads(status, created_at desc);
alter table rink_leads enable row level security;
revoke all on public.rink_leads from anon, authenticated;
