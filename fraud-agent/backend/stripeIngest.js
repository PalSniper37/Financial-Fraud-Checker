import { processBatch } from './pipeline.js';

/** ISO currencies Stripe treats as zero-decimal (amount is whole units) */
const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

const processedIds = new Set();

/**
 * @param {import('stripe').Stripe.PaymentIntent} pi
 */
export function paymentIntentToTxn(pi) {
  const currency = (pi.currency || 'gbp').toLowerCase();
  const divisor = ZERO_DECIMAL.has(currency) ? 1 : 100;
  const amountNum = pi.amount / divisor;

  const merchant =
    (pi.metadata?.merchant && String(pi.metadata.merchant)) ||
    (pi.description && String(pi.description)) ||
    'Stripe payment';

  const date = new Date(pi.created * 1000).toISOString().slice(0, 10);
  const user_id = (pi.metadata?.user_id && String(pi.metadata.user_id)) ||
    (typeof pi.customer === 'string' ? pi.customer : null) ||
    'stripe_customer';

  return {
    id: pi.id,
    date,
    merchant: merchant.slice(0, 200),
    amount: amountNum.toFixed(2),
    user_id,
    currency,
    source: 'stripe',
  };
}

/**
 * Idempotent: same PaymentIntent is only scored once (webhook + test UI may both fire).
 */
export async function ingestPaymentIntent(pi, push) {
  if (processedIds.has(pi.id)) return;
  processedIds.add(pi.id);
  if (processedIds.size > 12000) processedIds.clear();

  await processBatch([paymentIntentToTxn(pi)], push);
}

export async function handleStripeWebhook(req, res, { push }) {
  let Stripe;
  try {
    ({ default: Stripe } = await import('stripe'));
  } catch {
    return res.status(503).json({
      error: 'Stripe SDK not installed. Run `npm install` in the fraud-agent folder.',
    });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  const stripe = key ? new Stripe(key) : null;

  if (!stripe || !webhookSecret) {
    return res.status(503).json({
      error: 'Stripe webhook requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (from Stripe CLI or Dashboard)',
    });
  }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      await ingestPaymentIntent(event.data.object, push);
    }
  } catch (err) {
    console.error('stripe webhook processing:', err);
    return res.status(500).json({ error: 'Pipeline error' });
  }

  return res.json({ received: true });
}
