import React, { useState, useEffect, useCallback } from 'react';
import { buildRuleTrace } from '../utils/ruleTrace.js';

const ACTION_CONFIG = {
  auto_approve: { label: 'Approved', color: 'var(--color-text-success)', bg: 'var(--color-background-success)' },
  auto_block: { label: 'Blocked', color: 'var(--color-text-danger)', bg: 'var(--color-background-danger)' },
  human_review: { label: 'Review', color: 'var(--color-text-warning)', bg: 'var(--color-background-warning)' },
  auto_approved: { label: 'Approved', color: 'var(--color-text-success)', bg: 'var(--color-background-success)' },
  auto_blocked: { label: 'Blocked', color: 'var(--color-text-danger)', bg: 'var(--color-background-danger)' },
  cleared: { label: 'Cleared', color: 'var(--color-text-success)', bg: 'var(--color-background-success)' },
};

const RISK_COLORS = {
  low: 'var(--color-text-success)',
  medium: 'var(--color-text-warning)',
  high: 'var(--color-text-danger)',
};

const RULE_SEV = {
  ok: { border: 'rgba(50,210,150,0.35)', bg: 'rgba(50,210,150,0.08)' },
  info: { border: 'rgba(126,184,255,0.35)', bg: 'rgba(126,184,255,0.08)' },
  warn: { border: 'rgba(255,176,32,0.35)', bg: 'rgba(255,176,32,0.08)' },
  risk: { border: 'rgba(255,92,122,0.35)', bg: 'rgba(255,92,122,0.08)' },
};

