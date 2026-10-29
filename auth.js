import { supabase } from './supabase-client.js';

const header = document.querySelector('.site-header');
const authLink = document.querySelector('[data-auth-link]');
const registerForm = document.querySelector('[data-register-form]');
const loginForm = document.querySelector('[data-login-form]');

function message(form, text, error = false) {
  const output = form?.querySelector('.form-status');
  if (!output) return;
  output.textContent = text;
  output.classList.toggle('is-error', error);
}

function addHeaderLink(attribute, className, label, href) {
  if (!header || header.querySelector(`[${attribute}]`)) return;
  const link = document.createElement('a');
  link.className = className;
  link.setAttribute(attribute, '');
  link.href = href;
  link.textContent = label;
  const explore = header.querySelector('.header-link');
  header.insertBefore(link, explore ?? null);
}

addHeaderLink('data-cart-link', 'cart-link', 'Bag · 0', 'cart.html');
addHeaderLink('data-orders-link', 'orders-link', 'My orders', 'orders.html');
addHeaderLink('data-admin-link', 'admin-link', 'Admin', 'admin.html');
document.querySelector('[data-orders-link]')?.setAttribute('hidden', '');
document.querySelector('[data-admin-link]')?.setAttribute('hidden', '');

async function updateHeader() {
  const { data: { user } } = await supabase.auth.getUser();
  if (authLink) {
    authLink.textContent = user ? 'Sign out' : 'Sign in';
    authLink.href = user ? '#' : 'login.html';
    authLink.setAttribute('aria-label', user ? 'Sign out' : 'Sign in');
  }
  const adminLink = document.querySelector('[data-admin-link]');
  const ordersLink = document.querySelector('[data-orders-link]');
  if (ordersLink) ordersLink.hidden = !user;
  if (user) {
    const [{ data: profile }, { data: cart }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('cart_items').select('quantity').eq('user_id', user.id),
    ]);
    if (adminLink && profile?.role === 'admin') adminLink.hidden = false;
    const cartLink = document.querySelector('[data-cart-link]');
    if (cartLink) cartLink.textContent = `Bag · ${(cart ?? []).reduce((sum, item) => sum + item.quantity, 0)}`;
  }
}

authLink?.addEventListener('click', async event => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  event.preventDefault();
  await supabase.auth.signOut();
  window.location.href = 'index.html';
});

registerForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!registerForm.reportValidity()) return;
  const data = new FormData(registerForm);
  const password = String(data.get('password'));
  if (password !== String(data.get('password_confirm'))) return message(registerForm, 'Passwords do not match.', true);
  const { data: result, error } = await supabase.auth.signUp({
    email: String(data.get('email')).trim(),
    password,
    options: { data: { full_name: String(data.get('full_name')).trim() }, emailRedirectTo: new URL('login.html', location.href).href },
  });
  if (error) return message(registerForm, error.message, true);
  if (result.session) window.location.href = 'index.html';
  else message(registerForm, 'Account created. Check your email to confirm, then sign in.');
});

loginForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!loginForm.reportValidity()) return;
  const data = new FormData(loginForm);
  const { error } = await supabase.auth.signInWithPassword({
    email: String(data.get('email')).trim(),
    password: String(data.get('password')),
  });
  if (error) return message(loginForm, error.message, true);
  const next = new URLSearchParams(location.search).get('next');
  window.location.href = ['cart.html', 'orders.html', 'admin.html', 'index.html#collection'].includes(next) ? next : 'index.html';
});

supabase.auth.onAuthStateChange(() => updateHeader());
document.addEventListener('cart:changed', updateHeader);
updateHeader();
