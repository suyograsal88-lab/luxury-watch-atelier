create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  brand text not null,
  name text not null,
  description text not null default '',
  image_url text not null default '',
  price_paise bigint not null check (price_paise >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  stock_qty integer check (stock_qty is null or stock_qty >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'payment_pending' check (status in ('payment_pending','paid','paid_review','processing','shipped','delivered','cancelled','refunded')),
  total_paise bigint not null check (total_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  shipping_name text not null,
  shipping_email text not null,
  shipping_phone text not null,
  address_line text not null,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'India',
  razorpay_order_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_slug text not null,
  brand text not null,
  product_name text not null,
  image_url text not null default '',
  unit_price_paise bigint not null check (unit_price_paise >= 0),
  quantity integer not null check (quantity between 1 and 20)
);

create table if not exists public.gateway_payments (
  payment_id text primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  razorpay_order_id text not null,
  amount_paise bigint not null,
  currency text not null,
  status text not null default 'captured',
  created_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

create or replace function public.protect_order_payment_state()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('postgres', 'service_role') then
    if old.user_id is distinct from new.user_id
      or old.total_paise is distinct from new.total_paise
      or old.currency is distinct from new.currency
      or old.razorpay_order_id is distinct from new.razorpay_order_id
      or old.paid_at is distinct from new.paid_at then
      raise exception 'Order totals and payment references are protected';
    end if;
    if new.status is distinct from old.status then
      if new.status in ('payment_pending','paid','paid_review','refunded') then
        raise exception 'Payment statuses are managed by the payment service';
      end if;
      if new.status in ('processing','shipped','delivered') and old.status not in ('paid','paid_review','processing','shipped') then
        raise exception 'Only paid orders can advance to fulfilment';
      end if;
      if (old.status = 'payment_pending' and new.status <> 'cancelled')
        or (old.status in ('paid','paid_review') and new.status not in ('processing','cancelled'))
        or (old.status = 'processing' and new.status not in ('shipped','cancelled'))
        or (old.status = 'shipped' and new.status not in ('delivered','cancelled')) then
        raise exception 'Invalid order status transition';
      end if;
      if old.status in ('delivered','cancelled','refunded') then
        raise exception 'This order status is final';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_protect_payment_state on public.orders;
create trigger orders_protect_payment_state before update on public.orders
for each row execute function public.protect_order_payment_state();

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists auth_user_profile on auth.users;
create trigger auth_user_profile after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.protect_profile_role()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.role is distinct from new.role and current_user not in ('postgres', 'service_role') then
    raise exception 'Profile role changes require a trusted administrator';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before update on public.profiles
for each row execute function public.protect_profile_role();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.gateway_payments enable row level security;
alter table public.payment_events enable row level security;

drop policy if exists "profiles read self or admin" on public.profiles;
create policy "profiles read self or admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "active products are public" on public.products;
create policy "active products are public" on public.products for select to anon, authenticated
using (active or public.is_admin());
drop policy if exists "admins manage products" on public.products;
create policy "admins manage products" on public.products for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "customers manage own cart" on public.cart_items;
create policy "customers manage own cart" on public.cart_items for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "customers read own orders" on public.orders;
create policy "customers read own orders" on public.orders for select to authenticated
using (user_id = auth.uid() or public.is_admin());
drop policy if exists "admins update orders" on public.orders;
create policy "admins update orders" on public.orders for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "customers read own order items" on public.order_items;
create policy "customers read own order items" on public.order_items for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));

drop policy if exists "customers read own payments" on public.gateway_payments;
create policy "customers read own payments" on public.gateway_payments for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
drop policy if exists "admins read payment events" on public.payment_events;
create policy "admins read payment events" on public.payment_events for select to authenticated
using (public.is_admin());

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.cart_items to authenticated;
grant select on public.profiles, public.orders, public.order_items, public.gateway_payments to authenticated;
grant update on public.profiles to authenticated;
grant update on public.orders to authenticated;
grant select on public.payment_events to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.create_order_from_cart(p_user_id uuid, p_shipping jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_total bigint;
begin
  if p_user_id is null or p_shipping is null then raise exception 'Missing order details'; end if;
  perform p.id from public.products p join public.cart_items c on c.product_id = p.id
  where c.user_id = p_user_id and p.active for update of p;
  if not exists (select 1 from public.cart_items c join public.products p on p.id = c.product_id where c.user_id = p_user_id and p.active) then
    raise exception 'Cart is empty';
  end if;
  if exists (select 1 from public.cart_items c join public.products p on p.id = c.product_id where c.user_id = p_user_id and p.active and p.stock_qty is not null and p.stock_qty < c.quantity) then
    raise exception 'An item in your cart is out of stock';
  end if;
  select sum(c.quantity * p.price_paise) into v_total
  from public.cart_items c join public.products p on p.id = c.product_id
  where c.user_id = p_user_id and p.active;
  if v_total is null or v_total <= 0 then raise exception 'Cart total is invalid'; end if;
  insert into public.orders (user_id,total_paise,shipping_name,shipping_email,shipping_phone,address_line,city,state,postal_code,country)
  values (p_user_id,v_total,
    trim(p_shipping->>'name'),lower(trim(p_shipping->>'email')),trim(p_shipping->>'phone'),
    trim(p_shipping->>'address_line'),trim(p_shipping->>'city'),trim(p_shipping->>'state'),trim(p_shipping->>'postal_code'),coalesce(nullif(trim(p_shipping->>'country'),''),'India'))
  returning id into v_order_id;
  insert into public.order_items (order_id,product_id,product_slug,brand,product_name,image_url,unit_price_paise,quantity)
  select v_order_id,p.id,p.slug,p.brand,p.name,p.image_url,p.price_paise,c.quantity
  from public.cart_items c join public.products p on p.id = c.product_id
  where c.user_id = p_user_id and p.active;
  return jsonb_build_object('id',v_order_id,'total_paise',v_total);
end;
$$;

create or replace function public.apply_razorpay_capture(
  p_event_id text, p_event_type text, p_razorpay_order_id text,
  p_payment_id text, p_amount_paise bigint, p_currency text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_rows integer;
  v_payment_exists boolean;
  v_status text;
begin
  select * into v_order from public.orders where razorpay_order_id = p_razorpay_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.total_paise <> p_amount_paise or v_order.currency <> p_currency then raise exception 'Payment amount does not match order'; end if;
  insert into public.payment_events(event_id,event_type) values (p_event_id,p_event_type)
  on conflict (event_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('status',v_order.status,'duplicate',true);
  end if;
  select exists(select 1 from public.gateway_payments where payment_id = p_payment_id) into v_payment_exists;
  if v_payment_exists then
    return jsonb_build_object('status',v_order.status,'duplicate',true);
  end if;
  insert into public.gateway_payments(payment_id,order_id,razorpay_order_id,amount_paise,currency,status)
  values (p_payment_id,v_order.id,p_razorpay_order_id,p_amount_paise,p_currency,'captured')
  on conflict (payment_id) do nothing;
  if v_order.status in ('paid','processing','shipped','delivered') then
    update public.orders set status = 'paid_review', paid_at = coalesce(paid_at,now()) where id = v_order.id;
    return jsonb_build_object('status','paid_review','duplicate',false);
  end if;
  perform p.id from public.products p join public.order_items oi on oi.product_id = p.id
  where oi.order_id = v_order.id order by p.id for update of p;
  if exists (
    select 1 from public.order_items oi join public.products p on p.id = oi.product_id
    where oi.order_id = v_order.id and p.stock_qty is not null and p.stock_qty < oi.quantity
  ) then
    update public.orders set status = 'paid_review', paid_at = now() where id = v_order.id;
  else
    update public.products p set stock_qty = p.stock_qty - oi.quantity
    from public.order_items oi where oi.order_id = v_order.id and oi.product_id = p.id and p.stock_qty is not null;
    update public.orders set status = 'paid', paid_at = now() where id = v_order.id;
  end if;
  delete from public.cart_items c using public.order_items oi
  where c.user_id = v_order.user_id and c.product_id = oi.product_id
    and c.quantity = oi.quantity and oi.order_id = v_order.id;
  select status into v_status from public.orders where id = v_order.id;
  return jsonb_build_object('status',v_status,'duplicate',false);
end;
$$;

revoke all on function public.create_order_from_cart(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.apply_razorpay_capture(text,text,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.create_order_from_cart(uuid,jsonb) to service_role;
grant execute on function public.apply_razorpay_capture(text,text,text,text,bigint,text) to service_role;

insert into public.products (slug,brand,name,description,image_url,price_paise,stock_qty) values
('rolex-oyster-perpetual-41','ROLEX','Oyster Perpetual 41','41 mm Oystersteel with a blue dial.','https://media.rolex.com/image/upload/q_auto:eco/f_auto/t_v7-grid/c_limit,w_1920/v1/a677b2c664f6/catalogue/2026/upright-bba-with-shadow/m134300-0009',68610000,3),
('longines-conquest-41','LONGINES','Conquest 41 mm','A blue dial Conquest with a stainless-steel bracelet.','https://api.ecom.longines.com/media/catalog/product/w/a/watch-collection-conquest-l3-860-4-92-6-899f25-hero.png?w=1080',15200000,5),
('seiko-prospex-spb101','SEIKO','Prospex SPB101','Automatic diver with 200 m water resistance.','https://www.seikowatches.com/in-en/-/media/Images/Product--Image/All/Seiko/2022/02/20/00/43/SPB101J1/SPB101J1.png?mh=1200&mw=1200',9500000,8),
('tissot-prx-powermatic-80','TISSOT','PRX Powermatic 80','40 mm automatic watch with a blue dial.','https://www.tissotwatches.com/dw/image/v2/BKKD_PRD/on/demandware.static/-/Sites-Tissot-Catalogue/default/dw95c4331d/product-pictures/63f42767-a9f5-4cdd-b952-8ea7b82b7e0c_T137-407-11-041-00_shadow.png?sh=800&sm=fit&sw=800',8350000,6),
('cartier-santos-medium','CARTIER','Santos de Cartier','Medium automatic steel model with the iconic square case.','https://denali-staging.cartier.com/dw/image/v2/BGTJ_STG/on/demandware.static/-/Sites-cartier-master/default/dw76f8f7a8/images/large/b66edd509d8d5796a5828ef84e9d3586.png?sfrm=png&sh=750&sm=fit&sw=750',87000000,2),
('rado-captain-cook','RADO','Captain Cook Automatic','42 mm automatic diver with 300 m water resistance.','https://www.rado.com/media/catalog/product/r/g/rgb_cat_captaincook_763_6105_3_031_4.png',27180000,4),
('hamilton-khaki-field-auto','HAMILTON','Khaki Field Auto','38 mm field watch with an 80-hour power reserve.','https://www.hamiltonwatch.com/media/catalog/product/cache/d24a34bded6d2df740ef66d66d2112c9/h/7/h70455533.png',8400000,7),
('casio-edifice-efk-100d','CASIO · EDIFICE','EFK-100D-2A','Automatic Edifice with a forged-carbon dial.','https://www.casio.com/content/dam/casio/product-info/locales/us/en/timepiece/product/watch/E/EF/efk/efk-100d-2a/assets/EFK-100D-2A.png.transform/main-visual-sp/image.png',2599500,12)
on conflict (slug) do nothing;
