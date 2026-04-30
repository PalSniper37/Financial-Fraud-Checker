/**
 * 1st Line of Defence agent — after Specter (and related) enrichment on the review track,
 * generates contextual questions for the customer: who the payment was for / to,
 * and whether they recognise the merchant.
 */

import { chatCompletion, MODEL_FAST } from '../tools/llm.js';

function formatEnrichmentBlock(enrichment) {
  if (!enrichment || enrichment.error) {
    return `Specter / entity enrichment: no reliable company record (or lookup failed). Treat counterparty as largely unknown — questions should surface identity and intent.`;
  }
  if (!enrichment.found) {
    return `Specter / entity enrichment: NO company match for merchant name on file. Strong signal to ask who was paid and whether they know this merchant.`;
  }
  const lines = [
    `Company match: ${enrichment.name || 'unknown'}`,
    `Founded: ${enrichment.founded ?? 'unknown'}`,
    `Employees: ${enrichment.employees ?? 'unknown'}`,
    `Status: ${enrichment.status ?? 'unknown'}`,
    enrichment.funding != null ? `Funding (USD): ${Number(enrichment.funding).toLocaleString()}` : null,
    enrichment.web_visits != null ? `Monthly web visits: ${Number(enrichment.web_visits).toLocaleString()}` : null,
    Array.isArray(enrichment.highlights) && enrichment.highlights.length
      ? `Highlights: ${enrichment.highlights.slice(0, 5).join('; ')}`
      : null,
  ].filter(Boolean);
  return lines.join('\n');
}

function fallbackQuestions(txn, enrichment) {
  const amt = `£${parseFloat(txn.amount || 0).toFixed(2)}`;
  const merchant = txn.merchant || 'this merchant';
  const payeeQ = `Who was ${amt} paid to, or what was it for? (e.g. a person’s name, a subscription, or a business you recognise.)`;
  const knowsQ = enrichment?.found
    ? `Our records suggest a link to “${enrichment.name || merchant}”. Do you know this merchant or company, and is this payment something you authorised?`
    : `Do you recognise “${merchant}” on your statement — do you know who they are and did you authorise this payment?`;
  return {
    intro: `We need a quick check on ${amt} to ${merchant} before we can release it.`,
    questions: [
      { id: 'payment_recipient', intent: 'payment_recipient', text: payeeQ },
      { id: 'merchant_recognition', intent: 'merchant_recognition', text: knowsQ },
    ],
    question: `1) ${payeeQ}\n\n2) ${knowsQ}`,
  };
}

/**
 * @param {object} txn
 * @param {object} classification
 * @param {object} enrichment — output of enrichMerchant
 * @param {(ev: object) => void} [push] — optional SSE
 */
export async function runFirstLineDefenceQuestioning(txn, classification, enrichment, push) {
  push?.({
    type: 'stage',
    stage: 'first_line_defence',
    phase: 'started',
    txnId: txn.id,
    id: txn.id,
    merchant: txn.merchant,
    amount: txn.amount,
  });

  const enrichmentBlock = formatEnrichmentBlock(enrichment);

  push?.({
    type: 'stage',
    stage: 'first_line_defence',
    phase: 'enrichment_ingested',
    txnId: txn.id,
    id: txn.id,
    merchant: txn.merchant,
    amount: txn.amount,
    specter_found: Boolean(enrichment?.found),
  });

  let bundle;
  try {
    const msg = await chatCompletion({
      model: MODEL_FAST,
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `You are the **1st Line of Defence** fraud agent for a bank/card programme. The transaction is on the **review track** (first-pass model confidence ${classification.confidence}% — uncertain).

Transaction:
- Merchant (statement): ${txn.merchant}
- Amount: £${parseFloat(txn.amount || 0).toFixed(2)}
- Date: ${txn.date || 'unknown'}
- User / customer id: ${txn.user_id || 'unknown'}
- First-pass category: ${classification.category}
- First-pass reason: ${classification.reason}

Enrichment (Specter / entity search):
${enrichmentBlock}

Your job: produce **two** short, polite, plain-English questions for the **customer** (not an analyst):
1) **Payment recipient / purpose** — who was the payment made to, or what was it for? (Wording should reflect enrichment: if enrichment names a company, you may reference it carefully; if no match, ask neutrally who the beneficiary is.)
2) **Merchant recognition** — does the customer know this merchant / counterparty and recognise this charge?

Rules:
- UK English, one or two sentences per question, no jargon.
- Do not accuse; sound like a routine security check.
- If enrichment found a company, question 2 may ask if they have a relationship with that entity.
- Return ONLY valid JSON with this exact shape:
{
  "intro": "<one short line setting context>",
  "questions": [
    { "id": "payment_recipient", "intent": "payment_recipient", "text": "<question 1>" },
    { "id": "merchant_recognition", "intent": "merchant_recognition", "text": "<question 2>" }
  ]
}`,
        },
      ],
    });

    let parsed;
    try {
      const raw = msg.content.trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      parsed = null;
    }

    const qList = Array.isArray(parsed?.questions) ? parsed.questions : [];
    const q1 = qList.find(q => q.intent === 'payment_recipient' || q.id === 'payment_recipient')?.text;
    const q2 = qList.find(q => q.intent === 'merchant_recognition' || q.id === 'merchant_recognition')?.text;

    if (q1 && q2) {
      const intro = parsed.intro || `Quick security check on your recent payment.`;
      bundle = {
        intro,
        questions: [
          { id: 'payment_recipient', intent: 'payment_recipient', text: String(q1).trim() },
          { id: 'merchant_recognition', intent: 'merchant_recognition', text: String(q2).trim() },
        ],
        question: `1) ${String(q1).trim()}\n\n2) ${String(q2).trim()}`,
      };
    } else {
      bundle = fallbackQuestions(txn, enrichment);
      bundle.intro = parsed?.intro || bundle.intro;
    }
  } catch {
    bundle = fallbackQuestions(txn, enrichment);
  }

  push?.({
    type: 'stage',
    stage: 'first_line_defence',
    phase: 'questions_ready',
    txnId: txn.id,
    id: txn.id,
    merchant: txn.merchant,
    amount: txn.amount,
    question_count: bundle.questions.length,
  });

  return {
    ...bundle,
    agent: 'first_line_defence',
    enrichment_snapshot: {
      found: Boolean(enrichment?.found),
      name: enrichment?.name || null,
      signal: enrichment?.signal || null,
    },
  };
}
