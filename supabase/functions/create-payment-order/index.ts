import { adminClient, handleOptions, jsonResponse, razorpayAuth, verifiedUser } from '../_shared/common.ts';

const required = ['name', 'email', 'phone', 'address_line', 'city', 'state', 'postal_code'];

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return handleOptions(request);
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed' }, 405);
  const user = await verifiedUser(request);
  if (!user) return jsonResponse(request, { error: 'Sign in to place an order.' }, 401);

  try {
    const body = await request.json();
    const shipping = body?.shipping;
    if (!shipping || required.some(field => typeof shipping[field] !== 'string' || !shipping[field].trim())) {
      return jsonResponse(request, { error: 'Complete all delivery fields.' }, 400);
    }
    if (shipping.email.toLowerCase() !== user.email?.toLowerCase()) {
      return jsonResponse(request, { error: 'Use the email address on your account.' }, 400);
    }
    const { id, header } = razorpayAuth();
    const admin = adminClient();
    const { data: order, error: orderError } = await admin.rpc('create_order_from_cart', {
      p_user_id: user.id,
      p_shipping: {
        name: shipping.name.trim().slice(0, 120),
        email: user.email,
        phone: shipping.phone.trim().slice(0, 30),
        address_line: shipping.address_line.trim().slice(0, 300),
        city: shipping.city.trim().slice(0, 100),
        state: shipping.state.trim().slice(0, 100),
        postal_code: shipping.postal_code.trim().slice(0, 20),
        country: 'India',
      },
    });
    if (orderError) return jsonResponse(request, { error: orderError.message.includes('out of stock') ? 'An item in your cart is out of stock.' : orderError.message.includes('empty') ? 'Your cart is empty.' : 'Could not create the order.' }, 400);

    const gatewayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: header, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: order.total_paise,
        currency: 'INR',
        receipt: `LW-${order.id}`,
        notes: { store_order_id: order.id, user_id: user.id },
      }),
    });
    const gatewayOrder = await gatewayResponse.json();
    if (!gatewayResponse.ok || !gatewayOrder?.id) {
      await admin.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
      console.error('Razorpay order creation failed:', gatewayOrder?.error?.code ?? gatewayResponse.status);
      return jsonResponse(request, { error: 'Payment service could not start. Your cart is ready to try again.' }, 502);
    }
    const { error: updateError } = await admin.from('orders').update({ razorpay_order_id: gatewayOrder.id }).eq('id', order.id);
    if (updateError) {
      console.error('Could not attach Razorpay order to store order:', updateError.message);
      return jsonResponse(request, { error: 'Could not prepare checkout. Contact the store before retrying.' }, 500);
    }
    return jsonResponse(request, {
      orderId: order.id,
      razorpayOrderId: gatewayOrder.id,
      amount: order.total_paise,
      currency: 'INR',
      keyId: id,
      customer: { name: shipping.name.trim(), email: user.email, contact: shipping.phone.trim() },
    });
  } catch (error) {
    console.error('create-payment-order failed:', error instanceof Error ? error.message : 'Unknown error');
    return jsonResponse(request, { error: 'Could not prepare checkout. Check payment setup and try again.' }, 500);
  }
});
