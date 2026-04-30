import { classifyTransaction } from './tools/classify.js';
import { generateContextQuestion } from './tools/askContext.js';
import { parseUserContext } from './tools/parseContext.js';
import { enrichMerchant } from './tools/specter.js';
import { finalVerdict } from './tools/verdictWithContext.js';
import { runHighRiskEscalatedAgent } from './agents/highRiskEscalatedAgent.js';

const pendingTransactions = new Map();
const TIMEOUT_MS = 5 * 60 * 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function processBatch(transactions, push) {
  for (let i = 0; i < transactions.length; i++) {
    const txn = transactions[i];
    if (!txn.id) {
      txn.id = `txn_${Date.now()}_${i}`;
    }

    try {
      push({ type: 'processing', txnId: txn.id, merchant: txn.merchant, amount: txn.amount });

      const classification = await classifyTransaction(txn);

      if (classification.confidence >= 85) {
        push({
          type: 'stage',
          stage: 'confidence_gate',
          txnId: txn.id,
          id: txn.id,
          branch: 'auto_cleared',
          merchant: txn.merchant,
          amount: txn.amount,
        });
        push({
          type: 'result',
          status: 'cleared',
          txnId: txn.id,
          id: txn.id,
          merchant: txn.merchant,
          amount: txn.amount,
          date: txn.date,
          user_id: txn.user_id,
          category: classification.category,
          confidence: classification.confidence,
          reason: classification.reason,
          latency_ms: classification.latency_ms,
          tokens_used: classification.tokens_used,
        });
      } else if (classification.confidence < 50) {
        push({
          type: 'stage',
          stage: 'confidence_gate',
          txnId: txn.id,
          id: txn.id,
          branch: 'escalated_track',
          merchant: txn.merchant,
          amount: txn.amount,
          confidence: classification.confidence,
        });

        const outcome = await runHighRiskEscalatedAgent(txn, classification, push);

        push({
          type: 'result',
          status: outcome.status,
          txnId: txn.id,
          id: txn.id,
          merchant: txn.merchant,
          amount: txn.amount,
          date: txn.date,
          user_id: txn.user_id,
          category: classification.category,
          confidence: classification.confidence,
          reason: classification.reason,
          latency_ms: classification.latency_ms,
          tokens_used: classification.tokens_used,
          verdict: outcome.verdict,
          enrichment: outcome.enrichment,
          parsedContext: outcome.parsedContext,
          screening_track: outcome.screening_track,
          risk_score: outcome.risk_score,
        });
      } else {
        push({
          type: 'stage',
          stage: 'confidence_gate',
          txnId: txn.id,
          id: txn.id,
          branch: 'review_track',
          merchant: txn.merchant,
          amount: txn.amount,
          confidence: classification.confidence,
        });
        const { question } = await generateContextQuestion(txn, classification);

        pendingTransactions.set(txn.id, { txn, classification, question });

        const timeoutHandle = setTimeout(async () => {
          if (!pendingTransactions.has(txn.id)) return;
          const pending = pendingTransactions.get(txn.id);
          const [parsedContext, enrichment] = await Promise.all([
            parseUserContext(pending.txn, 'User did not respond'),
            enrichMerchant(pending.txn.merchant),
          ]);
          const tTrack = pending.classification.confidence >= 50 ? 'review' : 'escalated';
          const verdict = await finalVerdict(pending.txn, pending.classification, enrichment, parsedContext, tTrack);
          const status = mapAction(verdict.recommended_action);
          push({
            type: 'result',
            status,
            txnId: txn.id,
            id: txn.id,
            merchant: txn.merchant,
            amount: txn.amount,
            date: txn.date,
            user_id: txn.user_id,
            category: pending.classification.category,
            confidence: pending.classification.confidence,
            verdict,
            enrichment,
            parsedContext,
            timedOut: true,
          });
          pendingTransactions.delete(txn.id);
        }, TIMEOUT_MS);

        pendingTransactions.set(txn.id, { txn, classification, question, timeoutHandle });

        push({
          type: 'result',
          status: 'awaiting_context',
          txnId: txn.id,
          id: txn.id,
          merchant: txn.merchant,
          amount: txn.amount,
          date: txn.date,
          user_id: txn.user_id,
          category: classification.category,
          confidence: classification.confidence,
          reason: classification.reason,
          latency_ms: classification.latency_ms,
          tokens_used: classification.tokens_used,
          question,
          screening_track: 'review_track',
        });
      }
    } catch (err) {
      console.error(`Error processing transaction ${txn.id}:`, err);
      push({
        type: 'error',
        txnId: txn.id,
        merchant: txn.merchant,
        error: err.message,
      });
    }

    if (i < transactions.length - 1) {
      await sleep(600);
    }
  }
}

export async function processContextReply(txnId, userReply, push) {
  const pending = pendingTransactions.get(txnId);
  if (!pending) {
    push({ type: 'error', txnId, error: 'Transaction not found or already resolved' });
    return;
  }

  if (pending.timeoutHandle) {
    clearTimeout(pending.timeoutHandle);
  }

  const { txn, classification } = pending;

  try {
    const [parsedContext, enrichment] = await Promise.all([
      parseUserContext(txn, userReply),
      enrichMerchant(txn.merchant),
    ]);

    const track = classification.confidence >= 50 ? 'review' : 'escalated';
    const verdict = await finalVerdict(txn, classification, enrichment, parsedContext, track);
    const status = mapAction(verdict.recommended_action);

    push({
      type: 'result',
      status,
      txnId,
      id: txn.id,
      merchant: txn.merchant,
      amount: txn.amount,
      date: txn.date,
      user_id: txn.user_id,
      category: classification.category,
      confidence: classification.confidence,
      verdict,
      enrichment,
      parsedContext,
      userReply,
      screening_track: track === 'review' ? 'review_track' : 'escalated_track',
    });

    pendingTransactions.delete(txnId);
  } catch (err) {
    console.error(`Error processing context reply for ${txnId}:`, err);
    push({ type: 'error', txnId, error: err.message });
  }
}

function mapAction(recommended_action) {
  switch (recommended_action) {
    case 'auto_approve': return 'auto_approved';
    case 'auto_block': return 'auto_blocked';
    default: return 'human_review';
  }
}
