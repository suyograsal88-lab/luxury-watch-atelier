import { supabase, moneyFromPaise } from './supabase-client.js';

const message = document.querySelector('#admin-message');
const productMessage = document.querySelector('#product-message');
const orderMessage = document.querySelector('#order-message');
const productForm = document.querySelector('#product-form');
const productsNode = document.querySelector('#admin-products');
const ordersNode = document.querySelector('#admin-orders');
const allowedTransitions = {
  payment_pending: ['payment_pending','cancelled'],
  paid: ['paid','processing','cancelled'],
  paid_review: ['paid_review','processing','cancelled'],
  processing: ['processing','shipped','cancelled'],
  shipped: ['shipped','delivered','cancelled'],
  delivered: ['delivered'],
  cancelled: ['cancelled'],
  refunded: ['refunded'],
};

const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  message.textContent = 'Sign in with an administrator account to open this page.';
  const link = document.createElement('a'); link.href = 'login.html?next=admin.html'; link.className = 'text-link'; link.textContent = 'Sign in ↗'; message.append(' ', link);
} else {
  const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (error || profile?.role !== 'admin') {
    message.textContent = 'This account does not have store administrator access.';
  } else {
    message.textContent = 'Administrator access confirmed.';
    document.querySelector('[data-admin-panel="products"]').hidden = false;
    await loadProducts();
    await loadOrders();
  }
}

document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
  document.querySelectorAll('[data-admin-panel]').forEach(panel => panel.hidden = panel.dataset.adminPanel !== button.dataset.tab);
}));

async function loadProducts() {
  const { data, error } = await supabase.from('products').select('*').order('brand').order('name');
  if (error) { productMessage.textContent = error.message; return; }
  productsNode.replaceChildren();
  data.forEach(product => {
    const row = document.createElement('div'); row.className = 'admin-product-row';
    const title = document.createElement('strong'); title.textContent = `${product.brand} · ${product.name}${product.active ? '' : ' · HIDDEN'}`;
    const slug = document.createElement('span'); slug.textContent = product.slug;
    const price = document.createElement('span'); price.textContent = moneyFromPaise(product.price_paise);
    const stock = document.createElement('span'); stock.textContent = product.stock_qty === null ? '∞ stock' : `${product.stock_qty} in stock`;
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit';
    edit.addEventListener('click', () => fillForm(product));
    row.append(title, slug, price, stock, edit); productsNode.append(row);
  });
}

function fillForm(product) {
  productForm.elements.id.value = product.id;
  productForm.elements.brand.value = product.brand;
  productForm.elements.name.value = product.name;
  productForm.elements.slug.value = product.slug;
  productForm.elements.price.value = (product.price_paise / 100).toFixed(2);
  productForm.elements.stock_qty.value = product.stock_qty ?? '';
  productForm.elements.image_url.value = product.image_url;
  productForm.elements.description.value = product.description;
  productForm.elements.active.checked = product.active;
  productForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

productForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!productForm.reportValidity()) return;
  const form = new FormData(productForm);
  const product = {
    brand: String(form.get('brand')).trim(), name: String(form.get('name')).trim(), slug: String(form.get('slug')).trim(),
    description: String(form.get('description')).trim(), image_url: String(form.get('image_url')).trim(),
    price_paise: Math.round(Number(form.get('price')) * 100),
    stock_qty: String(form.get('stock_qty')).trim() === '' ? null : Number(form.get('stock_qty')),
    active: form.get('active') === 'on',
  };
  const id = String(form.get('id') ?? '');
  const result = id
    ? await supabase.from('products').update(product).eq('id', id)
    : await supabase.from('products').insert(product);
  if (result.error) { productMessage.textContent = result.error.message; return; }
  productMessage.textContent = id ? 'Product updated.' : 'Product added.';
  productForm.reset(); productForm.elements.id.value = '';
  await loadProducts();
});

productForm.addEventListener('reset', () => { window.setTimeout(() => { productForm.elements.id.value = ''; }, 0); });

async function loadOrders() {
  const { data, error } = await supabase.from('orders').select('id,user_id,status,total_paise,currency,shipping_name,shipping_email,shipping_phone,address_line,city,state,postal_code,created_at').order('created_at', { ascending: false }).limit(100);
  if (error) { orderMessage.textContent = error.message; return; }
  ordersNode.replaceChildren();
  if (!data.length) { orderMessage.textContent = 'No orders yet.'; return; }
  orderMessage.textContent = `${data.length} most recent orders`;
  data.forEach(order => {
    const row = document.createElement('article'); row.className = 'admin-order-row';
    const customer = document.createElement('strong'); customer.textContent = `${order.shipping_name} · ${order.shipping_email}`;
    const ref = document.createElement('span'); ref.textContent = `#${order.id.slice(0, 8).toUpperCase()} · ${new Date(order.created_at).toLocaleDateString('en-IN')}`;
    const amount = document.createElement('span'); amount.textContent = moneyFromPaise(order.total_paise);
    const select = document.createElement('select'); select.setAttribute('aria-label', `Status for order ${order.id.slice(0, 8)}`);
    (allowedTransitions[order.status] ?? [order.status]).forEach(status => { const option = document.createElement('option'); option.value = status; option.textContent = status.replaceAll('_', ' '); select.append(option); });
    select.value = order.status;
    select.addEventListener('change', async () => {
      const { error: updateError } = await supabase.from('orders').update({ status: select.value }).eq('id', order.id);
      if (updateError) { orderMessage.textContent = updateError.message; select.value = order.status; }
      else { order.status = select.value; orderMessage.textContent = `Order ${order.id.slice(0, 8)} updated.`; }
    });
    row.append(customer, ref, amount, select);
    const delivery = document.createElement('p'); delivery.className = 'order-address'; delivery.textContent = `${order.shipping_phone} · ${order.address_line}, ${order.city}, ${order.state} ${order.postal_code}`;
    const wrapper = document.createElement('div'); wrapper.className = 'admin-panel'; wrapper.append(row, delivery); ordersNode.append(wrapper);
  });
}

document.querySelector('[data-tab="orders"]')?.addEventListener('click', loadOrders);
