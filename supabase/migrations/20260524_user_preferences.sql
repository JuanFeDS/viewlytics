create table if not exists user_preferences (
  user_id          uuid references auth.users(id) on delete cascade primary key,
  subs_sort_order  text not null default 'youtube'
);

alter table user_preferences enable row level security;

create policy "Users manage own preferences"
  on user_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
