-- ════════════════════════════════════════════
-- CryptoBot Pro — Supabase Schema
-- הרץ את זה ב-SQL Editor של Supabase
-- ════════════════════════════════════════════

-- טבלת עסקאות
create table if not exists bot_trades (
  id bigint generated always as identity primary key,
  sym text not null,
  side text not null check (side in ('LONG','SHORT')),
  entry_price numeric not null,
  exit_price numeric,
  size numeric not null,
  pnl numeric,
  pnl_pct numeric,
  status text not null default 'OPEN' check (status in ('OPEN','TP','SL','TRAIL')),
  trail_sl numeric not null,
  fee numeric not null default 0,
  hi numeric not null,
  lo numeric not null,
  score int default 0,
  mtf boolean default false,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

-- טבלת מצב הבוט (שורה יחידה)
create table if not exists bot_state (
  id int primary key default 1,
  balance numeric not null default 10000,
  risk text not null default 'medium',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- הכנסת שורת ברירת מחדל
insert into bot_state (id, balance, risk, active)
values (1, 10000, 'medium', true)
on conflict (id) do nothing;

-- הרשאות קריאה פומביות (לממשק האינטרנט)
alter table bot_trades enable row level security;
alter table bot_state  enable row level security;

create policy "allow_read_trades" on bot_trades for select using (true);
create policy "allow_read_state"  on bot_state  for select using (true);

-- אינדקסים לביצועים
create index if not exists idx_bot_trades_status on bot_trades(status);
create index if not exists idx_bot_trades_sym    on bot_trades(sym);
create index if not exists idx_bot_trades_opened on bot_trades(opened_at desc);

-- Realtime (לעדכונים חיים בממשק)
alter publication supabase_realtime add table bot_trades;
alter publication supabase_realtime add table bot_state;
