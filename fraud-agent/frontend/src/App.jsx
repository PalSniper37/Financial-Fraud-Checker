import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Stream from './components/Stream.jsx';
import AgentQueueHub from './components/AgentQueueHub.jsx';
import Detail from './components/Detail.jsx';
import SampleShowcase from './components/SampleShowcase.jsx';
import AgentConsole from './components/AgentConsole.jsx';
import AgentProfileDock from './components/AgentProfileDock.jsx';

const BACKEND = 'http://localhost:3001';
const MAX_EVENTS = 36;

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map((line, i) => {
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, j) => { obj[h] = values[j] || ''; });
    if (!obj.id) obj.id = `txn_${Date.now()}_${i}`;
    return obj;
  });
}

function StatCard({ label, value, accent }) {
  return (
    <div className="rev-stat ux-card-glow ux-stat-glass" style={{ flex: 1, minWidth: 108 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--color-text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 8,
        fontFamily: 'var(--font-display)',
      }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: accent || 'var(--color-text-primary)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.03em',
          lineHeight: 1,
          fontFamily: 'var(--font-display)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

const FEED_OPTIONS = [
  { label: 'Every 3s', ms: 3000 },
  { label: 'Every 4.5s', ms: 4500 },
  { label: 'Every 6s', ms: 6000 },
  { label: 'Every 10s', ms: 10000 },
];

export default function App() {
  const [events, setEvents] = useState([]);
  const [queue, setQueue] = useState([]);
  const [selected, setSelected] = useState(null);
  const [connected, setConnected] = useState(false);
  const [liveActive, setLiveActive] = useState(false);
  const [liveIntervalMs, setLiveIntervalMs] = useState(4500);
  const [feedIntervalMs, setFeedIntervalMs] = useState(4500);
  const [insights, setInsights] = useState({ lastStage: null, stageCount: 0 });
  const [samplePayments, setSamplePayments] = useState([]);
  const [sampleMeta, setSampleMeta] = useState(null);
  const [sampleLoadState, setSampleLoadState] = useState({ loading: true, error: null });
  const [sampleScreening, setSampleScreening] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [runAllWorking, setRunAllWorking] = useState(false);
  const [ledger, setLedger] = useState({});
  const esRef = useRef(null);
  const fileInputRef = useRef(null);

  const connectSSE = useCallback(() => {
    if (esRef.current) esRef.current.close();

    const es = new EventSource(`${BACKEND}/stream`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'live_status') {
          setLiveActive(Boolean(data.active));
          if (typeof data.intervalMs === 'number') setLiveIntervalMs(data.intervalMs);
          return;
        }
        if (data.type === 'processing') return;

        setEvents(prev => {
          const next = [data, ...prev].slice(0, MAX_EVENTS);
          return next;
        });

        if (data.type === 'stage') {
          setInsights(prev => ({
            ...prev,
            lastStage: data,
            stageCount: (prev.stageCount || 0) + 1,
          }));
          const tid = data.txnId || data.id;
          if (tid) {
            setLedger(prev => {
              const cur = prev[tid] || { id: tid };
              const stageLog = [...(cur.stageLog || []), data].slice(-48);
              return { ...prev, [tid]: { ...cur, stageLog } };
            });
          }
        }

        if (data.type === 'result' && data.id) {
          setLedger(prev => {
            const prevRow = prev[data.id] || {};
            const stageLog = prevRow.stageLog || [];
            return {
              ...prev,
              [data.id]: {
                ...prevRow,
                ...data,
                stageLog: data.stageLog?.length ? data.stageLog : stageLog,
                ledgerAt: Date.now(),
              },
            };
          });

          const st = data.status;
          if (st === 'awaiting_context' || st === 'human_review') {
            setQueue(prev => {
              const existing = prev.findIndex(i => i.id === data.id);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = data;
                return updated;
              }
              return [data, ...prev];
            });
            setSelected(prev => {
              if (prev && prev.id === data.id) return { ...prev, ...data };
              return prev;
            });
          } else {
            setQueue(prev => prev.filter(i => i.id !== data.id));
            setSelected(prev => {
              if (prev && prev.id === data.id) return { ...prev, ...data };
              return prev;
            });
          }
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      setTimeout(connectSSE, 3000);
    };
  }, []);

  useEffect(() => {
    connectSSE();
    return () => {
      if (esRef.current) esRef.current.close();
    };
  }, [connectSSE]);

  useEffect(() => {
    fetch(`${BACKEND}/live/status`)
      .then(r => r.json())
      .then(d => {
        setLiveActive(Boolean(d.active));
        if (typeof d.intervalMs === 'number') setLiveIntervalMs(d.intervalMs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BACKEND}/sample-payments`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setSamplePayments(data.payments || []);
        setSampleMeta({ title: data.title, description: data.description });
        setSampleLoadState({ loading: false, error: null });
      } catch {
        if (cancelled) return;
        setSampleLoadState({
          loading: false,
          error: 'Could not load sample payments.',
        });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function startLiveFeed() {
    try {
      const res = await fetch(`${BACKEND}/live/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMs: feedIntervalMs }),
      });
      const data = await res.json();
      if (data.intervalMs) setLiveIntervalMs(data.intervalMs);
      setLiveActive(true);
    } catch (err) {
      console.error('Live start failed:', err);
    }
  }

  async function stopLiveFeed() {
    try {
      await fetch(`${BACKEND}/live/stop`, { method: 'POST' });
      setLiveActive(false);
    } catch (err) {
      console.error('Live stop failed:', err);
    }
  }

  async function runSampleScreening() {
    setSampleScreening(true);
    try {
      const res = await fetch(`${BACKEND}/demo/sample`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.error(e);
    } finally {
      setSampleScreening(false);
    }
  }

  const postAgentDecision = useCallback(async (t, action) => {
    await fetch(`${BACKEND}/agent/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txnId: t.id,
        action,
        merchant: t.merchant,
        amount: t.amount,
        date: t.date,
        user_id: t.user_id,
        category: t.category,
      }),
    });
  }, []);

  async function acceptLowRiskBatch() {
    setBulkWorking(true);
    try {
      const targets = queue.filter(
        i => i.status === 'human_review' && i.verdict?.risk === 'low'
      );
      for (const t of targets) {
        await postAgentDecision(t, 'approve');
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBulkWorking(false);
    }
  }

  async function bulkAutoApproveSafeForRows(rows) {
    const targets = (rows || []).filter(
      i => i.status === 'human_review' && i.verdict?.risk === 'low'
    );
    if (!targets.length) return;
    setBulkWorking(true);
    try {
      for (const t of targets) {
        await postAgentDecision(t, 'approve');
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBulkWorking(false);
    }
  }

  async function runAllTasks() {
    setRunAllWorking(true);
    try {
      const res = await fetch(`${BACKEND}/demo/sample`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await new Promise(r => setTimeout(r, 2500));
      await acceptLowRiskBatch();
    } catch (e) {
      console.error(e);
    } finally {
      setRunAllWorking(false);
    }
  }

  const detailItem = useMemo(() => {
    if (!selected?.id) return null;
    const L = ledger[selected.id] || {};
    const stageLog = L.stageLog?.length ? L.stageLog : selected.stageLog;
    return { ...L, ...selected, stageLog: stageLog || [] };
  }, [selected, ledger]);

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const transactions = parseCSV(text);

    try {
      await fetch(`${BACKEND}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions }),
      });
    } catch (err) {
      console.error('Upload failed:', err);
    }

    e.target.value = '';
  }

  const stageEvents = events.filter(ev => ev.type === 'stage');
  const totalProcessed = events.filter(ev => ev.type === 'result' && ev.status).length;
  const autoCleared = events.filter(ev => ev.status === 'cleared' || ev.status === 'auto_approved').length;
  const inQueue = queue.filter(i => i.status === 'awaiting_context' || i.status === 'human_review').length;
  const autoBlocked = events.filter(ev => ev.status === 'auto_blocked').length;
  const lowRiskPending = queue.filter(
    i => i.status === 'human_review' && i.verdict?.risk === 'low'
  ).length;

  return (
    <div className="rev-shell" style={{ display: 'flex', flexDirection: 'column' }}>
      <header className="rev-header ux-header-future" style={{
        padding: '10px max(20px, 4vw)',
        minHeight: 62,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, auto) minmax(0, 1fr) minmax(0, auto)',
        alignItems: 'center',
        gap: 14,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <div className="rev-logo" aria-hidden>R</div>
          <div style={{ minWidth: 0 }}>
            <div className="ux-display" style={{
              fontWeight: 700,
              fontSize: 18,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.04em',
            }}>
              Fraud screening
            </div>
            <div
              className="ux-tagline-shine"
              style={{
                fontSize: 12,
                marginTop: 3,
                fontWeight: 600,
              }}
            >
              Autonomous agent · live decisions
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          justifySelf: 'end',
          minWidth: 0,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            fontWeight: 700,
            color: connected ? 'var(--color-text-success)' : 'var(--color-text-tertiary)',
            fontFamily: 'var(--font-display)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            <span
              className={connected ? 'rev-pill-live-dot' : ''}
              style={connected ? {} : {
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--color-text-tertiary)',
                display: 'inline-block',
              }}
            />
            {connected ? 'Live' : 'Reconnecting…'}
          </div>

          <select
            value={feedIntervalMs}
            onChange={e => setFeedIntervalMs(Number(e.target.value))}
            disabled={liveActive}
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--border-radius-md)',
              border: '0.5px solid var(--color-border-secondary)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
              fontSize: 12,
              cursor: liveActive ? 'not-allowed' : 'pointer',
            }}
            title="Time between synthetic transactions"
          >
            {FEED_OPTIONS.map(o => (
              <option key={o.ms} value={o.ms}>{o.label}</option>
            ))}
          </select>

          {liveActive ? (
            <button
              type="button"
              onClick={stopLiveFeed}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--border-radius-md)',
                border: '0.5px solid #fca5a5',
                background: '#fef2f2',
                color: '#b91c1c',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Stop live feed
            </button>
          ) : (
            <button
              type="button"
              onClick={startLiveFeed}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--border-radius-md)',
                border: '0.5px solid #86efac',
                background: '#f0fdf4',
                color: '#166534',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Start live portal
            </button>
          )}

          <button
            type="button"
            className="ux-btn-quiet"
            disabled={bulkWorking || lowRiskPending === 0}
            onClick={acceptLowRiskBatch}
            style={{ opacity: lowRiskPending === 0 ? 0.45 : 1 }}
            title="Approve all items in review with low model risk"
          >
            {bulkWorking ? 'Accepting…' : `Auto-accept low risk (${lowRiskPending})`}
          </button>
          <button
            type="button"
            className="rev-btn-ghost"
            onClick={() => fileInputRef.current?.click()}
          >
            Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </div>

        <AgentProfileDock connected={connected} />
      </header>

      {liveActive && (
        <div style={{
          background: 'linear-gradient(90deg, #ecfdf5 0%, #f0fdf4 50%, #ecfdf5 100%)',
          borderBottom: '0.5px solid #bbf7d0',
          padding: '8px 24px',
          fontSize: 12,
          color: '#166534',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <span style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#22c55e',
            animation: 'pulse-dot 1.5s ease-in-out infinite',
          }} />
          <strong>Live portal</strong>
          <span style={{ color: '#15803d' }}>
            Synthetic transactions are streaming — next tick about every {(liveIntervalMs / 1000).toFixed(1)}s. Same real-time pipeline as production (classify → queue → verdict).
          </span>
        </div>
      )}

      <div style={{
        padding: '20px max(20px, 4vw) 0',
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
      }}>
        <StatCard label="Processed" value={totalProcessed} />
        <StatCard label="Released" value={autoCleared} accent="var(--color-text-success)" />
        <StatCard label="In flow" value={inQueue} accent="var(--color-text-warning)" />
        <StatCard label="Held" value={autoBlocked} accent="var(--color-text-danger)" />
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', width: '100%', paddingBottom: 4 }}>
        <SampleShowcase
          backendUrl={BACKEND}
          payments={samplePayments}
          meta={sampleMeta}
          loading={sampleLoadState.loading}
          error={sampleLoadState.error}
          screening={sampleScreening}
          onRunScreening={runSampleScreening}
          ledger={ledger}
        />
      </div>

      <AgentConsole stages={stageEvents} />

      {insights.lastStage && (
        <div
          className="rev-insights ux-pipeline-shimmer"
          style={{
            margin: '10px max(20px, 4vw) 0',
            padding: '12px 18px',
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            maxWidth: 1280,
            marginLeft: 'auto',
            marginRight: 'auto',
            width: 'calc(100% - 2 * max(20px, 4vw))',
            fontWeight: 500,
          }}
        >
          <span className="ux-display" style={{ fontWeight: 700, color: 'var(--color-text-primary)', marginRight: 6 }}>Signal</span>
          {insights.lastStage.stage === 'escalated_agent' && (
            <>
              Escalated · {insights.lastStage.phase || '—'}
              {insights.lastStage.risk_score != null && (
                <> · score {insights.lastStage.risk_score}</>
              )}
              {insights.lastStage.routed_action && (
                <> → {String(insights.lastStage.routed_action).replace(/_/g, ' ')}</>
              )}
            </>
          )}
          {insights.lastStage.stage === 'confidence_gate' && (
            <>Gate {insights.lastStage.branch || '—'}{insights.lastStage.confidence != null ? ` · ${insights.lastStage.confidence}%` : ''}</>
          )}
          {insights.lastStage.stage && insights.lastStage.stage !== 'escalated_agent' && insights.lastStage.stage !== 'confidence_gate' && (
            <>{String(insights.lastStage.stage).replace(/_/g, ' ')}</>
          )}
        </div>
      )}

      <div
        className="rev-main-grid"
        style={{
          gridTemplateRows: 'auto auto',
          padding: '12px max(20px, 4vw) 32px',
          flex: 1,
          maxWidth: 1280,
          margin: '0 auto',
          width: '100%',
          alignContent: 'start',
        }}
      >
        <Stream events={events} liveActive={liveActive} />
        <AgentQueueHub
          queue={queue}
          ledger={ledger}
          selected={selected}
          onSelect={setSelected}
          onBulkAutoApproveSafe={bulkAutoApproveSafeForRows}
          onRunAllTasks={runAllTasks}
          bulkWorking={bulkWorking}
          runAllWorking={runAllWorking}
        />
        <div style={{ gridColumn: '1 / -1' }}>
          <Detail item={detailItem} backendUrl={BACKEND} onAgentAction={postAgentDecision} />
        </div>
      </div>
    </div>
  );
}
