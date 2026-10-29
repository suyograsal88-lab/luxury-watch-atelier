import { supabase, moneyFromPaise } from './supabase-client.js';

const container = document.querySelector('#orders-list');
const message = document.querySelector('#orders-message');
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  message.textContent = 'Sign in to view your order history.';
  const link = document.createElement('a'); link.className = 'text-link'; link.href = 'login.html?next=orders.html'; link.textContent = 'Sign in ↗';
  container.append(link);
} else {
  const { data: orders, error } = await supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) message.textContent = 'Could not load your orders. Please refresh the page.';
  else if (!orders?.length) message.textContent = 'Your order history will appear here after checkout.';
  else {
    message.textContent = `${orders.length} order${orders.length === 1 ? '' : 's'} on your account`;
    for (const order of orders) {
      const card = document.createElement('article'); card.className = 'order-card';
      const heading = document.createElement('div'); heading.className = 'order-card-heading';
      const orderNumber = document.createElement('p'); orderNumber.className = 'eyebrow'; orderNumber.textContent = `ORDER · ${order.id.slice(0, 8).toUpperCase()}`;
      const state = document.createElement('span'); state.className = `order-status status-${order.status}`; state.textContent = order.status.replaceAll('_', ' ');
      heading.append(orderNumber, state);
      const summary = document.createElement('p'); summary.className = 'order-summary'; summary.textContent = `${new Date(order.created_at).toLocaleDateString('en-IN', { dateStyle: 'long' })} · ${moneyFromPaise(order.total_paise)}`;
      card.append(heading, summary);
      const { data: lines } = await supabase.from('order_items').select('brand,product_name,quantity,unit_price_paise').eq('order_id', order.id);
      const list = document.createElement('ul'); list.className = 'order-lines';
      (lines ?? []).forEach(line => { const li = document.createElement('li'); li.textContent = `${line.brand} · ${line.product_name} × ${line.quantity} — ${moneyFromPaise(line.unit_price_paise * line.quantity)}`; list.append(li); });
      const address = document.createElement('p'); address.className = 'order-address'; address.textContent = `${order.shipping_name} · ${order.address_line}, ${order.city}, ${order.state} ${order.postal_code}`;
      card.append(list, address); container.append(card);
    }
  }
}
