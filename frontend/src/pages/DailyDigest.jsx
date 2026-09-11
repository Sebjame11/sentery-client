import { useState, useMemo, useEffect, useRef } from 'react';
import useStore from '../store/useStore';
import { formatMoney, getReminders, daysInStage, esc } from '../utils/helpers';
import { STAGE_LABELS } from '../utils/constants';
import { showToast } from '../components/Toast';
import { generateFollowUp, generateSmartInsights } from '../utils/ai';
import AIButton, { AIResultModal } from '../components/AIButton';

const CHANNELS = ['Email', 'Call', 'LinkedIn', 'SMS'];
const OUTCOMES = ['replied', 'meeting', 'demo', 'follow-up', 'no-answer', 'interested', 'not-interested'];

const GREETINGS = ['Good morning', 'Good afternoon', 'Good evening'];
const TIPS = [
  'Start with your most overdue item first',
  'Try to hit 5 touches before lunch',
  'A quick check-in call can move stalled deals',
  'Reply rates are highest before 11am',
  'LinkedIn touches convert well for warm leads',
];

function Ring({ pct, size = 72, stroke = 5, color, celebrate }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: celebrate ? 'drop-shadow(0 0 6px rgba(75,123,91,0.4))' : 'none' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color || 'var(--accent)'} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(.22,1,.36,1)' }} />
    </svg>
  );
}

function TrendChart({ data, max }) {
  const [hover, setHover] = useState(null);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100, paddingTop: 8 }}>
      {data.map((d, i) => {
        const h = d.count ? Math.max((d.count / max) * 80, 4) : 2;
        const isHover = hover?.date === d.date;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}
            onMouseEnter={() => setHover(d)}
            onMouseLeave={() => setHover(null)}>
            {isHover && (
              <div style={{ position: 'absolute', bottom: '100%', marginBottom: 6, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 11, whiteSpace: 'nowrap', zIndex: 10, boxShadow: 'var(--glass-shadow)' }}>
                {d.count} touch{d.count !== 1 ? 'es' : ''} &middot; {d.label}
              </div>
            )}
            <div style={{
              width: '100%', height: h,
              background: d.isToday ? 'var(--accent)' : 'var(--accent-tint)',
              borderRadius: '3px 3px 0 0',
              transition: 'height 0.3s, background 0.2s',
              cursor: 'pointer', opacity: isHover ? 1 : 0.85,
            }} />
            <div style={{ fontSize: 8, color: 'var(--text-tertiary)', marginTop: 3, whiteSpace: 'nowrap' }}>
              {d.shortLabel}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ tab, overdue, dueToday, staleDeals }) {
  const msgs = {
    overdue: { icon: 'check-circle', title: 'All caught up', desc: 'Nothing overdue. Great work staying on top of your pipeline.' },
    due: { icon: 'calendar-check', title: 'Nothing due today', desc: 'Use this breathing room to work on stale deals.' },
    stale: { icon: 'zap', title: 'No stale deals', desc: 'Every deal has been touched within the week. Keep it up.' },
  };
  const m = msgs[tab];
  return (
    <div style={{ textAlign: 'center', padding: '28px 16px' }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" style={{ width: 28, height: 28, marginBottom: 8, opacity: 0.4 }}>
        {tab === 'overdue' && <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
        {tab === 'due' && <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
        {tab === 'stale' && <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>}
      </svg>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>{m.title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{m.desc}</div>
    </div>
  );
}

function ActionItem({ p, tab, onLog, onView, onFollowUp }) {
  const lastTouchDate = p.touchpoints?.length ? p.touchpoints[p.touchpoints.length - 1].date : null;
  const daysSince = lastTouchDate ? Math.floor((Date.now() - new Date(lastTouchDate).getTime()) / 86400000) : '?';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 8,
      margin: '0 -6px', transition: 'background 0.12s', cursor: 'default',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-sunken)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 13, cursor: 'pointer', color: 'var(--accent)' }}
            onClick={() => onView(p.id)}>{esc(p.company)}</span>
          <span className={`stage-badge stage-${p.stage}`} style={{ fontSize: 9, padding: '1px 5px' }}>{STAGE_LABELS[p.stage]}</span>
          {p.dealValue ? <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatMoney(p.dealValue)}</span> : null}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
          {p.overdue && <span style={{ color: 'var(--color-error)', fontWeight: 500 }}>{Math.abs(p.daysUntil)}d overdue</span>}
          {!p.overdue && p.daysUntil !== undefined && p.daysUntil <= 0 && <span style={{ color: 'var(--accent)' }}>Due today</span>}
          {tab === 'stale' && <span style={{ color: 'var(--color-warning)' }}>{daysSince}d since last touch</span>}
          {tab === 'stale' && p.name && <span> &middot; {esc(p.name)}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {tab === 'stale' ? (
          <button className="btn-xs" style={{ fontSize: 10, padding: '3px 8px' }}
            onClick={() => onFollowUp(p)}>AI Follow-up</button>
        ) : (
          <button className="btn-xs" style={{ fontSize: 10, padding: '3px 8px' }}
            onClick={() => onLog(p.id)}>Log</button>
        )}
        <button className="btn-xs" style={{ fontSize: 10, padding: '3px 8px' }}
          onClick={() => onView(p.id)}>View</button>
      </div>
    </div>
  );
}