function fmt(amount) {
  return `£${parseFloat(amount || 0).toFixed(2)}`;
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--color-text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginBottom: 10,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function ScoreTile({ label, value, sub }) {
  return (
    <div className="ux-detail-score-tile">
      <div className="ux-detail-score-tile__label">{label}</div>
      <div className="ux-detail-score-tile__value ux-display">{value}</div>
      {sub && <div className="ux-detail-score-tile__sub">{sub}</div>}
    </div>
  );
}

export default function Detail({ item, backendUrl = 'http://localhost:3001', onAgentAction }) {
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [acting, setActing] = useState(false);

  const runAgentAction = useCallback(async (action) => {
    if (!item?.id || !onAgentAction || acting) return;
    setActing(true);
    try {
      await onAgentAction(item, action);
    } catch (err) {
      console.error(err);
    } finally {
      setActing(false);
    }
  }, [item, onAgentAction, acting]);

  async function handleSubmit() {
    if (!reply.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetch(`${backendUrl}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txnId: item.id, reply: reply.trim() }),
      });
      setSubmitted(true);
      setReply('');
    } catch (err) {
      console.error('Failed to submit context:', err);
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  useEffect(() => {
    setSubmitted(false);
    setReply('');
    setSubmitting(false);
    setActing(false);
  }, [item?.id]);

  if (!item) {
    return (
      <div className="rev-card ux-detail-empty">
        <div className="ux-detail-empty__orb">◎</div>
        <div className="ux-detail-empty__title ux-display">Select a transaction</div>
        <div className="ux-detail-empty__sub">
          Pick any row from an agent queue to inspect scores, routing rules, and run actions.
        </div>
      </div>
    );
  }

  const verdict = item.verdict;
  const enrichment = item.enrichment;
  const parsedContext = item.parsedContext;
  const actionKey = verdict?.recommended_action || item.status;
  const actionCfg = ACTION_CONFIG[actionKey] || ACTION_CONFIG.human_review;
  const { rules: ruleList, summary: ruleSummary } = buildRuleTrace(item);

  const fpConf = typeof item.confidence === 'number' ? `${item.confidence}%` : '—';
  const secondConf = verdict && typeof verdict.confidence === 'number' ? `${verdict.confidence}%` : '—';
  const riskNum = typeof item.risk_score === 'number'
    ? item.risk_score
    : (verdict && typeof verdict.risk_score === 'number' ? verdict.risk_score : null);
  const riskScoreStr = riskNum != null ? String(riskNum) : '—';

  const inputStyle = {
    flex: 1,
    padding: '14px 16px',
    borderRadius: 'var(--border-radius-md)',
    border: '1px solid var(--color-border-secondary)',
    fontSize: 15,
    outline: 'none',
    background: 'rgba(0,0,0,0.35)',
    color: 'var(--color-text-primary)',
    fontWeight: 500,
  };

  const stages = (item.stageLog || []).filter(s => s.type === 'stage');

  return (
    <div className="rev-card ux-detail-card">
      <div className="ux-detail-hero">
        <div style={{
          padding: '20px 22px',
          borderBottom: '1px solid var(--color-border-primary)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontWeight: 800,
              fontSize: 20,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
            }}>
              {item.merchant}
            </div>
            <div style={{
              fontSize: 13,
              color: 'var(--color-text-tertiary)',
              marginTop: 6,
              fontWeight: 500,
            }}>
              {item.id} · {item.date} · {item.user_id}
              {item.category && <> · {item.category}</>}
            </div>
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--color-border-primary)',
                background: 'rgba(255,255,255,0.06)',
                color: 'var(--color-text-secondary)',
              }}>
                {item.status?.replace(/_/g, ' ')}
              </span>
              {item.screening_track && (
                <span style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid rgba(0,200,255,0.25)',
                  color: 'var(--color-info-text)',
                  background: 'var(--color-info-bg)',
                }}>
                  {String(item.screening_track).replace(/_/g, ' ')}
                </span>
              )}
            </div>
          </div>
          <div style={{
            fontVariantNumeric: 'tabular-nums',
            fontSize: 24,
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.03em',
            flexShrink: 0,
          }}>
            {fmt(item.amount)}
          </div>
        </div>
      </div>

      <div style={{ padding: '22px' }}>
        <Section title="Scores & models">
          <div className="ux-detail-scores">
            <ScoreTile label="First-pass confidence" value={fpConf} sub="Classifier gate" />
            <ScoreTile label="Second-pass confidence" value={secondConf} sub="Reasoning / rescore" />
            <ScoreTile label="Risk score" value={riskScoreStr} sub="Absolute score (escalated track when present)" />
          </div>
        </Section>

        <Section title={`Rules & signals · ${ruleSummary}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ruleList.length === 0 && (
              <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
                Run screening to populate pipeline stages for this payment.
              </div>
            )}
            {ruleList.map(r => {
              const sev = RULE_SEV[r.severity] || RULE_SEV.info;
              return (
                <div
                  key={r.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--border-radius-md)',
                    border: `1px solid ${sev.border}`,
                    background: sev.bg,
                    fontSize: 14,
                    color: 'var(--color-text-secondary)',
                    fontWeight: 500,
                    lineHeight: 1.45,
                  }}
                >
                  {r.label}
                </div>
              );
            })}
          </div>
        </Section>

        {stages.length > 0 && (
          <Section title="Pipeline timeline">
            <div className="ux-detail-timeline">
              {stages.map((s, idx) => (
                <div key={`${s.stage}-${s.phase}-${idx}`} className="ux-detail-timeline__row">
                  <span className="ux-detail-timeline__dot" />
                  <div>
                    <div className="ux-detail-timeline__title">
                      {s.stage === 'escalated_agent' ? 'Escalated agent' : s.stage === 'confidence_gate' ? 'Confidence gate' : String(s.stage || '').replace(/_/g, ' ')}
                      {s.phase && <span className="ux-detail-timeline__phase"> · {String(s.phase).replace(/_/g, ' ')}</span>}
                    </div>
                    {(s.confidence != null || s.risk_score != null) && (
                      <div className="ux-detail-timeline__meta">
                        {s.confidence != null && <span>{s.confidence}%</span>}
                        {s.risk_score != null && <span>Risk {s.risk_score}</span>}
                        {s.routed_action && <span>{String(s.routed_action).replace(/_/g, ' ')}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {verdict?.escalated_agent && (
          <Section title="Escalated rescore">
            <div style={{
              padding: '16px 18px',
              background: 'rgba(255, 176, 32, 0.08)',
              border: '1px solid rgba(255, 176, 32, 0.22)',
              borderRadius: 'var(--border-radius-md)',
              fontSize: 14,
              color: 'var(--color-text-secondary)',
              lineHeight: 1.55,
            }}>
              <div style={{ fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8, fontSize: 15 }}>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{verdict.risk_score}</span>
                <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 600 }}> · </span>
                <span style={{ textTransform: 'capitalize' }}>{verdict.counterparty_kind}</span>
              </div>
              {Array.isArray(verdict.risk_factors) && verdict.risk_factors.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--color-text-secondary)' }}>
                  {verdict.risk_factors.map((f, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        )}

        {item.status === 'awaiting_context' && !submitted && (
          <Section title="We need a bit more detail">
            <div style={{
              padding: '16px 18px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--color-border-primary)',
              borderRadius: 'var(--border-radius-md)',
              fontSize: 15,
              color: 'var(--color-text-primary)',
              lineHeight: 1.55,
              marginBottom: 14,
              fontWeight: 500,
            }}>
              {item.question}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                type="text"
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What was this payment for?"
                disabled={submitting}
                style={{ ...inputStyle, minWidth: 200 }}
              />
              <button
                type="button"
                className="rev-btn-primary"
                onClick={handleSubmit}
                disabled={submitting || !reply.trim()}
                style={{
                  opacity: submitting || !reply.trim() ? 0.45 : 1,
                  cursor: submitting || !reply.trim() ? 'not-allowed' : 'pointer',
                  minWidth: 120,
                }}
              >
                {submitting ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </Section>
        )}

        {item.status === 'awaiting_context' && submitted && (
          <div style={{
            padding: '16px 18px',
            background: 'var(--color-info-bg)',
            border: '1px solid rgba(6, 102, 235, 0.25)',
            borderRadius: 'var(--border-radius-md)',
            color: 'var(--color-info-text)',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 18,
          }}>
            Got it — we are finishing the review…
          </div>
        )}

        {!verdict && (item.status === 'cleared' || item.status === 'auto_approved' || item.status === 'auto_blocked') && (
          <Section title="Outcome">
            <div style={{
              fontSize: 14,
              color: 'var(--color-text-secondary)',
              lineHeight: 1.55,
              fontWeight: 500,
            }}>
              <span style={{
                fontSize: 13,
                fontWeight: 700,
                padding: '6px 14px',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--color-border-primary)',
                background: ACTION_CONFIG[item.status]?.bg || 'rgba(255,255,255,0.06)',
                color: ACTION_CONFIG[item.status]?.color || 'var(--color-text-primary)',
                marginRight: 10,
              }}>
                {ACTION_CONFIG[item.status]?.label || item.status}
              </span>
              {item.reason || 'Pipeline completed without second-pass verdict payload.'}
            </div>
          </Section>
        )}

        {verdict && (
          <>
            <Section title="Outcome">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: actionCfg.color,
                  background: actionCfg.bg,
                  border: '1px solid var(--color-border-primary)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '6px 14px',
                }}>
                  {actionCfg.label}
                </span>
                <span style={{
                  fontSize: 13,
                  color: RISK_COLORS[verdict.risk] || 'var(--color-text-secondary)',
                  fontWeight: 700,
                }}>
                  {verdict.risk} risk · {verdict.confidence}%
                </span>
              </div>
              <p style={{
                fontSize: 15,
                color: 'var(--color-text-secondary)',
                lineHeight: 1.55,
                marginBottom: 10,
                fontWeight: 500,
              }}>
                {verdict.rationale}
              </p>
              {verdict.key_signal && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--color-text-secondary)',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--color-border-primary)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '6px 14px',
                  fontWeight: 600,
                }}>
                  <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Signal</span>
                  {verdict.key_signal}
                </div>
              )}
            </Section>

            <Section title="Counterparty data">
              {enrichment?.found ? (
                <div style={{
                  border: '1px solid var(--color-border-primary)',
                  borderRadius: 'var(--border-radius-md)',
                  overflow: 'hidden',
                  background: 'rgba(0,0,0,0.2)',
                }}>
                  {[
                    ['Company', enrichment.name],
                    ['Founded', enrichment.founded || '—'],
                    ['Employees', enrichment.employees || '—'],
                    ['Status', enrichment.status || '—'],
                    ['Total funding', enrichment.funding ? `$${Number(enrichment.funding).toLocaleString()}` : '—'],
                    ['Web visits / mo', enrichment.web_visits ? Number(enrichment.web_visits).toLocaleString() : '—'],
                  ].map(([label, value], i, arr) => (
                    <div key={label} style={{
                      display: 'flex',
                      padding: '11px 16px',
                      borderBottom: i < arr.length - 1 ? '1px solid var(--color-border-primary)' : 'none',
                      gap: 14,
                    }}>
                      <span style={{ width: 124, fontSize: 12, fontWeight: 700, color: 'var(--color-text-tertiary)', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                      <span style={{ fontSize: 14, color: 'var(--color-text-primary)', fontWeight: 600 }}>{value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '14px 16px',
                  background: 'var(--color-background-danger)',
                  border: '1px solid rgba(255, 92, 122, 0.25)',
                  borderRadius: 'var(--border-radius-md)',
                  fontSize: 14,
                  color: 'var(--color-text-danger)',
                  fontWeight: 700,
                }}>
                  No match in our data — higher risk for unknown merchants
                </div>
              )}
            </Section>

            {parsedContext && (
              <Section title="Your context">
                <div style={{
                  padding: '14px 16px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--color-border-primary)',
                  borderRadius: 'var(--border-radius-md)',
                  fontSize: 14,
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.55,
                  fontWeight: 500,
                }}>
                  <p style={{ marginBottom: parsedContext.category_from_context ? 8 : 0 }}>
                    {parsedContext.summary}
                  </p>
                  {parsedContext.category_from_context && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 700,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--color-border-primary)',
                        borderRadius: 'var(--radius-pill)',
                        padding: '4px 11px',
                        color: 'var(--color-text-secondary)',
                      }}>
                        {parsedContext.category_from_context}
                      </span>
                      {verdict.specter_matches_context !== null && (
                        <span style={{
                          fontSize: 12,
                          fontWeight: 700,
                          borderRadius: 'var(--radius-pill)',
                          padding: '4px 11px',
                          background: verdict.specter_matches_context ? 'var(--color-background-success)' : 'var(--color-background-danger)',
                          color: verdict.specter_matches_context ? 'var(--color-text-success)' : 'var(--color-text-danger)',
                          border: '1px solid var(--color-border-primary)',
                        }}>
                          {verdict.specter_matches_context ? 'Aligned with data' : 'Conflict with data'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Section>
            )}
          </>
        )}

        {(item.status === 'human_review' || item.status === 'awaiting_context') && (
          <Section title="Agent actions">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="rev-btn-primary"
                disabled={acting}
                onClick={() => runAgentAction('approve')}
                style={{ opacity: acting ? 0.6 : 1 }}
              >
                {acting ? 'Applying…' : 'Approve'}
              </button>
              <button
                type="button"
                className="rev-btn-ghost"
                disabled={acting}
                onClick={() => runAgentAction('block')}
                style={{ borderColor: 'rgba(255,92,122,0.45)', color: 'var(--color-text-danger)' }}
              >
                Block
              </button>
              <button
                type="button"
                className="rev-btn-ghost"
                disabled={acting}
                onClick={() => runAgentAction('escalate')}
              >
                Escalate
              </button>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
