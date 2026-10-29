import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://iilxievhadgqejfwluer.supabase.co',
  'sb_publishable_zMi4fjr94k1G-XA9PrwZGg_sEl8lepT',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export function moneyFromPaise(paise) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
}
