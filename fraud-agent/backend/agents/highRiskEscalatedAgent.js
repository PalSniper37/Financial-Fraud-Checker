/**
 * High-risk payment screener — runs only on the escalated track (first-pass confidence < 50).
 * Uses Specter person (by email / id) or company saved search (+ name search fallback),
 * rescores deterministically, and sends human-in-loop only when the rescore sits in the gray band.
 */

import { enrichMerchant } from '../tools/specter.js';
import {
  specterGetPersonByEmail,
  specterGetPersonById,
  specterGetCompanySavedSearchResults,
  specterSearchCompaniesByName,
} from '../tools/specterFullApi.js';
import { inferCounterpartyKind, pickCounterpartyEmail } from '../tools/counterpartyKind.js';

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function tokenOverlap(a, b) {
  const ta = new Set(
    String(a || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(x => x.length > 2)
  );
  const tb = String(b || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(x => x.length > 2);
  if (!ta.size || !tb.length) return 0;
  let hit = 0;
  for (const t of tb) {
    if (ta.has(t)) hit++;
  }
  return hit / tb.length;
}

function bestCompanyMatch(merchant, companies) {
  let best = { company: null, score: 0 };
  for (const c of companies) {
    const name = c?.name || c?.company_name || c?.legal_name || '';
    const s = Math.max(tokenOverlap(merchant, name), tokenOverlap(name, merchant));
    if (s > best.score) best = { company: c, score: s };
  }
  return best;
}

function envNum(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Deterministic fraud risk score 0–100 (higher = riskier).
 */
export function rescaleEscalatedRisk({ classification, counterpartyKind, personBundle, companyBundle }) {
  let score = envNum('ESCALATED_BASE_RISK', 68);
  score += clamp(45 - (classification.confidence || 0), 0, 40);

  const factors = [];

  if (counterpartyKind === 'person') {
    const emailHit = personBundle?.byEmail;
    if (emailHit?.ok && emailHit.data?.person_id) {
      const matchScore = Number(emailHit.data.score) || 0;
      if (matchScore >= 7) {
        score -= 38;
        factors.push(`Strong Specter email match (score ${matchScore}/10)`);
      } else if (matchScore >= 4) {
        score -= 12;
        factors.push(`Weak–moderate email match (score ${matchScore}/10)`);
      } else {
        score += 8;
        factors.push('Low-confidence email resolution');
      }
    } else if (personBundle?.byId?.ok) {
      score -= 28;
      factors.push('Specter person profile resolved by ID');
    } else {
      score += 14;
      factors.push('No Specter person match for counterparty');
    }

    if (personBundle?.profile?.ok && personBundle.profile.data) {
      score -= 10;
      factors.push('Full person profile retrieved');
    }
  } else {
    const saved = companyBundle?.savedSearch;
    if (saved?.ok && saved.companies?.length) {
      const merchantLabel = classification.merchantHint || classification.merchant || '';
      const { company, score: overlap } = bestCompanyMatch(merchantLabel, saved.companies);
      if (overlap >= 0.45) {
        score -= 36;
        factors.push(`Merchant aligned with saved-search company (${(overlap * 100).toFixed(0)}% token overlap)`);
      } else if (overlap >= 0.2) {
        score -= 14;
        factors.push('Partial overlap with saved-search cohort');
      } else {
        score += 12;
        factors.push('Merchant not found in relevant saved-search results');
      }
      if (company) {
        companyBundle.bestMatch = company;
      }
    } else if (companyBundle?.nameSearch?.ok && companyBundle.nameSearch.companies?.length) {
      const merchantLabel = classification.merchantHint || classification.merchant || '';
      const { score: overlap } = bestCompanyMatch(merchantLabel, companyBundle.nameSearch.companies);
      if (overlap >= 0.35) {
        score -= 28;
        factors.push('Company name search returned a plausible match');
      } else {
        score += 6;
        factors.push('Company name search inconclusive');
      }
    }

    const text = companyBundle?.textEnrichment;
    if (text?.found) {
      score -= 18;
      factors.push('Entity text-search found a company footprint');
    } else if (text && !text.error) {
      score += 16;
      factors.push('No entity record — elevated unknown-merchant risk');
    }
  }

  score = clamp(Math.round(score), 0, 100);
  return { risk_score: score, factors };
}

function routeByRiskScore(risk_score) {
  const approveMax = envNum('ESCALATED_APPROVE_MAX_RISK', 34);
  const blockMin = envNum('ESCALATED_BLOCK_MIN_RISK', 72);

  if (risk_score <= approveMax) {
    return {
      recommended_action: 'auto_approve',
      risk: 'low',
      confidence: clamp(100 - risk_score, 60, 95),
    };
  }
  if (risk_score >= blockMin) {
    return {
      recommended_action: 'auto_block',
      risk: 'high',
      confidence: clamp(risk_score, 60, 95),
    };
  }
  return {
    recommended_action: 'human_review',
    risk: 'medium',
    confidence: clamp(Math.abs(50 - risk_score) + 50, 45, 65),
  };
}

/**
 * @param {object} txn
 * @param {object} classification — includes merchantHint optional
 * @param {(data: object) => void} push — SSE notifier
 * @returns {Promise<{ verdict: object, enrichment: object, parsedContext: object, screening_track: string, status: string }>}
 */
export async function runHighRiskEscalatedAgent(txn, classification, push) {
  const merchantHint = txn.merchant || '';
  const classificationWithHint = { ...classification, merchantHint, merchant: merchantHint };

  push({
    type: 'stage',
    stage: 'escalated_agent',
    phase: 'started',
    txnId: txn.id,
    id: txn.id,
    merchant: txn.merchant,
    amount: txn.amount,
    first_pass_confidence: classification.confidence,
  });

  const counterpartyKind = inferCounterpartyKind(txn);

  push({
    type: 'stage',
    stage: 'escalated_agent',
    phase: 'counterparty_kind',
    txnId: txn.id,
    id: txn.id,
    merchant: txn.merchant,
    amount: txn.amount,
    counterparty_kind: counterpartyKind,
  });

  const personBundle = {};
  const companyBundle = {};

  if (counterpartyKind === 'person') {
    const email = pickCounterpartyEmail(txn);
    const personId = txn.specter_person_id || null;

    if (email) {
      push({
        type: 'stage',
        stage: 'escalated_agent',
        phase: 'specter_person_email',
        txnId: txn.id,
        id: txn.id,
        merchant: txn.merchant,
        amount: txn.amount,
      });
      personBundle.byEmail = await specterGetPersonByEmail(email);
      const pid = personBundle.byEmail?.data?.person_id;
      if (pid) {
        push({
          type: 'stage',
          stage: 'escalated_agent',
          phase: 'specter_person_profile',
          txnId: txn.id,
          id: txn.id,
          merchant: txn.merchant,
          amount: txn.amount,
          person_id: pid,
        });
        personBundle.profile = await specterGetPersonById(pid);
      }
    } else if (personId) {
      push({
        type: 'stage',
        stage: 'escalated_agent',
        phase: 'specter_person_id',
        txnId: txn.id,
        id: txn.id,
        merchant: txn.merchant,
        amount: txn.amount,
        person_id: personId,
      });
      personBundle.byId = { ok: true };
      personBundle.profile = await specterGetPersonById(personId);
    }
  } else {
    const searchId = process.env.SPECTER_COMPANY_SEARCH_ID;
    if (searchId) {
      push({
        type: 'stage',
        stage: 'escalated_agent',
        phase: 'specter_company_saved_search',
        txnId: txn.id,
        id: txn.id,
        merchant: txn.merchant,
        amount: txn.amount,
        search_id: searchId,
      });
      companyBundle.savedSearch = await specterGetCompanySavedSearchResults(searchId, {
        limit: envNum('SPECTER_COMPANY_SEARCH_LIMIT', 40),
        page: 0,
      });
    }

    push({
      type: 'stage',
      stage: 'escalated_agent',
      phase: 'specter_company_name_search',
      txnId: txn.id,
      id: txn.id,
      merchant: txn.merchant,
      amount: txn.amount,
    });
    companyBundle.nameSearch = await specterSearchCompaniesByName(merchantHint);

    push({
      type: 'stage',
      stage: 'escalated_agent',
      phase: 'specter_entity_text',
      txnId: txn.id,
      id: txn.id,
      merchant: txn.merchant,
      amount: txn.amount,
    });
    companyBundle.textEnrichment = await enrichMerchant(merchantHint);
  }

  const { risk_score, factors } = rescaleEscalatedRisk({
    classification: classificationWithHint,
    counterpartyKind,
    personBundle,
    companyBundle,
  });

  const route = routeByRiskScore(risk_score);

  push({
    type: 'stage',
    stage: 'escalated_agent',
    phase: 'rescored',
    txnId: txn.id,
    id: txn.id,
    merchant: txn.merchant,
    amount: txn.amount,
    risk_score,
    factors,
    routed_action: route.recommended_action,
  });

  const rationale = `${factors.slice(0, 2).join(' ')}. Escalated-track rescore ${risk_score}/100 → ${route.recommended_action.replace('_', ' ')}.`;

  const verdict = {
    risk: route.risk,
    confidence: route.confidence,
    rationale,
    context_helped: false,
    specter_matches_context: null,
    key_signal: `Escalated agent risk_score=${risk_score}`,
    recommended_action: route.recommended_action,
    escalated_agent: true,
    risk_score,
    risk_factors: factors,
    counterparty_kind: counterpartyKind,
  };

  const enrichment = {
    found: counterpartyKind === 'business' ? Boolean(companyBundle.textEnrichment?.found) : Boolean(personBundle.profile?.ok),
    escalated_deep: true,
    counterparty_kind: counterpartyKind,
    person: personBundle,
    company: companyBundle,
    legacy_text_enrichment: companyBundle.textEnrichment || null,
  };

  const parsedContext = {
    explained: false,
    category_from_context: null,
    merchant_type: counterpartyKind,
    seems_legitimate: null,
    confidence_boost: 0,
    summary:
      'Escalated high-risk screener: Specter deep enrichment and deterministic rescore (human review only in the mid-risk band).',
  };

  const statusMap = {
    auto_approve: 'auto_approved',
    auto_block: 'auto_blocked',
    human_review: 'human_review',
  };

  return {
    verdict,
    enrichment,
    parsedContext,
    screening_track: 'escalated_track',
    status: statusMap[verdict.recommended_action] || 'human_review',
    risk_score,
  };
}
