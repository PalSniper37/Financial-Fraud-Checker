/**
 * Derive a 1–100 risk score for UI (higher = riskier).
 * Uses pipeline fields when present; otherwise light heuristics for preview rows.
 */

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function lastRescoredRiskFromStages(stageLog) {
  if (!Array.isArray(stageLog)) return null;
  for (let i = stageLog.length - 1; i >= 0; i--) {
    const s = stageLog[i];
    if (s?.stage === 'escalated_agent' && s?.phase === 'rescored' && typeof s.risk_score === 'number') {
      return s.risk_score;
    }
  }
  return null;
}

function previewHeuristic(row) {
  let s = 16;
  const amt = parseFloat(row?.amount) || 0;
  if (amt > 4000) s += 28;
  else if (amt > 2000) s += 18;
  else if (amt > 800) s += 10;
  else if (amt > 200) s += 4;
  const m = String(row?.merchant || '').toUpperCase();
  const bad = ['WIRE', 'UNKNOWN', 'OFFSHORE', 'CONSULTANCY FEE', 'FAST CAPITAL', 'INTL', 'DIGITAL PMNT', 'XLNT', 'PAY*'];
  for (const b of bad) {
    if (m.includes(b)) s += 12;
  }
  const good = ['AWS', 'AMAZON', 'GITHUB', 'SLACK', 'ZOOM', 'FIGMA', 'STRIPE', 'NOTION', 'DELIVEROO'];
  for (const g of good) {
    if (m.includes(g)) s -= 14;
  }
  return clamp(Math.round(s), 1, 100);
}

/**
 * @param {object | null} paymentRow — CSV / sample row (optional when ledgerEntry is full)
 * @param {object | null | undefined} ledgerEntry — merged ledger row for this id
 * @returns {{ score: number, source: 'pipeline' | 'inferred' | 'preview' }}
 */
export function deriveRiskScore01to100(paymentRow, ledgerEntry) {
  const le = ledgerEntry;

  if (le && typeof le === 'object') {
    if (typeof le.risk_score === 'number' && !Number.isNaN(le.risk_score)) {
      return { score: clamp(Math.round(le.risk_score), 1, 100), source: 'pipeline' };
    }
    const lr = lastRescoredRiskFromStages(le.stageLog);
    if (typeof lr === 'number' && !Number.isNaN(lr)) {
      return { score: clamp(Math.round(lr), 1, 100), source: 'pipeline' };
    }
    if (typeof le.verdict?.risk_score === 'number' && !Number.isNaN(le.verdict.risk_score)) {
      return { score: clamp(Math.round(le.verdict.risk_score), 1, 100), source: 'pipeline' };
    }
    const vr = le.verdict?.risk;
    if (vr === 'high') return { score: 82, source: 'inferred' };
    if (vr === 'medium') return { score: 52, source: 'inferred' };
    if (vr === 'low') return { score: 22, source: 'inferred' };
    if (le.status === 'cleared' && typeof le.confidence === 'number') {
      const residual = clamp(Math.round(6 + (100 - le.confidence) * 2.4), 1, 36);
      return { score: residual, source: 'inferred' };
    }
    if (le.status === 'auto_blocked') return { score: 90, source: 'inferred' };
    if (le.status === 'auto_approved') return { score: 14, source: 'inferred' };
    if (typeof le.confidence === 'number' && (le.status === 'awaiting_context' || le.status === 'human_review')) {
      return { score: clamp(Math.round(100 - le.confidence), 1, 96), source: 'inferred' };
    }
  }

  const row = paymentRow || {};
  return { score: previewHeuristic(row), source: 'preview' };
}

/** Map 1–100 to hue: green → yellow → orange → red */
function scoreToHue(s) {
  if (s <= 28) return 142 - (s / 28) * 28;
  if (s <= 52) return 114 - ((s - 28) / 24) * 52;
  if (s <= 72) return 62 - ((s - 52) / 20) * 18;
  return 44 - ((s - 72) / 28) * 44;
}

/** HSL: green (low score) → yellow → orange → red (high score) */
export function riskScorePillStyle(score) {
  const s = clamp(Number(score) || 1, 1, 100);
  const t = (s - 1) / 99;
  const hue = scoreToHue(s);
  const sat = 68 + 22 * t;
  const light = 58 - 12 * t;
  const borderA = 0.32 + 0.28 * t;
  return {
    color: `hsl(${hue}, ${sat}%, ${light + 8}%)`,
    background: `hsla(${hue}, 58%, 34%, ${0.12 + 0.2 * t})`,
    border: `1px solid hsla(${hue}, 70%, 48%, ${borderA})`,
    boxShadow: `0 0 14px hsla(${hue}, 85%, 42%, ${0.1 + 0.22 * t})`,
  };
}

export function riskScoreTooltip(source) {
  if (source === 'pipeline') return 'Risk score from the screening pipeline (deterministic or escalated track).';
  if (source === 'inferred') return 'Derived from verdict, gate, or first-pass confidence when no numeric score was emitted.';
  return 'Preview heuristic from amount and merchant text until this row is screened.';
}
