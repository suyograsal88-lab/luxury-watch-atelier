import { adminClient, constantTimeEqual, handleOptions, hmacHex, jsonResponse } from '../_shared/common.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return handleOptions(request);
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed' }, 405);
  try {
    const rawBody = new Uint8Array(await request.arrayBuffer());
    const signature = request.headers.get('x-razorpay-signature') ?? '';
    const eventId = request.headers.get('x-razorpay-event-id') ?? '';
    const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    if (!secret || !eventId || eventId.length > 200) return jsonResponse(request, { error: 'Webhook is not configured.' }, 500);
    const expected = await hmacHex(secret, rawBody);
    if (!constantTimeEqual(expected, signature)) return jsonResponse(request, { error: 'Invalid signature.' }, 400);
    const payload = JSON.parse(new TextDecoder().decode(rawBody));
    if (payload.event !== 'payment.captured') return jsonResponse(request, { received: true, ignored: true });
    const payment = payload.payload?.payment?.entity;
    if (!payment?.id || !payment?.order_id || !Number.isSafeInteger(payment.amount) || payment.status !== 'captured' || payment.captured !== true) {
      return jsonResponse(request, { error: 'Invalid captured payment payload.' }, 400);
    }
    const { error } = await adminClient().rpc('apply_razorpay_capture', {
      p_event_id: eventId,
      p_event_type: payload.event,
      p_razorpay_order_id: payment.order_id,
      p_payment_id: payment.id,
      p_amount_paise: payment.amount,
      p_currency: payment.currency,
    });
    if (error) {
      console.error('Could not apply Razorpay webhook:', error.message);
      return jsonResponse(request, { error: 'Could not record payment.' }, 500);
    }
    return jsonResponse(request, { received: true });
  } catch (error) {
    console.error('razorpay-webhook failed:', error instanceof Error ? error.message : 'Unknown error');
    return jsonResponse(request, { error: 'Webhook processing failed.' }, 500);
  }
});
