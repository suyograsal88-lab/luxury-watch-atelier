import { supabase, moneyFromPaise } from './supabase-client.js';

const itemsNode = document.querySelector('#cart-items');
const messageNode = document.querySelector('#cart-message');
const checkoutForm = document.querySelector('#checkout-form');
const statusNode = document.querySelector('#checkout-status');
const totalNode = document.querySelector('#cart-total');
let user;
let cart = [];

function setStatus(text, error = false) {
  statusNode.textContent = text;
  statusNode.classList.toggle('is-error', error);
}

async function loadCart() {
  const { data: auth } = await supabase.auth.getUser();
  user = auth.user;
  if (!user) {
    messageNode.textContent = 'Sign in to see your saved bag and place an order.';
    itemsNode.replaceChildren();
    const link = document.createElement('a');
    link.className = 'text-link'; link.href = 'login.html?next=cart.html'; link.textContent = 'Sign in to continue ↗';
    itemsNode.append(link);
    checkoutForm.hidden = true;
    return;
  }
  checkoutForm.elements.email.value = user.email ?? '';
  const { data, error } = await supabase.from('cart_items')
    .select('product_id,quantity,products(name,brand,image_url,price_paise,stock_qty,active)')
    .eq('user_id', user.id);
  if (error) { messageNode.textContent = 'Could not load your bag. Please refresh the page.'; return; }
  cart = (data ?? []).filter(item => item.products?.active);
  renderCart();
}

function renderCart() {
  itemsNode.replaceChildren();
  const total = cart.reduce((sum, item) => sum + item.quantity * item.products.price_paise, 0);
  totalNode.textContent = moneyFromPaise(total);
  if (!cart.length) {
    messageNode.textContent = 'Your bag is waiting for something timeless.';
    checkoutForm.hidden = true;
    return;
  }
  messageNode.textContent = `${cart.reduce((sum, item) => sum + item.quantity, 0)} piece${cart.reduce((sum, item) => sum + item.quantity, 0) === 1 ? '' : 's'} selected`;
  checkoutForm.hidden = false;
  cart.forEach(item => {
    const product = item.products;
    const row = document.createElement('article'); row.className = 'cart-item';
    const img = document.createElement('img'); img.src = product.image_url; img.alt = `${product.brand} ${product.name}`;
    const copy = document.createElement('div'); copy.className = 'cart-item-copy';
    const brand = document.createElement('p'); brand.className = 'eyebrow'; brand.textContent = product.brand;
    const name = document.createElement('h2'); name.textContent = product.name;
    const price = document.createElement('p'); price.textContent = moneyFromPaise(product.price_paise);
    const controls = document.createElement('div'); controls.className = 'quantity-controls';
    const quantity = document.createElement('input'); quantity.type = 'number'; quantity.min = '1'; quantity.max = String(Math.min(20, product.stock_qty ?? 20)); quantity.value = String(item.quantity); quantity.setAttribute('aria-label', `Quantity for ${product.name}`);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-item'; remove.textContent = 'Remove';
    quantity.addEventListener('change', () => updateQuantity(item.product_id, Number(quantity.value)));
    remove.addEventListener('click', () => updateQuantity(item.product_id, 0));
    controls.append(quantity, remove); copy.append(brand, name, price, controls); row.append(img, copy); itemsNode.append(row);
  });
}

async function updateQuantity(productId, quantity) {
  if (!user) return;
  if (quantity <= 0) {
    const { error } = await supabase.from('cart_items').delete().eq('user_id', user.id).eq('product_id', productId);
    if (error) return setStatus('Could not remove that item.', true);
  } else {
    const current = cart.find(item => item.product_id === productId);
    if (quantity > 20 || (current.products.stock_qty !== null && quantity > current.products.stock_qty)) {
      setStatus('That quantity is not available.', true); return renderCart();
    }
    const { error } = await supabase.from('cart_items').upsert({ user_id: user.id, product_id: productId, quantity });
    if (error) return setStatus(error.message, true);
  }
  setStatus('Bag updated.');
  document.dispatchEvent(new Event('cart:changed'));
  await loadCart();
}

checkoutForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!checkoutForm.reportValidity()) return;
  if (!window.Razorpay) return setStatus('Razorpay Checkout could not load. Check the connection and try again.', true);
  const data = new FormData(checkoutForm);
  const shipping = Object.fromEntries(['name','email','phone','address_line','city','state','postal_code'].map(key => [key, String(data.get(key) ?? '').trim()]));
  const { data: paymentOrder, error } = await supabase.functions.invoke('create-payment-order', { body: { shipping } });
  if (error || !paymentOrder?.razorpayOrderId) return setStatus(paymentOrder?.error ?? error?.message ?? 'Could not start checkout.', true);
  const checkout = new window.Razorpay({
    key: paymentOrder.keyId,
    amount: paymentOrder.amount,
    currency: paymentOrder.currency,
    name: 'Luxury Watch',
    description: 'Your selected timepiece',
    order_id: paymentOrder.razorpayOrderId,
    prefill: paymentOrder.customer,
    notes: { store_order_id: paymentOrder.orderId },
    theme: { color: '#c8a66a' },
    handler: async response => {
      setStatus('Confirming your payment…');
      const { data: result, error: verifyError } = await supabase.functions.invoke('verify-payment', {
        body: { orderId: paymentOrder.orderId, ...response },
      });
      if (verifyError || !result?.success) {
        setStatus(result?.error ?? 'Payment confirmation is pending. Check My orders shortly.', true);
        return;
      }
      window.location.href = `orders.html?order=${encodeURIComponent(paymentOrder.orderId)}`;
    },
    modal: { ondismiss: () => setStatus('Checkout closed. Your order is saved under My orders.') },
  });
  checkout.open();
});

loadCart();
