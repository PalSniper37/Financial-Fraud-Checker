import React from 'react';
import RiskScorePill from './RiskScorePill.jsx';

function fmt(amount) {
  const n = parseFloat(amount || 0);
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SampleShowcase({
  backendUrl,
  payments,
  meta,
  loading,
  error,
  onRunScreening,
  screening,
  ledger = {},
}) {
  return (
    <div className="rev-card" style={{ margin: '0 max(20px, 4vw)' }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--color-border-primary)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 14,
      }}>
        <div>
          <div style={{
            fontWeight: 800,
            fontSize: 16,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
            marginBottom: 4,
          }}>
            {meta?.title || 'Sample payments'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontWeight: 500, maxWidth: 560 }}>
            {meta?.description || 'Load the bundled demo file to populate the live stream and review queue.'}
            {payments.length > 0 && (
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {' '}
                ({payments.length} rows)
              </span>
            )}
            <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              Risk score (absolute 1–100, higher is riskier; green → red): preview from merchant/amount until screening updates from the pipeline.
            </span>
          </div>
        </div>
        <button
          type="button"
          className="rev-btn-primary"
          disabled={screening || payments.length === 0}
          onClick={onRunScreening}
          style={{
            opacity: screening || payments.length === 0 ? 0.5 : 1,
            cursor: screening || payments.length === 0 ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
        >
          {screening ? 'Screening…' : 'Run screening on samples'}
        </button>
      </div>

      {loading && (
        <div style={{ padding: '28px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
          Loading sample data…
        </div>
      )}

      {error && !loading && (
        <div style={{
          margin: 16,
          padding: '14px 16px',
          borderRadius: 'var(--border-radius-md)',
          background: 'var(--color-background-danger)',
          border: '1px solid rgba(255, 92, 122, 0.25)',
          color: 'var(--color-text-danger)',
          fontSize: 14,
          fontWeight: 600,
        }}>
          {error}
          <span style={{ display: 'block', marginTop: 6, fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            Start the backend at {backendUrl || 'http://localhost:3001'} (npm run dev from fraud-agent).
          </span>
        </div>
      )}

      {!loading && !error && payments.length > 0 && (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 14,
          }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border-primary)' }}>Date</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-primary)', minWidth: 200 }}>Merchant</th>
                <th style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-primary)', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-primary)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  Risk
                </th>
                <th style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border-primary)' }}>User</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  style={{
                    color: 'var(--color-text-primary)',
                    fontWeight: 600,
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <td style={{ padding: '11px 20px', borderBottom: '1px solid var(--color-border-primary)', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {row.date}
                  </td>
                  <td style={{ padding: '11px 16px', borderBottom: '1px solid var(--color-border-primary)', letterSpacing: '-0.01em' }}>
                    {row.merchant}
                  </td>
                  <td style={{
                    padding: '11px 16px',
                    borderBottom: '1px solid var(--color-border-primary)',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}>
                    {fmt(row.amount)}
                  </td>
                  <td style={{
                    padding: '11px 14px',
                    borderBottom: '1px solid var(--color-border-primary)',
                    textAlign: 'right',
                    verticalAlign: 'middle',
                  }}>
                    <RiskScorePill payment={row} ledgerEntry={(ledger || {})[row.id]} />
                  </td>
                  <td style={{ padding: '11px 20px', borderBottom: '1px solid var(--color-border-primary)', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                    {row.user_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
