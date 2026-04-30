import React, { useState, useEffect, useRef } from 'react';

const LS = {
  displayName: 'fraudcc_displayName',
  email: 'fraudcc_email',
  timezone: 'fraudcc_timezone',
  soundAlerts: 'fraudcc_soundAlerts',
  compactPanels: 'fraudcc_compactPanels',
};

const DEFAULTS = {
  displayName: 'Alex Rivera',
  email: 'agent.operations@example.com',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  soundAlerts: '0',
  compactPanels: '0',
};

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v != null && v !== '' ? v : fallback;
  } catch {
    return fallback;
  }
}

export default function AgentProfileDock({ connected }) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(DEFAULTS.displayName);
  const [email, setEmail] = useState(DEFAULTS.email);
  const [timezone, setTimezone] = useState(DEFAULTS.timezone);
  const [soundAlerts, setSoundAlerts] = useState(false);
  const [compactPanels, setCompactPanels] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    setDisplayName(load(LS.displayName, DEFAULTS.displayName));
    setEmail(load(LS.email, DEFAULTS.email));
    setTimezone(load(LS.timezone, DEFAULTS.timezone));
    const c = load(LS.compactPanels, '0') === '1';
    const s = load(LS.soundAlerts, '0') === '1';
    setSoundAlerts(s);
    setCompactPanels(c);
    document.documentElement.dataset.fraudccCompact = c ? '1' : '0';
  }, []);

  useEffect(() => {
    document.documentElement.dataset.fraudccCompact = compactPanels ? '1' : '0';
  }, [compactPanels]);

  useEffect(() => {
    function onDoc(e) {
      if (!open) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function persist() {
    try {
      localStorage.setItem(LS.displayName, displayName.trim() || DEFAULTS.displayName);
      localStorage.setItem(LS.email, email.trim());
      localStorage.setItem(LS.timezone, timezone.trim() || DEFAULTS.timezone);
      localStorage.setItem(LS.soundAlerts, soundAlerts ? '1' : '0');
      localStorage.setItem(LS.compactPanels, compactPanels ? '1' : '0');
    } catch { /* ignore */ }
    document.documentElement.dataset.fraudccCompact = compactPanels ? '1' : '0';
    setOpen(false);
  }

  const initials = (displayName || 'A')
    .split(/\s+/)
    .map(s => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'A';

  return (
    <div className="ux-profile-dock" ref={wrapRef}>
      <button
        type="button"
        className="ux-profile-chip"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="ux-profile-chip__avatar" aria-hidden>{initials}</span>
        <span className="ux-profile-chip__text">
          <span className="ux-profile-chip__name ux-display">{displayName}</span>
          <span className="ux-profile-chip__role">Contact center agent</span>
        </span>
        <span
          className={`ux-profile-chip__status ${connected ? 'ux-profile-chip__status--live' : ''}`}
          title={connected ? 'Console connected' : 'Reconnecting…'}
        />
        <span className="ux-profile-chip__chev" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="ux-settings-panel" role="dialog" aria-label="Profile settings">
          <div className="ux-settings-panel__head ux-display">Profile & workspace</div>
          <p className="ux-settings-panel__hint">Saved locally in this browser.</p>

          <label className="ux-settings-field">
            <span>Display name</span>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label className="ux-settings-field">
            <span>Work email</span>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="ux-settings-field">
            <span>Timezone</span>
            <input
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              placeholder="e.g. Europe/London"
            />
          </label>

          <div className="ux-settings-toggles">
            <label className="ux-settings-toggle">
              <input
                type="checkbox"
                checked={soundAlerts}
                onChange={e => setSoundAlerts(e.target.checked)}
              />
              <span>Sound alerts for queue items</span>
            </label>
            <label className="ux-settings-toggle">
              <input
                type="checkbox"
                checked={compactPanels}
                onChange={e => setCompactPanels(e.target.checked)}
              />
              <span>Compact activity panels</span>
            </label>
          </div>

          <div className="ux-settings-panel__actions">
            <button type="button" className="ux-settings-btn ux-settings-btn--ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="ux-settings-btn ux-settings-btn--primary" onClick={persist}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
