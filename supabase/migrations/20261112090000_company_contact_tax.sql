-- Migration: Add company tax number, phone, email, and address, and update company_update_profile

-- 1. Add contact and tax columns to public.companies
alter table public.companies
  add column if not exists tax_number text check (tax_number is null or char_length(tax_number) <= 30),
  add column if not exists phone text check (phone is null or char_length(phone) <= 30),
  add column if not exists email text check (email is null or char_length(email) <= 200),
  add column if not exists address text check (address is null or char_length(address) <= 250);

-- 2. Update company_update_profile function to support the new fields
create or replace function public.company_update_profile(
  p_name_ar text,
  p_name_en text,
  p_commercial_reg text,
  p_tax_number text default null,
  p_phone text default null,
  p_email text default null,
  p_address text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.auth_role() is distinct from 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.companies set
    name_ar = p_name_ar,
    name_en = nullif(p_name_en, ''),
    commercial_reg = nullif(p_commercial_reg, ''),
    tax_number = nullif(p_tax_number, ''),
    phone = nullif(p_phone, ''),
    email = lower(nullif(p_email, '')),
    address = nullif(p_address, '')
  where id = private.auth_company_id();
end;
$$;

grant execute on function public.company_update_profile(text, text, text, text, text, text, text) to authenticated;
