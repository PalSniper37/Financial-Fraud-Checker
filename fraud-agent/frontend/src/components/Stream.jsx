import React, { useRef } from 'react';

const STATUS_CONFIG = {
  stage: {
    color: 'var(--color-stage)',
    bg: 'var(--color-stage-bg)',
    dot: 'var(--color-stage)',
    label: 'Stage',
  },
  cleared: {
    color: 'var(--color-text-success)',
    bg: 'var(--color-background-success)',
    dot: 'var(--color-text-success)',
    label: 'Cleared',
  },
  awaiting_context: {
    color: 'var(--color-text-warning)',
    bg: 'var(--color-background-warning)',
    dot: 'var(--color-text-warning)',
    label: 'Awaiting you',
  },
  auto_approved: {
    color: 'var(--color-text-success)',
    bg: 'var(--color-background-success)',
    dot: 'var(--color-text-success)',
    label: 'Approved',
  },
  auto_blocked: {
    color: 'var(--color-text-danger)',
    bg: 'var(--color-background-danger)',
    dot: 'var(--color-text-danger)',
    label: 'Blocked',
  },
  human_review: {
    color: 'var(--color-text-warning)',
    bg: 'var(--color-background-warning)',
    dot: 'var(--color-text-warning)',
    label: 'Review',
  },
  processing: {
    color: 'var(--color-text-tertiary)',
    bg: 'rgba(255,255,255,0.04)',
    dot: 'var(--color-text-tertiary)',
    label: 'Processing',
  },
  error: {
    color: 'var(--color-text-danger)',
    bg: 'var(--color-background-danger)',
    dot: 'var(--color-text-danger)',
    label: 'Error',
  },
};

function fmt(amount) {
  return `£${parseFloat(amount || 0).toFixed(2)}`;
}

export default function Stream({ events, liveActive }) {
  const listRef = useRef(null);

  return (
    <div className="rev-card">
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '14px 18px',
        borderBottom: '1px solid var(--color-border-primary)',
        gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
          }}>
            Activity
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 6,
            fontSize: 12,
            fontWeight: 500,
            color: liveActive ? '#22c55e' : 'var(--color-text-tertiary)',
          }}>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: liveActive ? '#22c55e' : '#cbd5e1',
              display: 'inline-block',
              boxShadow: liveActive ? '0 0 0 2px #dcfce7' : 'none',
              animation: liveActive ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
            }} />
            {liveActive ? 'Portal feed active' : 'Portal feed idle'}
          </div>
        </div>
        <span className="rev-pill-live">
          <span className="rev-pill-live-dot" />
          Live
        </span>
      </div>

      <div
        ref={listRef}
        style={{
          maxHeight: 360,
          overflowY: 'auto',
          padding: '6px 0',
        }}
      >
        {events.length === 0 && (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--color-text-tertiary)',
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            {liveActive
              ? 'Synthetic transactions will appear here as they are scored…'
              : 'Use Stripe webhooks, start the live portal feed, upload a CSV batch, or run screening on samples.'}
          </div>
        )}
        {events.map((event, i) => {
          const stageLabel = event.type === 'stage' && event.stage === 'escalated_agent'
            ? `Escalated · ${event.phase || '…'}`
            : event.type === 'stage' && event.stage === 'confidence_gate'
              ? `Gate · ${event.branch || '…'}`
              : event.type === 'stage'
                ? String(event.stage || 'stage').replace(/_/g, ' ')
                : null;
          const cfg = event.type === 'stage'
            ? STATUS_CONFIG.stage
            : STATUS_CONFIG[event.status] || STATUS_CONFIG.processing;
          return (
            <div
              key={`${event.txnId || event.id}-${i}`}
              className="animate-in"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 18px',
                borderBottom: i < events.length - 1 ? '1px solid var(--color-border-primary)' : 'none',
                background: i === 0 ? 'var(--color-background-elevated)' : 'transparent',
                transition: 'background 0.25s ease',
              }}
            >
              <span style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: cfg.dot,
                flexShrink: 0,
                boxShadow: i === 0 ? `0 0 0 3px ${cfg.bg}` : 'none',
              }} />
              <span style={{
                flex: 1,
                fontWeight: 600,
                fontSize: 14,
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.02em',
              }}>
                {stageLabel || event.merchant || '—'}
              </span>
              <span style={{
                fontVariantNumeric: 'tabular-nums',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                flexShrink: 0,
              }}>
                {event.type === 'stage' && (event.amount == null || event.amount === '')
                  ? '—'
                  : fmt(event.amount)}
              </span>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: cfg.color,
                background: cfg.bg,
                border: '1px solid var(--color-border-primary)',
                borderRadius: 'var(--radius-pill)',
                padding: '4px 10px',
                flexShrink: 0,
                letterSpacing: '0.02em',
              }}>
                {event.type === 'stage' ? (event.risk_score != null ? String(event.risk_score) : cfg.label) : cfg.label}
              </span>
              {event.latency_ms && (
                <span style={{
                  fontSize: 11,
                  color: 'var(--color-text-tertiary)',
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0,
                }}>
                  {event.latency_ms}ms
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
