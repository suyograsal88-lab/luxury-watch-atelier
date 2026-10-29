import { supabase, moneyFromPaise } from './supabase-client.js';

const slugs = [
  'rolex-oyster-perpetual-41', 'longines-conquest-41', 'seiko-prospex-spb101', 'tissot-prx-powermatic-80',
  'cartier-santos-medium', 'rado-captain-cook', 'hamilton-khaki-field-auto', 'casio-edifice-efk-100d',
];

const collection = document.querySelector('.watch-grid');
if (collection) {
  const { data: products, error } = await supabase.from('products')
    .select('id,slug,brand,name,image_url,price_paise,stock_qty,active').eq('active', true);
  if (error) console.warn('Product service unavailable:', error.message);
  const bySlug = new Map((products ?? []).map(product => [product.slug, product]));
  collection.querySelectorAll('.watch-card').forEach((card, index) => {
    const product = bySlug.get(slugs[index]);
    const imageLink = card.querySelector('.watch-card-image');
    const img = imageLink?.querySelector('img');
    const name = card.querySelector('h3');
    const brand = card.querySelector('.watch-brand');
    const meta = card.querySelector('.watch-meta');
    if (product) {
      card.dataset.productId = product.id;
      if (img) { img.src = product.image_url; img.alt = `${product.brand} ${product.name}`; }
      if (name) name.textContent = product.name;
      if (brand) brand.textContent = product.brand;
      if (meta?.querySelector('b')) meta.querySelector('b').textContent = moneyFromPaise(product.price_paise);
    }
    const button = document.createElement('button');
    button.className = 'watch-card-buy';
    button.type = 'button';
    button.textContent = product?.stock_qty === 0 ? 'Out of stock' : 'Add to bag';
    button.disabled = product?.stock_qty === 0;
    button.setAttribute('aria-label', `${button.textContent}: ${product?.name ?? name?.textContent ?? 'watch'}`);
    imageLink?.after(button);
    button.addEventListener('click', async () => {
      if (!product) return showNotice('The collection is temporarily unavailable. Please try again shortly.', true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = 'login.html?next=index.html%23collection'; return; }
      const { data: existing, error: readError } = await supabase.from('cart_items').select('quantity')
        .eq('user_id', user.id).eq('product_id', product.id).maybeSingle();
      if (readError) return showNotice(readError.message, true);
      const quantity = (existing?.quantity ?? 0) + 1;
      if (quantity > 20 || (product.stock_qty !== null && quantity > product.stock_qty)) {
        return showNotice('The available quantity is already in your bag.', true);
      }
      const { error: saveError } = await supabase.from('cart_items').upsert({ user_id: user.id, product_id: product.id, quantity });
      if (saveError) return showNotice(saveError.message, true);
      button.textContent = 'Added to bag';
      document.dispatchEvent(new Event('cart:changed'));
      showNotice(`${product.name} added to your bag.`);
      window.setTimeout(() => { button.textContent = 'Add to bag'; }, 1600);
    });
  });
}

function showNotice(text, isError = false) {
  let notice = document.querySelector('.store-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.className = 'store-notice';
    notice.setAttribute('role', 'status');
    document.body.append(notice);
  }
  notice.textContent = text;
  notice.classList.toggle('is-error', isError);
  notice.classList.add('is-visible');
  window.clearTimeout(notice.timer);
  notice.timer = window.setTimeout(() => notice.classList.remove('is-visible'), 3200);
}
