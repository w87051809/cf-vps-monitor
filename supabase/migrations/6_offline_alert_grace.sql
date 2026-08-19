alter table public.offline_notifications
  alter column grace_period set default 1800;

update public.offline_notifications
set grace_period = 1800,
    last_notified = null
where enable <> 0
  and grace_period < 1800;
