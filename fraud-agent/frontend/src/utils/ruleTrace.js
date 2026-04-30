/**
 * Builds a human-readable list of routing / scoring signals from pipeline SSE + verdict payload.
 */

function gateLabel(branch) {
  if (!branch) return null;
  const map = {
    auto_cleared: 'Auto-clear path (high first-pass confidence)',
    escalated_track: 'Escalated track (first-pass confidence below 50%)',
    review_track: 'Review track (first-pass confidence 50–84%)',
  };
  return map[branch] || `Confidence gate · ${String(branch).replace(/_/g, ' ')}`;
}

function phaseLabel(stage, phase, extra) {
  if (stage === 'confidence_gate') return gateLabel(extra.branch);
  if (stage !== 'escalated_agent' || !phase) return null;
  const map = {
    started: 'Escalated agent started',
    counterparty_kind: `Counterparty classified · ${extra.counterparty_kind || 'unknown'}`,
    specter_person_email: 'Specter · person lookup by email',
    specter_person_profile: 'Specter · person profile loaded',
    specter_person_id: 'Specter · person profile by ID',
    specter_company_saved_search: 'Specter · company saved search',
    specter_company_name_search: 'Specter · company name search',
    specter_entity_text: 'Specter · entity text enrichment',
    rescored: `Deterministic rescore${typeof extra.risk_score === 'number' ? ` · ${extra.risk_score}` : ''}`,
  };
  return map[phase] || `Escalated · ${phase.replace(/_/g, ' ')}`;
}

/**
 * @param {object} item — merged transaction row (result + optional stageLog[])
 * @returns {{ rules: { id: string, label: string, severity: 'info'|'warn'|'risk'|'ok' }[], summary: string }}
 */
export function buildRuleTrace(item) {
  if (!item?.id) return { rules: [], summary: '' };

  const rules = [];
  const fp = typeof item.confidence === 'number' ? item.confidence : null;

  if (fp != null) {
    if (fp >= 85) {
      rules.push({
        id: 'fp_high',
        label: `First-pass model confidence ${fp}% — above auto-clear threshold (85%)`,
        severity: 'ok',
      });
    } else if (fp < 50) {
      rules.push({
        id: 'fp_low',
        label: `First-pass model confidence ${fp}% — below escalated-track threshold (50%)`,
        severity: 'risk',
      });
    } else {
      rules.push({
        id: 'fp_mid',
        label: `First-pass model confidence ${fp}% — review band (50–84%)`,
        severity: 'warn',
      });
    }
  }

  if (item.screening_track === 'escalated_track') {
    rules.push({
      id: 'track_esc',
      label: 'Screening track: escalated (deep Specter + deterministic rescore)',
      severity: 'warn',
    });
  } else if (item.screening_track === 'review_track' || item.screening_track === 'review') {
    rules.push({
      id: 'track_rev',
      label: 'Screening track: standard review (context question + second pass)',
      severity: 'info',
    });
  }

  const logs = Array.isArray(item.stageLog) ? item.stageLog : [];
  const seen = new Set();
  for (const ev of logs) {
    if (ev.type !== 'stage') continue;
    const tid = ev.txnId || ev.id;
    if (tid && tid !== item.id) continue;
    const label = phaseLabel(ev.stage, ev.phase, ev);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const sev = ev.stage === 'escalated_agent' && ev.phase === 'rescored' ? 'risk' : 'info';
    rules.push({ id: `st_${rules.length}`, label, severity: sev });
  }

  if (typeof item.risk_score === 'number') {
    rules.push({
      id: 'risk_num',
      label: `Deterministic risk score (escalated track): ${item.risk_score}`,
      severity: item.risk_score >= 72 ? 'risk' : item.risk_score <= 34 ? 'ok' : 'warn',
    });
  }

  const vf = item.verdict?.risk_factors;
  if (Array.isArray(vf) && vf.length) {
    vf.forEach((f, i) => {
      rules.push({
        id: `vf_${i}`,
        label: typeof f === 'string' ? f : JSON.stringify(f),
        severity: 'warn',
      });
    });
  }

  if (item.verdict?.recommended_action) {
    rules.push({
      id: 'verdict_action',
      label: `Final routing: ${String(item.verdict.recommended_action).replace(/_/g, ' ')}`,
      severity: item.verdict.recommended_action === 'auto_block' ? 'risk' : item.verdict.recommended_action === 'auto_approve' ? 'ok' : 'warn',
    });
  }

  if (item.status === 'awaiting_context') {
    rules.push({
      id: 'await_ctx',
      label: 'Awaiting cardholder / analyst context (below auto-clear, review band)',
      severity: 'warn',
    });
  }

  if (item.status === 'cleared') {
    rules.push({
      id: 'term_cleared',
      label: 'Terminal outcome: cleared (first-pass confidence met auto-release threshold)',
      severity: 'ok',
    });
  }
  if (item.status === 'auto_approved') {
    rules.push({
      id: 'term_appr',
      label: 'Terminal outcome: auto-approved by policy / model routing',
      severity: 'ok',
    });
  }
  if (item.status === 'auto_blocked') {
    rules.push({
      id: 'term_block',
      label: 'Terminal outcome: auto-blocked by policy / model routing',
      severity: 'risk',
    });
  }

  const summary = rules.length
    ? `${rules.length} signal${rules.length === 1 ? '' : 's'} in the decision path`
    : 'No detailed trace yet — run screening or select a processed transaction';

  return { rules, summary };
}
