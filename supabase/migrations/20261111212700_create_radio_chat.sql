create schema radio_internal;
revoke all on schema radio_internal from public;
grant usage on schema radio_internal to anon, authenticated;

create sequence radio_internal.message_id;

create table public.radio_messages (
  slot smallint primary key,
  id bigint not null unique,
  nickname text not null check (char_length(nickname) between 2 and 24),
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
alter table public.radio_messages enable row level security;
revoke all on public.radio_messages from anon, authenticated;
grant select on public.radio_messages to anon, authenticated;
create policy "Read the public radio room"
  on public.radio_messages for select to anon, authenticated using (true);

create table radio_internal.recent_posts (
  slot smallint primary key,
  guest_id uuid not null,
  network_key text,
  posted_at timestamptz not null
);
alter table radio_internal.recent_posts enable row level security;

create function radio_internal.post_message(p_nickname text, p_body text, p_guest uuid)
returns public.radio_messages
language plpgsql security definer set search_path = ''
as $$
declare
  message public.radio_messages;
  headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  network text := nullif(headers->>'cf-connecting-ip', '');
  network_key_value text;
  now_at timestamptz;
  next_id bigint;
begin
  p_nickname := btrim(p_nickname);
  p_body := btrim(p_body);
  if p_guest is null or p_nickname is null or p_body is null
     or char_length(p_nickname) not between 2 and 24
     or char_length(p_body) not between 1 and 300
     or p_nickname ~ '[[:cntrl:]]' or p_body ~ '[[:cntrl:]]' then
    raise sqlstate 'PT400' using message = 'Enter a nickname and a message.';
  end if;

  perform pg_advisory_xact_lock(113221);
  now_at := clock_timestamp();
  network_key_value := case when network is null then null else md5(network || now_at::date::text) end;

  if (select count(*) from radio_internal.recent_posts where posted_at > now_at - interval '15 seconds') >= 30 then
    raise sqlstate 'PT429' using message = 'Chat is busy. Try again in a moment.';
  end if;
  if exists (
    select 1 from radio_internal.recent_posts
    where guest_id = p_guest and posted_at > now_at - interval '3 seconds'
  ) or (
    network_key_value is not null and (
      select count(*) from radio_internal.recent_posts
      where network_key = network_key_value and posted_at > now_at - interval '15 seconds'
    ) >= 6
  ) then
    raise sqlstate 'PT429' using message = 'Give it a few seconds before sending again.';
  end if;

  next_id := nextval('radio_internal.message_id');
  insert into radio_internal.recent_posts values ((next_id % 30)::smallint, p_guest, network_key_value, now_at)
    on conflict (slot) do update set guest_id = excluded.guest_id, network_key = excluded.network_key, posted_at = excluded.posted_at;
  insert into public.radio_messages (slot, id, nickname, body, created_at)
    values ((next_id % 150)::smallint, next_id, p_nickname, p_body, now_at)
    on conflict (slot) do update set id = excluded.id, nickname = excluded.nickname, body = excluded.body, created_at = excluded.created_at
    returning * into message;
  return message;
end;
$$;
revoke all on function radio_internal.post_message(text, text, uuid) from public;
grant execute on function radio_internal.post_message(text, text, uuid) to anon, authenticated;

create function public.post_radio_message(p_nickname text, p_body text, p_guest uuid)
returns public.radio_messages
language sql security invoker set search_path = ''
return radio_internal.post_message(p_nickname, p_body, p_guest);
revoke all on function public.post_radio_message(text, text, uuid) from public;
grant execute on function public.post_radio_message(text, text, uuid) to anon, authenticated;

alter publication supabase_realtime add table public.radio_messages;
