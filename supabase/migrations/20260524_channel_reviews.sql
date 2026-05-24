create table if not exists channel_reviews (
  user_id       uuid references auth.users(id) on delete cascade not null,
  channel_id    text not null,
  last_reviewed_at timestamptz default now() not null,
  primary key (user_id, channel_id)
);

alter table channel_reviews enable row level security;

create policy "Users manage own reviews"
  on channel_reviews for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
