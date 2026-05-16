create table if not exists subscription_categories (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  name       text not null,
  color      text not null default '#6366f1',
  created_at timestamptz default now()
);

alter table subscription_categories enable row level security;

create policy "Users manage own categories"
  on subscription_categories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists subscription_category_map (
  id              bigint generated always as identity primary key,
  user_id         uuid references auth.users(id) on delete cascade not null,
  subscription_id text not null,
  category_id     bigint references subscription_categories(id) on delete cascade not null,
  unique (user_id, subscription_id, category_id)
);

alter table subscription_category_map enable row level security;

create policy "Users manage own mappings"
  on subscription_category_map for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