export default function DailyDigest() {
  const prospects = useStore(s => s.prospects);
  const updateProspect = useStore(s => s.updateProspect);
  const addTouchpoint = useStore(s => s.addTouchpoint);
  const setDetailId = useStore(s => s.setDetailId);

  const [dailyGoal, setDailyGoal] = useState(() => parseInt(localStorage.getItem('vn_dailyGoal') || '10'));
  const [editingGoal, setEditingGoal] = useState(false);
  const [showQuickLog, setShowQuickLog] = useState(null);
  const [channel, setChannel] = useState('Email');
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState('');
  const [trendDays, setTrendDays] = useState(7);
  const [aiResult, setAiResult] = useState(null);
  const [aiTitle, setAiTitle] = useState('');
  const [tab, setTab] = useState('overdue');
  const [tabFade, setTabFade] = useState(false);
  const [justLogged, setJustLogged] = useState(false);
  const [genLoading, setGenLoading] = useState(null);
  const goalInputRef = useRef(null);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const hour = today.getHours();
  const greeting = GREETINGS[hour < 12 ? 0 : hour < 17 ? 1 : 2];
  const tip = TIPS[today.getDate() % TIPS.length];

  const getDayTouches = (dateStr) =>
    prospects.flatMap(p => (p.touchpoints || []).filter(t => t.date && t.date.startsWith(dateStr)).map(t => ({ ...t, company: p.company, contact: p.name, prospectId: p.id })));

  const todayTouches = getDayTouches(todayStr);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayTouches = getDayTouches(yesterday.toISOString().slice(0, 10));

  const trendData = useMemo(() =>
    Array.from({ length: trendDays }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - (trendDays - 1 - i));
      const ds = d.toISOString().slice(0, 10);
      const touches = getDayTouches(ds);
      return { date: ds, label: d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }), shortLabel: d.toLocaleDateString('en', { weekday: 'short' }), count: touches.length, touches, isToday: ds === todayStr };
    }), [trendDays, prospects]);
  const maxTrend = Math.max(...trendData.map(d => d.count), 1);

  const reminders = useMemo(() => {
    const followUpDays = parseInt(localStorage.getItem('vn_followUpDays') || '5');
    return getReminders(prospects).map(p => {
      const lastTp = p.touchpoints?.length ? p.touchpoints.reduce((a, t) => new Date(t.date) > new Date(a.date) ? t : a) : null;
      const daysSince = lastTp ? Math.floor((Date.now() - new Date(lastTp.date).getTime()) / 86400000) : daysInStage(p);
      const daysUntil = followUpDays - daysSince;
      return { ...p, daysSince, daysUntil, overdue: daysUntil < 0 };
    });
  }, [prospects]);
  const overdue = useMemo(() => reminders.filter(r => r.overdue).sort((a, b) => a.daysUntil - b.daysUntil), [reminders]);
  const dueToday = useMemo(() => reminders.filter(r => !r.overdue && r.daysUntil <= 0), [reminders]);
  const activeDeals = useMemo(() => prospects.filter(p => !['won', 'lost', 'lead'].includes(p.stage)), [prospects]);
  const staleDeals = useMemo(() => activeDeals.filter(p => {
    const lastTouch = p.touchpoints?.length ? new Date(p.touchpoints[p.touchpoints.length - 1].date) : null;
    return !lastTouch || (Date.now() - lastTouch.getTime()) > 7 * 86400000;
  }).sort((a, b) => {
    const aLast = a.touchpoints?.length ? new Date(a.touchpoints[a.touchpoints.length - 1].date) : new Date(0);
    const bLast = b.touchpoints?.length ? new Date(b.touchpoints[b.touchpoints.length - 1].date) : new Date(0);
    return aLast - bLast;
  }), [activeDeals]);
  const newProspects = useMemo(() => prospects.filter(p => p.addedAt && p.addedAt.startsWith(todayStr)), [prospects]);
  const pipelineValue = useMemo(() => activeDeals.reduce((s, p) => s + (p.dealValue || 0), 0), [activeDeals]);
  const todayProgress = todayTouches.length;
  const goalPct = dailyGoal ? Math.min((todayProgress / dailyGoal) * 100, 100) : 0;
  const celebrate = goalPct >= 100;

  const channelCounts = {};
  todayTouches.forEach(t => { channelCounts[t.channel] = (channelCounts[t.channel] || 0) + 1; });

  const stages = {};
  prospects.forEach(p => { stages[p.stage] = (stages[p.stage] || 0) + 1; });

  useEffect(() => {
    if (editingGoal && goalInputRef.current) goalInputRef.current.focus();
  }, [editingGoal]);

  const saveGoal = () => { setEditingGoal(false); localStorage.setItem('vn_dailyGoal', String(dailyGoal)); showToast(`Daily goal set to ${dailyGoal}`); };

  const quickLogTouch = (pid) => {
    if (!note.trim()) { showToast('Add a note'); return; }
    const p = prospects.find(pr => pr.id === pid);
    if (!p) return;
    addTouchpoint(pid, { channel, note: note.trim(), outcome: outcome || 'pending' });
    setJustLogged(true);
    setTimeout(() => setJustLogged(false), 1200);
    showToast(`Logged ${channel} touchpoint for ${p.company}`);
    setShowQuickLog(null); setNote(''); setOutcome('');
  };

  const getStreak = () => {
    let count = 0;
    const d = new Date();
    while (true) {
      const ds = d.toISOString().slice(0, 10);
      const touches = getDayTouches(ds);
      if (touches.length >= Math.floor(dailyGoal * 0.5)) { count++; d.setDate(d.getDate() - 1); } else break;
    }
    return count;
  };

  const trendArrow = todayTouches.length > yesterdayTouches.length ? 'up' : todayTouches.length < yesterdayTouches.length ? 'down' : 'same';

  const actionItems = tab === 'overdue' ? overdue : tab === 'due' ? dueToday : staleDeals;

  const switchTab = (key) => {
    if (key === tab) return;
    setTabFade(true);
    setTimeout(() => { setTab(key); setTabFade(false); }, 100);
  };

  const genFollowUp = async (p) => {
    setGenLoading(p.id);
    try {
      const lastTp = p.touchpoints?.length ? p.touchpoints[p.touchpoints.length - 1] : null;
      const text = await generateFollowUp(p, lastTp);
      setAiResult(text); setAiTitle(`Follow-up for ${p.company}`);
    } catch { showToast('Failed to generate follow-up'); }
    setGenLoading(null);
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ animation: 'fadeSlideUp 0.3s ease-out' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 1 }}>Daily Digest</div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>
            {greeting}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 1 }}>
            {today.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
        <div style={{ animation: 'fadeSlideUp 0.3s ease-out 0.05s both' }}>
          <AIButton
            label="AI Insights"
            size="normal"
            prospect={prospects}
            onResult={(r) => { setAiResult(r); setAiTitle('Pipeline Insights'); }}
            options={[{ label: 'Pipeline Insights', fn: () => generateSmartInsights(prospects) }]}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div className="stat-card" style={{ textAlign: 'left', padding: 18, cursor: 'default', animation: 'fadeSlideUp 0.3s ease-out 0.1s both', ...(celebrate ? { animation: 'pulse-glow-success 1.5s ease-in-out 2, fadeSlideUp 0.3s ease-out 0.1s both' } : {}) }}
          onClick={() => setEditingGoal(true)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Ring pct={goalPct} size={52} stroke={4}
              color={celebrate ? 'var(--color-success)' : goalPct >= 80 ? 'var(--accent)' : 'var(--accent)'}
              celebrate={celebrate} />
            <div>
              {editingGoal ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input ref={goalInputRef} type="number" className="input"
                    style={{ width: 52, padding: '2px 6px', fontSize: 18, fontWeight: 700, height: 32 }}
                    value={dailyGoal} min={1}
                    onChange={e => setDailyGoal(parseInt(e.target.value) || 1)}
                    onBlur={saveGoal}
                    onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') { setEditingGoal(false); setDailyGoal(parseInt(localStorage.getItem('vn_dailyGoal') || '10')); } }}
                    onClick={e => e.stopPropagation()} autoFocus />
                </div>
              ) : (
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                  {todayProgress}<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-tertiary)' }}>/{dailyGoal}</span>
                </div>
              )}
              <div style={{ fontSize: 11, color: celebrate ? 'var(--color-success)' : 'var(--text-tertiary)', marginTop: 2 }}>
                {celebrate ? 'Goal reached!' : `${Math.round(goalPct)}% today`}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6 }}>Tap to adjust daily goal</div>
        </div>
        <div className="stat-card" style={{ textAlign: 'left', padding: 18, animation: 'fadeSlideUp 0.3s ease-out 0.15s both' }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Touches</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 6 }}>
            {todayTouches.length}
            {trendArrow === 'up' && <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" style={{ width: 16, height: 16 }}><polyline points="18 15 12 9 6 15"/></svg>}
            {trendArrow === 'down' && <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2.5" strokeLinecap="round" style={{ width: 16, height: 16 }}><polyline points="6 9 12 15 18 9"/></svg>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {yesterdayTouches.length} yesterday
          </div>
        </div>
        <div className="stat-card" style={{ textAlign: 'left', padding: 18, animation: 'fadeSlideUp 0.3s ease-out 0.2s both' }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pipeline</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{formatMoney(pipelineValue)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{activeDeals.length} active deals</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'fadeSlideUp 0.3s ease-out 0.25s both' }}>
          <div className="stat-card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Streak</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{getStreak()}</span>
          </div>
          <div className="stat-card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>New Today</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{newProspects.length}</span>
          </div>
        </div>
      </div>

      <div className="stat-card" style={{ padding: 18, marginBottom: 16, animation: 'fadeSlideUp 0.3s ease-out 0.3s both' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Activity Trend
            </div>
            {todayTouches.length > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-sunken)', padding: '2px 8px', borderRadius: 4 }}>
                {todayTouches.length} today
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {[3, 7, 14, 30].map(d => (
              <button key={d} className={trendDays === d ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: 10, padding: '2px 10px', borderRadius: 6 }}
                onClick={() => setTrendDays(d)}>{d}d</button>
            ))}
          </div>
        </div>
        <TrendChart data={trendData} max={maxTrend} />
      </div>

      {justLogged && (
        <div style={{ textAlign: 'center', marginBottom: 12, animation: 'fadeSlideUp 0.2s ease-out' }}>
          <span style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 500, background: 'var(--success-tint)', padding: '4px 14px', borderRadius: 8 }}>
            Touchpoint logged
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="dash-card" style={{ padding: 0, animation: 'fadeSlideUp 0.3s ease-out 0.35s both' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[{ key: 'overdue', label: 'Overdue', count: overdue.length, color: 'var(--color-error)' },
              { key: 'due', label: 'Due Today', count: dueToday.length, color: 'var(--accent)' },
              { key: 'stale', label: 'Stale', count: staleDeals.length, color: 'var(--color-warning)' },
            ].map(t => (
              <button key={t.key} onClick={() => switchTab(t.key)}
                style={{
                  flex: 1, padding: '12px 8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: tab === t.key ? 'var(--glass-bg)' : 'transparent',
                  color: tab === t.key ? t.color : 'var(--text-tertiary)',
                  fontWeight: tab === t.key ? 600 : 400, fontSize: 12,
                  borderBottom: tab === t.key ? `2px solid ${t.color}` : '2px solid transparent',
                  transition: 'all 0.15s',
                }}>
                {t.label} ({t.count})
              </button>
            ))}
          </div>
          <div style={{ padding: 14, maxHeight: 340, overflowY: 'auto', opacity: tabFade ? 0 : 1, transition: 'opacity 0.12s' }}>
            {actionItems.length === 0 ? (
              <EmptyState tab={tab} overdue={overdue} dueToday={dueToday} staleDeals={staleDeals} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {actionItems.slice(0, 10).map((p, i) => (
                  <ActionItem key={p.id || i} p={p} tab={tab}
                    onLog={(pid) => { setShowQuickLog(pid); setChannel('Email'); }}
                    onView={setDetailId}
                    onFollowUp={genFollowUp} />
                ))}
              </div>
            )}
          </div>
          {actionItems.length > 10 && (
            <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              +{actionItems.length - 10} more. Open {tab === 'stale' ? 'Prospects' : 'Reminders'} to see all.
            </div>
          )}
        </div>

        <div className="dash-card" style={{ padding: 16, animation: 'fadeSlideUp 0.3s ease-out 0.4s both' }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 12 }}>
            Today's Channels
          </div>
          {Object.keys(channelCounts).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" style={{ width: 24, height: 24, marginBottom: 6, opacity: 0.3 }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No activity yet</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Log your first touchpoint above</div>
            </div>
          ) : (
            Object.entries(channelCounts).sort((a, b) => b[1] - a[1]).map(([ch, count], i) => {
              const pct = todayTouches.length ? (count / todayTouches.length) * 100 : 0;
              return (
                <div key={ch} style={{ marginBottom: 10, animation: `fadeSlideUp 0.25s ease-out ${i * 0.06}s both` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span className={`channel-badge channel-${ch}`} style={{ fontSize: 10 }}>{ch}</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{count} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>({Math.round(pct)}%)</span></span>
                  </div>
                  <div style={{ height: 4, background: 'var(--bg-sunken)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.6s cubic-bezier(.22,1,.36,1)' }} />
                  </div>
                </div>
              );
            })
          )}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 8 }}>
              Pipeline Stages
            </div>
            {Object.entries(stages).filter(([, c]) => c > 0).sort((a, b) => {
              const order = ['lead', 'contacted', 'engaged', 'meeting', 'proposal', 'negotiation', 'won', 'lost'];
              return order.indexOf(a[0]) - order.indexOf(b[0]);
            }).map(([stage, count], i) => {
              const total = Object.values(stages).reduce((a, b) => a + b, 0);
              const pct = total ? (count / total) * 100 : 0;
              const barColor = stage === 'won' ? 'var(--color-success)' : stage === 'lost' ? 'var(--color-error)' : 'var(--accent)';
              return (
                <div key={stage} style={{ marginBottom: 5, animation: `fadeSlideUp 0.25s ease-out ${i * 0.05 + 0.2}s both` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span className={`stage-badge stage-${stage}`} style={{ fontSize: 9 }}>{STAGE_LABELS[stage]}</span>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{count}</span>
                  </div>
                  <div style={{ height: 3, background: 'var(--bg-sunken)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 2, transition: 'width 0.6s cubic-bezier(.22,1,.36,1)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', opacity: 0.5, padding: '4px 0', animation: 'fadeSlideUp 0.3s ease-out 0.45s both' }}>
        {tip}
      </div>

      {showQuickLog && (() => {
        const p = prospects.find(pr => pr.id === showQuickLog);
        if (!p) return null;
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)',
            animation: 'fadeIn 0.15s ease-out',
          }} onClick={() => setShowQuickLog(null)} onKeyDown={e => e.key === 'Escape' && setShowQuickLog(null)}>
            <div className="liquid-glass-floating" style={{
              width: 420, maxWidth: '94vw', borderRadius: '20px 20px 0 0', padding: '24px 24px 28px',
              borderBottom: 'none', margin: 0, animation: 'slideUp 0.2s ease-out',
            }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>Quick Log</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1 }}>
                    {esc(p.company)} &middot; {esc(p.name)}
                  </div>
                </div>
                <button className="btn-icon-sm" onClick={() => setShowQuickLog(null)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 5, fontWeight: 500 }}>Channel</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {CHANNELS.map(ch => (
                    <button key={ch} className={channel === ch ? 'btn-primary' : 'btn-secondary'}
                      style={{ fontSize: 10, padding: '5px 8px', flex: 1, transition: 'all 0.1s' }}
                      onClick={() => setChannel(ch)}>{ch}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 5, fontWeight: 500 }}>Note</label>
                <textarea className="input textarea" value={note} onChange={e => setNote(e.target.value)}
                  placeholder="What happened?" rows={2} autoFocus style={{ fontSize: 13 }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 5, fontWeight: 500 }}>Outcome</label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {OUTCOMES.map(o => (
                    <button key={o} className={outcome === o ? 'btn-primary' : 'btn-secondary'}
                      style={{ fontSize: 9, padding: '3px 7px', transition: 'all 0.1s' }}
                      onClick={() => setOutcome(outcome === o ? '' : o)}>{o}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ flex: 1 }} onClick={() => quickLogTouch(showQuickLog)}>Log Touchpoint</button>
                <button className="btn-secondary" onClick={() => setShowQuickLog(null)}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
      <AIResultModal title={aiTitle} content={aiResult} onClose={() => setAiResult(null)} />
    </div>
  );
}
