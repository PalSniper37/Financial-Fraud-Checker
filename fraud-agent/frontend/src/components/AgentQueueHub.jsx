import React, { useMemo, useState, useCallback } from 'react';
import RiskScorePill from './RiskScorePill.jsx';

const RISK_CONFIG = {
  low: { color: 'var(--color-text-success)', bg: 'var(--color-background-success)' },
  medium: { color: 'var(--color-text-warning)', bg: 'var(--color-background-warning)' },
  high: { color: 'var(--color-text-danger)', bg: 'var(--color-background-danger)' },
};

const STATUS_SHORT = {
  awaiting_context: 'Needs reply',
  human_review: 'Review',
  cleared: 'Cleared',
  auto_approved: 'Approved',
  auto_blocked: 'Blocked',
};

function fmt(amount) {
  return `£${parseFloat(amount || 0).toFixed(2)}`;
}

function isHighRiskRow(item) {
  if (item.status !== 'human_review') return false;
  if (item.verdict?.risk === 'high') return true;
  if (typeof item.risk_score === 'number' && item.risk_score >= 65) return true;
  const fp = item.confidence;
  if (typeof fp === 'number' && fp < 48) return true;
  return false;
}

/** @typedef {{ id: string, label: string, hint: string, filter: (row: object) => boolean, bulkSafe?: boolean }} QueueDef */

/** @param {Record<string, object>} ledger */
function ledgerRows(ledger) {
  return Object.values(ledger || {}).filter(Boolean);
}

const QUEUE_DEFS = /** @type {QueueDef[]} */ ([
  {
    id: 'high_risk',
    label: 'High risk payments',
    hint: 'Human review with elevated score, high model risk, or low first-pass confidence',
    filter: item => item.status === 'human_review' && isHighRiskRow(item),
    bulkSafe: false,
  },
  {
    id: 'needs_context',
    label: 'Needs context',
    hint: 'Awaiting analyst or cardholder reply',
    filter: item => item.status === 'awaiting_context',
    bulkSafe: false,
  },
  {
    id: 'analyst_queue',
    label: 'Analyst review',
    hint: 'In human review — not in the high-risk slice',
    filter: item => item.status === 'human_review' && !isHighRiskRow(item),
    bulkSafe: true,
  },
  {
    id: 'all_active',
    label: 'All active',
    hint: 'Every open item in your queues',
    filter: item => item.status === 'awaiting_context' || item.status === 'human_review',
    bulkSafe: true,
  },
  {
    id: 'cleared',
    label: 'Recently cleared',
    hint: 'Latest auto-cleared legitimate traffic',
    filter: item => item.status === 'cleared',
    bulkSafe: false,
  },
  {
    id: 'auto_decisions',
    label: 'Auto decisions',
    hint: 'System-approved or blocked outcomes',
    filter: item => item.status === 'auto_approved' || item.status === 'auto_blocked',
    bulkSafe: false,
  },
]);

export default function AgentQueueHub({
  queue,
  ledger,
  selected,
  onSelect,
  onBulkAutoApproveSafe,
  onRunAllTasks,
  bulkWorking,
  runAllWorking,
}) {
  const [activeTab, setActiveTab] = useState('high_risk');

  const defs = QUEUE_DEFS;

  const tabRows = useMemo(() => {
    const def = defs.find(d => d.id === activeTab) || defs[0];
    if (activeTab === 'cleared' || activeTab === 'auto_decisions') {
      return ledgerRows(ledger)
        .filter(def.filter)
        .map(r => ({ ...r, stageLog: ledger[r.id]?.stageLog || r.stageLog }))
        .sort((a, b) => (b.ledgerAt || 0) - (a.ledgerAt || 0))
        .slice(0, 40);
    }
    const fromQueue = queue.filter(def.filter);
    return fromQueue.map(q => ({
      ...(ledger[q.id] || {}),
      ...q,
      stageLog: ledger[q.id]?.stageLog || q.stageLog,
    }));
  }, [activeTab, defs, ledger, queue]);

  const rows = tabRows;

  const counts = useMemo(() => {
    const out = {};
    for (const d of defs) {
      if (d.id === 'cleared' || d.id === 'auto_decisions') {
        out[d.id] = ledgerRows(ledger).filter(d.filter).length;
      } else {
        out[d.id] = queue.filter(d.filter).length;
      }
    }
    return out;
  }, [defs, ledger, queue]);

  const currentDef = defs.find(d => d.id === activeTab) || defs[0];

  const handleBulkSafe = useCallback(() => {
    onBulkAutoApproveSafe?.(rows);
  }, [onBulkAutoApproveSafe, rows]);

  const handleRunAll = useCallback(() => {
    onRunAllTasks?.();
  }, [onRunAllTasks]);

  return (
    <div className="rev-card ux-queue-hub">
      <div className="ux-queue-hub__head">
        <div>
          <div className="ux-queue-hub__title ux-display">Agent queues</div>
          <div className="ux-queue-hub__subtitle">{currentDef.hint}</div>
        </div>
        <div className="ux-queue-hub__toolbar">
          <button
            type="button"
            className="ux-queue-hub__btn ux-queue-hub__btn--ghost"
            disabled={runAllWorking}
            onClick={handleRunAll}
            title="Run bundled sample screening, then auto-approve low-risk human-review items"
          >
            {runAllWorking ? 'Running…' : 'Run all tasks'}
          </button>
          <button
            type="button"
            className="ux-queue-hub__btn ux-queue-hub__btn--primary"
            disabled={bulkWorking || !currentDef.bulkSafe || rows.length === 0}
            onClick={handleBulkSafe}
            title="Approve items in this tab where model risk is low (human_review only)"
          >
            {bulkWorking ? 'Working…' : 'Auto-approve safe'}
          </button>
        </div>
      </div>

      <div className="ux-queue-hub__tabs" role="tablist">
        {defs.map(d => (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={activeTab === d.id}
            className={`ux-queue-hub__tab ${activeTab === d.id ? 'ux-queue-hub__tab--on' : ''}`}
            onClick={() => setActiveTab(d.id)}
          >
            <span className="ux-queue-hub__tab-label">{d.label}</span>
            <span className="ux-queue-hub__tab-count">{counts[d.id] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="ux-queue-hub__list">
        {rows.length === 0 && (
          <div className="ux-queue-hub__empty">
            No items in this queue right now.
          </div>
        )}
        {rows.map(item => {
          const isSelected = selected && selected.id === item.id;
          const risk = item.verdict?.risk || 'medium';
          const riskCfg = RISK_CONFIG[risk] || RISK_CONFIG.medium;
          const fp = item.confidence;

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              className={`ux-queue-hub__row ${isSelected ? 'ux-queue-hub__row--selected' : ''}`}
              onClick={() => onSelect(item)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(item);
                }
              }}
            >
              <div className="ux-queue-hub__row-top">
                <span className="ux-queue-hub__merchant">{item.merchant}</span>
                <span className="ux-queue-hub__amount">{fmt(item.amount)}</span>
              </div>
              <div className="ux-queue-hub__row-meta">
                <RiskScorePill payment={null} ledgerEntry={item} />
                <span className="ux-queue-hub__pill" style={{ color: riskCfg.color, background: riskCfg.bg }}>
                  {risk} risk
                </span>
                <span className="ux-queue-hub__status">{STATUS_SHORT[item.status] || item.status}</span>
                {fp != null && (
                  <span className="ux-queue-hub__metric">FP {fp}%</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
