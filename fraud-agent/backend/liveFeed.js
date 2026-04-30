import { processBatch } from './pipeline.js';

/** Merchant templates — amounts jitter per tick for a realistic live stream */
const POOL = [
  { merchant: 'Amazon Web Services', amount: 142.5, user_id: 'user_001' },
  { merchant: 'Slack Technologies', amount: 12.5, user_id: 'user_001' },
  { merchant: 'GitHub Inc', amount: 4.0, user_id: 'user_001' },
  { merchant: 'Zoom Video Communications', amount: 13.99, user_id: 'user_002' },
  { merchant: 'Notion Labs', amount: 8.0, user_id: 'user_002' },
  { merchant: 'Figma Inc', amount: 15.0, user_id: 'user_002' },
  { merchant: 'Stripe Inc', amount: 25.0, user_id: 'user_003' },
  { merchant: 'Deliveroo', amount: 32.4, user_id: 'user_003' },
  { merchant: 'AMZN MKTP GB*2X4R', amount: 247.0, user_id: 'user_004' },
  { merchant: 'FAST CAPITAL LLC', amount: 890.0, user_id: 'user_004' },
  { merchant: 'CONSULTANCY FEE REF', amount: 4500.0, user_id: 'user_005' },
  { merchant: 'INTL WIRE TRF 44291', amount: 520.0, user_id: 'user_005' },
  { merchant: 'XLNT DIGITAL LTD', amount: 1900.0, user_id: 'user_006' },
  { merchant: 'PAY* UNKNOWN 9921X', amount: 3400.0, user_id: 'user_006' },
  { merchant: 'OFFSHORE SVC 2241', amount: 2100.0, user_id: 'user_007' },
  { merchant: 'DIGITAL PMNT 8821', amount: 670.0, user_id: 'user_007' },
  { merchant: 'Uber Eats London', amount: 28.9, user_id: 'user_008' },
  { merchant: 'CURSOR IDE PRO', amount: 20.0, user_id: 'user_008' },
];

let liveActive = false;
let scheduleTimer = null;
let currentIntervalMs = 4500;

/** Uniform random GBP amount in [0.01, 100_000], two decimal places */
function randomAmountUpTo100k() {
  const max = 100_000;
  const pounds = 0.01 + Math.random() * (max - 0.01);
  return pounds.toFixed(2);
}

function randomTxn() {
  const base = POOL[Math.floor(Math.random() * POOL.length)];
  const id = `live_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const date = new Date().toISOString().slice(0, 10);
  return {
    id,
    date,
    merchant: base.merchant,
    amount: randomAmountUpTo100k(),
    user_id: base.user_id,
  };
}

/**
 * @returns {{ intervalMs: number }} resolved interval
 */
export function startLiveFeed(push, options = {}) {
  stopLiveFeed();
  currentIntervalMs = Math.min(120000, Math.max(2500, Number(options.intervalMs) || 4500));
  liveActive = true;

  const run = async () => {
    if (!liveActive) return;
    try {
      await processBatch([randomTxn()], push);
    } catch (e) {
      console.error('liveFeed batch error:', e);
    }
    if (liveActive) {
      scheduleTimer = setTimeout(run, currentIntervalMs);
    }
  };

  scheduleTimer = setTimeout(run, 350);
  return { intervalMs: currentIntervalMs };
}

export function stopLiveFeed() {
  liveActive = false;
  if (scheduleTimer) {
    clearTimeout(scheduleTimer);
    scheduleTimer = null;
  }
}

export function isLiveActive() {
  return liveActive;
}

export function getIntervalMs() {
  return currentIntervalMs;
}
