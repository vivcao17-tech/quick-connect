create or replace function public.admin_median(_values double precision[])
returns double precision language sql immutable set search_path = public as $$
  select percentile_cont(0.5) within group (order by v)
  from unnest(_values) v where v is not null
$$;
revoke all on function public.admin_median(double precision[]) from public, anon, authenticated;
grant execute on function public.admin_median(double precision[]) to service_role;