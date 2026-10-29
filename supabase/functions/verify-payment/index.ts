import { adminClient, constantTimeEqual, handleOptions, hmacHex, jsonResponse, razorpayAuth, verifiedUser } from '../_shared/common.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return handleOptions(request);
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed' }, 405);
  const user = await verifiedUser(request);
  if (!user) return jsonResponse(request, { error: 'Sign in to verify this payment.' }, 401);

  try {
    const body = await request.json();
    const { orderId, razorpay_order_id: gatewayOrderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body ?? {};
    if (![orderId, gatewayOrderId, paymentId, signature].every(value => typeof value === 'string' && value.length < 200)) {
      return jsonResponse(request, { error: 'Payment details are incomplete.' }, 400);
    }
    const admin = adminClient();
    const { data: order, error } = await admin.from('orders')
      .select('id,user_id,total_paise,currency,razorpay_order_id,status')
      .eq('id', orderId).eq('user_id', user.id).maybeSingle();
    if (error || !order || order.razorpay_order_id !== gatewayOrderId) return jsonResponse(request, { error: 'Order could not be verified.' }, 404);

    const { secret, header } = razorpayAuth();
    const expected = await hmacHex(secret, `${gatewayOrderId}|${paymentId}`);
    if (!constantTimeEqual(expected, signature)) return jsonResponse(request, { error: 'Payment signature is invalid.' }, 400);

    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: header },
    });
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok || payment.order_id !== gatewayOrderId || payment.amount !== order.total_paise || payment.currency !== order.currency || payment.status !== 'captured' || payment.captured !== true) {
      return jsonResponse(request, { error: 'Payment is not captured yet. Your order will update once Razorpay confirms it.' }, 409);
    }
    const { data: result, error: applyError } = await admin.rpc('apply_razorpay_capture', {
      p_event_id: `checkout:${paymentId}`,
      p_event_type: 'checkout.signature_verified',
      p_razorpay_order_id: gatewayOrderId,
      p_payment_id: paymentId,
      p_amount_paise: payment.amount,
      p_currency: payment.currency,
    });
    if (applyError) {
      console.error('Could not finalize captured Razorpay payment:', applyError.message);
      return jsonResponse(request, { error: 'Payment was captured but the order needs review. Contact the store with your order number.' }, 500);
    }
    return jsonResponse(request, { success: true, orderId, status: result.status });
  } catch (error) {
    console.error('verify-payment failed:', error instanceof Error ? error.message : 'Unknown error');
    return jsonResponse(request, { error: 'Could not verify payment. If charged, contact the store with your order number.' }, 500);
  }
});
