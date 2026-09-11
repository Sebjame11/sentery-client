import { useState, useMemo, useCallback, useEffect } from 'react';
import useStore from '../store/useStore';
import { supabase } from '../lib/supabase';
import { formatMoney, timeAgo, esc } from '../utils/helpers';
import { STAGE_LABELS } from '../utils/constants';

const COLORS = ['#4B7B5B', '#D97757', '#5B8DEF', '#B98900', '#9B6BC4', '#E07268', '#9C988F', '#14b8a6'];
const CHANNEL_COLORS = { email:'#5B8DEF', call:'#D97757', linkedin:'#0077B5', sms:'#9B6BC4', meeting:'#4B7B5B', other:'#9C988F' };
const CHANNEL_ICONS = {
    email: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,4 12,13 2,4"/></svg>,
    call: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
    linkedin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>,
    sms: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    meeting: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_NAMES_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function startOfWeek(d) { const s = new Date(d); s.setDate(s.getDate() - s.getDay()); s.setHours(0,0,0,0); return s; }
function isSameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function isToday(d) { return isSameDay(d, new Date()); }
function fmtTime(d) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }); }
function fmtDate(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

function EventModal({ event, onClose, onSave, onDelete, prospects }) {
    const [form, setForm] = useState(() => {
        if (event) {
            return {
                title: event.title || '',
                description: event.description || '',
                startsAt: event.starts_at ? new Date(event.starts_at).toISOString().slice(0, 16) : '',
                endsAt: event.ends_at ? new Date(event.ends_at).toISOString().slice(0, 16) : '',
                allDay: event.all_day || false,
                color: event.color || COLORS[0],
                linkedProspectId: event.linked_prospect_id || null,
            };
        }
        const now = new Date();
        const start = new Date(now);
        start.setMinutes(0, 0, 0);
        start.setHours(start.getHours() + 1);
        const end = new Date(start);
        end.setHours(end.getHours() + 1);
        return {
            title: '',
            description: '',
            startsAt: start.toISOString().slice(0, 16),
            endsAt: end.toISOString().slice(0, 16),
            allDay: false,
            color: COLORS[0],
            linkedProspectId: null,
        };
    });

    const save = () => {
        if (!form.title.trim()) return;
        onSave({
            title: form.title.trim(),
            description: form.description.trim(),
            starts_at: new Date(form.startsAt).toISOString(),
            ends_at: new Date(form.endsAt).toISOString(),
            all_day: form.allDay,
            color: form.color,
            linked_prospect_id: form.linkedProspectId,
        });
    };

    return (
        <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:24,maxWidth:480,width:'95%',maxHeight:'85vh',overflow:'auto'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                    <h3 style={{margin:0,fontSize:16,fontWeight:600}}>{event ? 'Edit Event' : 'New Event'}</h3>
                    <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)',padding:4}}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                    <div>
                        <label style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4}}>Title</label>
                        <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Meeting with..." autoFocus
                            style={{width:'100%',padding:'8px 12px',fontSize:13,borderRadius:8,border:'1.5px solid var(--border)',background:'var(--bg-canvas)',color:'var(--text-primary)',outline:'none',fontFamily:'inherit',boxSizing:'border-box'}} />
                    </div>
                    <div style={{display:'flex',gap:12}}>
                        <div style={{flex:1}}>
                            <label style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4}}>Start</label>
                            <input type="datetime-local" value={form.startsAt} onChange={e => setForm({...form, startsAt: e.target.value})}
                                style={{width:'100%',padding:'8px 12px',fontSize:13,borderRadius:8,border:'1.5px solid var(--border)',background:'var(--bg-canvas)',color:'var(--text-primary)',outline:'none',fontFamily:'inherit',boxSizing:'border-box'}} />
                        </div>
                        <div style={{flex:1}}>
                            <label style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4}}>End</label>
                            <input type="datetime-local" value={form.endsAt} onChange={e => setForm({...form, endsAt: e.target.value})}
                                style={{width:'100%',padding:'8px 12px',fontSize:13,borderRadius:8,border:'1.5px solid var(--border)',background:'var(--bg-canvas)',color:'var(--text-primary)',outline:'none',fontFamily:'inherit',boxSizing:'border-box'}} />
                        </div>
                    </div>
                    <div>
                        <label style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4}}>Description</label>
                        <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} placeholder="Optional notes..."
                            style={{width:'100%',padding:'8px 12px',fontSize:13,borderRadius:8,border:'1.5px solid var(--border)',background:'var(--bg-canvas)',color:'var(--text-primary)',outline:'none',fontFamily:'inherit',boxSizing:'border-box',resize:'vertical'}} />
                    </div>
                    <div>
                        <label style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:6}}>Color</label>
                        <div style={{display:'flex',gap:6}}>
                            {COLORS.map(c => (
                                <button key={c} onClick={() => setForm({...form, color: c})}
                                    style={{width:24,height:24,borderRadius:'50%',background:c,border:form.color === c ? '2px solid var(--text-primary)' : '2px solid transparent',cursor:'pointer',transition:'border 0.15s'}} />
                            ))}
                        </div>
                    </div>
                    {prospects.length > 0 && (
                        <div>
                            <label style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4}}>Link to Contact</label>
                            <select value={form.linkedProspectId || ''} onChange={e => setForm({...form, linkedProspectId: e.target.value ? Number(e.target.value) : null})}
                                style={{width:'100%',padding:'8px 12px',fontSize:13,borderRadius:8,border:'1.5px solid var(--border)',background:'var(--bg-canvas)',color:'var(--text-primary)',outline:'none',fontFamily:'inherit',boxSizing:'border-box'}}>
                                <option value="">None</option>
                                {prospects.slice(0, 50).map(p => <option key={p.id} value={p.id}>{p.name}{p.company ? ' — ' + p.company : ''}</option>)}
                            </select>
                        </div>
                    )}
                </div>
                <div style={{display:'flex',gap:8,marginTop:20}}>
                    <button onClick={save} style={{flex:1,padding:'10px',borderRadius:8,border:'none',background:'var(--accent)',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                        {event ? 'Save Changes' : 'Create Event'}
                    </button>
                    {event && (
                        <button onClick={() => { onDelete(event.id); onClose(); }}
                            style={{padding:'10px 16px',borderRadius:8,border:'1px solid var(--danger)',background:'transparent',color:'var(--danger)',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>
                            Delete
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function DetailDrawer({ item, onClose, onOpenProspect }) {
    if (!item) return null;
    const isEvent = item._type === 'event' || (!item._type && item.starts_at && item.title && !item._channel);
    const isMeeting = item._type === 'meeting';
    const isTouchpoint = item._type === 'touchpoint';
    const color = item.color || CHANNEL_COLORS[item._channel] || COLORS[0];

    return (
        <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',justifyContent:'flex-end',background:'rgba(0,0,0,0.4)'}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{background:'var(--bg-surface)',width:420,maxWidth:'90vw',height:'100%',display:'flex',flexDirection:'column',boxShadow:'-4px 0 24px rgba(0,0,0,0.15)',animation:'slideInRight 0.2s ease-out'}}>
                <div style={{padding:'20px 24px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <span style={{width:10,height:10,borderRadius:'50%',background:color,flexShrink:0}} />
                        <span style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em'}}>
                            {isEvent ? 'Event' : isMeeting ? 'Meeting' : isTouchpoint ? (item._channel || 'Touchpoint') : 'Item'}
                        </span>
                    </div>
                    <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)',padding:4}}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div style={{flex:1,overflowY:'auto',padding:'20px 24px',display:'flex',flexDirection:'column',gap:16}}>
                    <div>
                        <div style={{fontSize:18,fontWeight:600,color:'var(--text-primary)',lineHeight:1.3,wordBreak:'break-word'}}>
                            {item.title || (isMeeting ? (item._guestName || 'Meeting') : isTouchpoint ? (item.note || item._channel) : 'Untitled')}
                        </div>
                    </div>

                    {isEvent && item.description && (
                        <div>
                            <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Description</div>
                            <div style={{fontSize:13,color:'var(--text-primary)',lineHeight:1.5,whiteSpace:'pre-wrap'}}>{item.description}</div>
                        </div>
                    )}

                    {isMeeting && item._guestEmail && (
                        <Field label="Guest" value={item._guestName ? `${item._guestName} <${item._guestEmail}>` : item._guestEmail} />
                    )}

                    {isMeeting && !item._guestEmail && item._guestName && (
                        <Field label="Guest" value={item._guestName} />
                    )}

                    {isTouchpoint && item._prospectName && (
                        <div>
                            <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Contact</div>
                            <div style={{fontSize:13,color:onOpenProspect ? 'var(--accent)' : 'var(--text-primary)',fontWeight:500,cursor:onOpenProspect ? 'pointer' : 'default',textDecoration:onOpenProspect ? 'underline' : 'none'}} onClick={onOpenProspect}>{item._prospectName}</div>
                        </div>
                    )}

                    {(item.starts_at || item.startsAt) && (
                        <Field label="Date" value={new Date(item.starts_at || item.startsAt).toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} />
                    )}

                    {item.ends_at && item.starts_at && (
                        <Field label="Duration" value={(() => {
                            const ms = new Date(item.ends_at) - new Date(item.starts_at);
                            const mins = Math.round(ms / 60000);
                            if (mins < 60) return mins + ' minutes';
                            const hrs = Math.floor(mins / 60);
                            const rem = mins % 60;
                            return rem ? `${hrs}h ${rem}m` : `${hrs} hours`;
                        })()} />
                    )}

                    {isTouchpoint && item.outcome && (
                        <Field label="Outcome" value={item.outcome} />
                    )}

                    {isTouchpoint && item.type && (
                        <Field label="Type" value={item.type} />
                    )}

                    {isMeeting && item._location && (
                        <div>
                            <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Location</div>
                            {item._location.startsWith('http') ? (
                                <a href={item._location} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:'var(--accent)',textDecoration:'none',wordBreak:'break-all'}}>{item._location}</a>
                            ) : (
                                <div style={{fontSize:13,color:'var(--text-primary)'}}>{item._location}</div>
                            )}
                        </div>
                    )}

                    {isTouchpoint && item.note && (
                        <div>
                            <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Note</div>
                            <div style={{fontSize:13,color:'var(--text-primary)',lineHeight:1.5,whiteSpace:'pre-wrap'}}>{item.note}</div>
                        </div>
                    )}

                    {isTouchpoint && item.created_at && (
                        <Field label="Logged" value={timeAgo(item.created_at)} />
                    )}

                    {isMeeting && item.status && (
                        <Field label="Status" value={item.status} />
                    )}
                </div>
            </div>
        </div>
    );
}

function Field({ label, value }) {
    return (
        <div>
            <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>{label}</div>
            <div style={{fontSize:13,color:'var(--text-primary)',wordBreak:'break-word'}}>{value}</div>
        </div>
    );
}

function MonthView({ year, month, events, touchpoints, meetings, onSelectDay, onEventClick }) {
    const first = new Date(year, month, 1);
    const last = endOfMonth(first);
    const startDate = startOfWeek(first);
    const days = [];
    const d = new Date(startDate);
    while (d <= last || days.length % 7 !== 0) {
        days.push(new Date(d));
        d.setDate(d.getDate() + 1);
        if (days.length > 42) break;
    }

    const eventsByDate = useMemo(() => {
        const map = {};
        const touchpointSummary = {};

        touchpoints.forEach(t => {
            const dateStr = t.date || (t.created_at || '').slice(0, 10);
            if (!dateStr) return;
            const key = dateStr.slice(0, 10);
            if (!touchpointSummary[key]) touchpointSummary[key] = {};
            const ch = t.channel || 'other';
            touchpointSummary[key][ch] = (touchpointSummary[key][ch] || 0) + 1;
        });

        events.forEach(e => {
            const key = new Date(e.starts_at).toISOString().slice(0, 10);
            if (!map[key]) map[key] = { full: [], counts: null };
            map[key].full.push({ ...e, _type: 'event' });
        });
        meetings.forEach(m => {
            const key = new Date(m.starts_at).toISOString().slice(0, 10);
            if (!map[key]) map[key] = { full: [], counts: null };
            map[key].full.push({
                id: 'mt-' + m.id,
                title: m.guest_name || 'Meeting',
                color: CHANNEL_COLORS.meeting,
                _type: 'meeting',
                _guestEmail: m.guest_email,
                _location: m.location,
                starts_at: m.starts_at,
                ends_at: m.ends_at,
            });
        });

        Object.keys(touchpointSummary).forEach(key => {
            if (!map[key]) map[key] = { full: [], counts: null };
            map[key].counts = touchpointSummary[key];
        });

        return map;
    }, [events, touchpoints, meetings]);

    return (
        <div style={{display:'flex',flexDirection:'column',borderTop:'1px solid var(--border)',flex:1,minHeight:0}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7, 1fr)',flexShrink:0}}>
                {DAY_NAMES.map(d => (
                    <div key={d} style={{padding:'8px 0',textAlign:'center',fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid var(--border)'}}>
                        {d}
                    </div>
                ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(7, 1fr)',gridAutoRows:'minmax(90px, 1fr)',flex:1,overflowY:'auto',minHeight:0}}>
            {days.map((day, i) => {
                const key = day.toISOString().slice(0, 10);
                const dayData = eventsByDate[key] || { full: [], counts: null };
                const dayEvents = dayData.full;
                const dayCounts = dayData.counts;
                const totalCount = dayEvents.length + (dayCounts ? Object.values(dayCounts).reduce((a,b) => a+b, 0) : 0);
                const inMonth = day.getMonth() === month;
                const today = isToday(day);
                return (
                    <div key={i} onClick={() => onSelectDay(day)}
                        style={{
                            overflow:'hidden',padding:'4px 6px',borderBottom:'1px solid var(--border)',borderRight: (i % 7 < 6) ? '1px solid var(--border)' : 'none',
                            background: today ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'transparent',
                            cursor:'pointer',transition:'background 0.12s',opacity: inMonth ? 1 : 0.35,
                        }}
                        onMouseEnter={e => { if (inMonth) e.currentTarget.style.background = 'var(--bg-sunken)'; }}
                        onMouseLeave={e => { if (inMonth) e.currentTarget.style.background = today ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'transparent'; }}
                    >
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:2}}>
                            <span style={{
                                fontSize:12,fontWeight: today ? 700 : 500,
                                color: today ? 'var(--accent)' : inMonth ? 'var(--text-primary)' : 'var(--text-muted)',
                                width:22,height:22,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                                background: today ? 'var(--accent)' : 'transparent',
                            }}>
                                <span style={{color: today ? '#fff' : 'inherit'}}>{day.getDate()}</span>
                            </span>
                            {totalCount > 0 && (
                                <span style={{fontSize:10,color:'var(--text-tertiary)',fontWeight:500}}>{totalCount}</span>
                            )}
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:1}}>
                            {dayEvents.slice(0, 2).map((ev, j) => (
                                <div key={j} onClick={e => { e.stopPropagation(); onEventClick(ev); }}
                                    style={{
                                        display:'flex',alignItems:'center',gap:3,
                                        padding:'1px 4px',borderRadius:3,
                                        background: ev.color + '18',
                                        fontSize:10,fontWeight:500,color:'var(--text-primary)',
                                        overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',
                                        cursor:'pointer',
                                    }}>
                                    <span style={{width:5,height:5,borderRadius:'50%',background:ev.color,flexShrink:0}} />
                                    <span style={{overflow:'hidden',textOverflow:'ellipsis'}}>{ev.title}</span>
                                </div>
                            ))}
                            {dayCounts && (
                                <div style={{display:'flex',gap:2,flexWrap:'wrap',marginTop:1}}>
                                    {Object.entries(dayCounts).slice(0, 4).map(([ch, count]) => (
                                        <span key={ch} style={{
                                            display:'inline-flex',alignItems:'center',gap:2,
                                            padding:'0 4px',borderRadius:8,height:14,
                                            background:(CHANNEL_COLORS[ch] || COLORS[5]) + '18',
                                            fontSize:9,fontWeight:600,color:'var(--text-secondary)',
                                        }}>
                                            <span style={{width:4,height:4,borderRadius:'50%',background:CHANNEL_COLORS[ch] || COLORS[5]}} />
                                            {count}
                                        </span>
                                    ))}
                                    {Object.keys(dayCounts).length > 4 && (
                                        <span style={{fontSize:9,color:'var(--text-tertiary)'}}>+{Object.keys(dayCounts).length - 4}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
            </div>
        </div>
    );
}

function WeekView({ baseDate, events, touchpoints, meetings, onEventClick }) {
    const weekStart = startOfWeek(new Date(baseDate));
    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
    });

    const hours = Array.from({ length: 15 }, (_, i) => i + 7); // 7am to 9pm

    const itemsByDayAndHour = useMemo(() => {
        const map = {};
        const addItem = (item, dateStr, hour) => {
            const key = dateStr + '-' + hour;
            if (!map[key]) map[key] = [];
            map[key].push(item);
        };
        events.forEach(e => {
            const d = new Date(e.starts_at);
            const dateStr = d.toISOString().slice(0, 10);
            addItem({ ...e, _type: 'event' }, dateStr, d.getHours());
        });
        meetings.forEach(m => {
            const d = new Date(m.starts_at);
            const dateStr = d.toISOString().slice(0, 10);
            addItem({ id: 'mt-' + m.id, title: m.guest_name || 'Meeting', color: CHANNEL_COLORS.meeting, _type: 'meeting', _guestName: m.guest_name, _guestEmail: m.guest_email, _location: m.location, starts_at: m.starts_at, ends_at: m.ends_at, status: m.status }, dateStr, d.getHours());
        });
        touchpoints.forEach(t => {
            const dateStr = (t.date || t.created_at || '').slice(0, 10);
            if (!dateStr) return;
            const td = new Date(t.date || t.created_at);
            const hour = td.getHours();
            addItem({
                id: 'tp-' + t.id,
                title: t.prospect?.name ? t.prospect.name + ' — ' + (t.note || t.channel) : (t.note || t.channel),
                color: CHANNEL_COLORS[t.channel] || COLORS[5],
                _type: 'touchpoint',
                _channel: t.channel,
                _prospectName: t.prospect?.name || '',
                _prospectId: t.prospect?.id,
                note: t.note,
                outcome: t.outcome,
                type: t.type,
                starts_at: t.date || t.created_at,
                created_at: t.created_at,
            }, dateStr, hour);
        });
        return map;
    }, [events, meetings, touchpoints]);

    const tpCountsByDate = useMemo(() => {
        const map = {};
        touchpoints.forEach(t => {
            const dateStr = (t.date || t.created_at || '').slice(0, 10);
            if (!dateStr) return;
            if (!map[dateStr]) map[dateStr] = {};
            const ch = t.channel || 'other';
            map[dateStr][ch] = (map[dateStr][ch] || 0) + 1;
        });
        return map;
    }, [touchpoints]);

    return (
        <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:'60px repeat(7, 1fr)',borderBottom:'1px solid var(--border)',flexShrink:0}}>
                <div />
                {days.map((d, i) => {
                    const today = isToday(d);
                    const dateStr = d.toISOString().slice(0, 10);
                    const tpCounts = tpCountsByDate[dateStr] || null;
                    return (
                        <div key={i} style={{padding:'8px 4px',textAlign:'center',borderLeft:'1px solid var(--border)'}}>
                            <div style={{fontSize:10,fontWeight:600,color:today ? 'var(--accent)' : 'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{DAY_NAMES[d.getDay()]}</div>
                            <div style={{fontSize:16,fontWeight:600,color:today ? 'var(--accent)' : 'var(--text-primary)',marginTop:2}}>{d.getDate()}</div>
                            {tpCounts && (
                                <div style={{display:'flex',gap:2,justifyContent:'center',marginTop:3}}>
                                    {Object.entries(tpCounts).slice(0, 4).map(([ch, count]) => (
                                        <span key={ch} style={{
                                            display:'inline-flex',alignItems:'center',gap:2,
                                            padding:'0 4px',borderRadius:8,height:14,
                                            background:(CHANNEL_COLORS[ch] || COLORS[5]) + '18',
                                            fontSize:9,fontWeight:600,color:'var(--text-secondary)',
                                        }}>
                                            <span style={{width:4,height:4,borderRadius:'50%',background:CHANNEL_COLORS[ch] || COLORS[5]}} />
                                            {count}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div style={{flex:1,overflowY:'auto'}}>
                <div style={{display:'grid',gridTemplateColumns:'60px repeat(7, 1fr)',position:'relative'}}>
                    {hours.map(h => (
                        <div key={h} style={{display:'contents'}}>
                            <div style={{padding:'0 8px',fontSize:10,color:'var(--text-tertiary)',textAlign:'right',height:52,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'flex-start',justifyContent:'flex-end',paddingTop:2}}>
                                {h === 12 ? '12 PM' : h > 12 ? (h - 12) + ' PM' : h + ' AM'}
                            </div>
                            {days.map((d, di) => {
                                const dateStr = d.toISOString().slice(0, 10);
                                const key = dateStr + '-' + h;
                                const items = itemsByDayAndHour[key] || [];
                                const today = isToday(d);
                                return (
                                    <div key={di} style={{height:52,borderLeft:'1px solid var(--border)',borderBottom:'1px solid var(--border)',padding:'2px 3px',background:today ? 'color-mix(in srgb, var(--accent) 3%, transparent)' : 'transparent',position:'relative'}}>
                                        {items.map((item, j) => (
                                            <div key={j} onClick={() => onEventClick(item)}
                                                style={{
                                                    padding:'2px 5px',borderRadius:4,marginBottom:2,
                                                    background:item.color + '20',borderLeft:`2px solid ${item.color}`,
                                                    fontSize:10,fontWeight:500,color:'var(--text-primary)',
                                                    overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',
                                                    cursor:'pointer',
                                                }}>
                                                {item.title}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function DayView({ baseDate, events, touchpoints, meetings, onEventClick }) {
    const hours = Array.from({ length: 15 }, (_, i) => i + 7);
    const dateStr = baseDate.toISOString().slice(0, 10);
    const today = isToday(baseDate);

    const { fullItems, tpCounts } = useMemo(() => {
        const full = [];
        const counts = {};
        events.forEach(e => {
            const d = new Date(e.starts_at);
            if (d.toISOString().slice(0, 10) === dateStr) {
                full.push({ ...e, _type: 'event', hour: d.getHours(), minutes: d.getMinutes() });
            }
        });
        meetings.forEach(m => {
            const md = new Date(m.starts_at);
            if (md.toISOString().slice(0, 10) === dateStr) {
                full.push({ id: 'mt-' + m.id, title: m.guest_name || 'Meeting', color: CHANNEL_COLORS.meeting, _type: 'meeting', _guestName: m.guest_name, _guestEmail: m.guest_email, _location: m.location, starts_at: m.starts_at, ends_at: m.ends_at, status: m.status, hour: md.getHours(), minutes: md.getMinutes() });
            }
        });
        touchpoints.forEach(t => {
            const td = new Date(t.date || t.created_at);
            if (td.toISOString().slice(0, 10) === dateStr) {
                const ch = t.channel || 'other';
                counts[ch] = (counts[ch] || 0) + 1;
                full.push({
                    id: 'tp-' + t.id,
                    title: t.prospect?.name ? t.prospect.name + ' — ' + (t.note || ch) : (t.note || ch),
                    color: CHANNEL_COLORS[ch] || COLORS[5],
                    _type: 'touchpoint',
                    _channel: ch,
                    _prospectName: t.prospect?.name || '',
                    _prospectId: t.prospect?.id,
                    note: t.note,
                    outcome: t.outcome,
                    type: t.type,
                    starts_at: t.date || t.created_at,
                    created_at: t.created_at,
                    hour: td.getHours(),
                    minutes: td.getMinutes(),
                });
            }
        });
        return { fullItems: full, tpCounts: counts };
    }, [events, touchpoints, meetings, dateStr]);

    return (
        <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
            <div style={{padding:'12px 0',borderBottom:'1px solid var(--border)',flexShrink:0,textAlign:'center'}}>
                <div style={{fontSize:11,fontWeight:600,color:today ? 'var(--accent)' : 'var(--text-tertiary)',textTransform:'uppercase'}}>{DAY_NAMES_FULL[baseDate.getDay()]}</div>
                <div style={{fontSize:24,fontWeight:600,color:today ? 'var(--accent)' : 'var(--text-primary)',marginTop:2}}>{baseDate.getDate()}</div>
                {Object.keys(tpCounts).length > 0 && (
                    <div style={{display:'flex',gap:6,justifyContent:'center',marginTop:8,flexWrap:'wrap'}}>
                        {Object.entries(tpCounts).map(([ch, count]) => (
                            <span key={ch} style={{
                                display:'inline-flex',alignItems:'center',gap:4,
                                padding:'3px 8px',borderRadius:12,height:20,
                                background:(CHANNEL_COLORS[ch] || COLORS[5]) + '18',
                                fontSize:11,fontWeight:600,color:'var(--text-secondary)',
                            }}>
                                <span style={{width:6,height:6,borderRadius:'50%',background:CHANNEL_COLORS[ch] || COLORS[5]}} />
                                {count} {ch}
                            </span>
                        ))}
                    </div>
                )}
            </div>
            <div style={{flex:1,overflowY:'auto'}}>
                <div style={{display:'grid',gridTemplateColumns:'60px 1fr',position:'relative'}}>
                    {hours.map(h => (
                        <div key={h} style={{display:'contents'}}>
                            <div style={{padding:'0 8px',fontSize:10,color:'var(--text-tertiary)',textAlign:'right',height:60,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'flex-start',justifyContent:'flex-end',paddingTop:2}}>
                                {h === 12 ? '12 PM' : h > 12 ? (h - 12) + ' PM' : h + ' AM'}
                            </div>
                            <div style={{height:60,borderBottom:'1px solid var(--border)',padding:'3px 6px',position:'relative'}}>
                                {fullItems.filter(it => it.hour === h).map((item, j) => (
                                    <div key={j} onClick={() => onEventClick(item)}
                                        style={{
                                            padding:'6px 10px',borderRadius:6,marginBottom:3,
                                            background:item.color + '18',borderLeft:`3px solid ${item.color}`,
                                            fontSize:12,fontWeight:500,color:'var(--text-primary)',
                                            cursor:'pointer',
                                        }}>
                                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                                            <span style={{color:'var(--text-tertiary)',fontSize:10}}>{fmtTime(new Date(item.starts_at || baseDate))}</span>
                                            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.title}</span>
                                        </div>
                                        {item._guestEmail && <div style={{fontSize:10,color:'var(--text-tertiary)',marginTop:1}}>{item._guestEmail}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function CalendarPage() {
    const { prospects, deals, companies, workspace } = useStore();
    const [view, setView] = useState('month');
    const [baseDate, setBaseDate] = useState(new Date());
    const [showModal, setShowModal] = useState(false);
    const [editEvent, setEditEvent] = useState(null);
    const [drawerItem, setDrawerItem] = useState(null);

    const calendarEvents = useStore(s => s.calendarEvents || []);
    const createCalendarEvent = useStore(s => s.createCalendarEvent);
    const updateCalendarEvent = useStore(s => s.updateCalendarEvent);
    const deleteCalendarEvent = useStore(s => s.deleteCalendarEvent);
    const loadCalendarEvents = useStore(s => s.loadCalendarEvents);

    useEffect(() => { loadCalendarEvents(); }, []);

    const touchpoints = useMemo(() => {
        const list = [];
        prospects.forEach(p => {
            (p.touchpoints || []).forEach(t => {
                if (t.date) list.push({ ...t, prospect: { name: p.name, id: p.id } });
            });
        });
        return list;
    }, [prospects]);

    const [meetings, setMeetings] = useState([]);
    useEffect(() => {
        if (!workspace?.id) return;
        supabase.from('meetings').select('id, guest_name, guest_email, starts_at, ends_at, status, location')
            .eq('workspace_id', workspace.id).eq('status', 'scheduled').order('starts_at', { ascending: true })
            .then(({ data }) => setMeetings(data || []));
    }, [workspace?.id]);

    const navigate = (dir) => {
        const d = new Date(baseDate);
        if (view === 'month') d.setMonth(d.getMonth() + dir);
        else if (view === 'week') d.setDate(d.getDate() + dir * 7);
        else d.setDate(d.getDate() + dir);
        setBaseDate(d);
    };

    const goToday = () => setBaseDate(new Date());

    const handleItemClick = (item) => {
        if (item._type === 'event') {
            setEditEvent(item);
            setShowModal(true);
        } else {
            setDrawerItem(item);
        }
    };

    const handleSave = async (data) => {
        if (editEvent) {
            await updateCalendarEvent(editEvent.id, data);
        } else {
            await createCalendarEvent(data);
        }
        setShowModal(false);
        setEditEvent(null);
    };

    const handleDelete = async (id) => {
        await deleteCalendarEvent(id);
    };

    const openProspect = (prospectId) => {
        useStore.getState().setDetailId(prospectId);
        setDrawerItem(null);
    };

    const titleText = useMemo(() => {
        if (view === 'month') return MONTH_NAMES[baseDate.getMonth()] + ' ' + baseDate.getFullYear();
        if (view === 'week') {
            const ws = startOfWeek(baseDate);
            const we = new Date(ws); we.setDate(we.getDate() + 6);
            return fmtDate(ws) + ' — ' + fmtDate(we) + ', ' + we.getFullYear();
        }
        return DAY_NAMES_FULL[baseDate.getDay()] + ', ' + fmtDate(baseDate) + ' ' + baseDate.getFullYear();
    }, [baseDate, view]);

    return (
        <div style={{padding:'24px 32px',display:'flex',flexDirection:'column',height:'calc(100vh - var(--header-h) - 56px)',animation:'fadeSlideUp 0.3s ease-out'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexShrink:0}}>
                <div>
                    <h1 style={{fontSize:22,fontWeight:650,color:'var(--text-primary)',letterSpacing:-0.4,margin:0}}>Calendar</h1>
                    <div style={{fontSize:13,color:'var(--text-tertiary)',marginTop:2}}>
                        {calendarEvents.length} event{calendarEvents.length !== 1 ? 's' : ''} · {meetings.length} meeting{meetings.length !== 1 ? 's' : ''} scheduled
                    </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <button onClick={() => { setEditEvent(null); setShowModal(true); }}
                        style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:8,border:'none',background:'var(--accent)',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        New Event
                    </button>
                </div>
            </div>

            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexShrink:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <button onClick={goToday} style={{padding:'6px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-primary)',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>Today</button>
                    <button onClick={() => navigate(-1)} style={{padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-primary)',cursor:'pointer',fontFamily:'inherit'}}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <button onClick={() => navigate(1)} style={{padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-primary)',cursor:'pointer',fontFamily:'inherit'}}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                    <span style={{fontSize:15,fontWeight:600,color:'var(--text-primary)',marginLeft:8,minWidth:200}}>{titleText}</span>
                </div>
                <div style={{display:'flex',gap:2,padding:3,borderRadius:8,background:'var(--bg-sunken)'}}>
                    {[['month','Month'],['week','Week'],['day','Day']].map(([k, label]) => (
                        <button key={k} onClick={() => setView(k)}
                            style={{padding:'5px 14px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:500,fontFamily:'inherit',
                                background: view === k ? 'var(--bg-surface)' : 'transparent',
                                color: view === k ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                boxShadow: view === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                transition:'all 0.15s'}}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{flex:1,minHeight:0,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',display:'flex',flexDirection:'column'}}>
                {view === 'month' ? (
                    <MonthView year={baseDate.getFullYear()} month={baseDate.getMonth()} events={calendarEvents} touchpoints={touchpoints} meetings={meetings}
                        onSelectDay={(d) => { setBaseDate(d); setView('day'); }}
                        onEventClick={handleItemClick} />
                ) : view === 'week' ? (
                    <WeekView baseDate={baseDate} events={calendarEvents} touchpoints={touchpoints} meetings={meetings}
                        onEventClick={handleItemClick} />
                ) : (
                    <DayView baseDate={baseDate} events={calendarEvents} touchpoints={touchpoints} meetings={meetings}
                        onEventClick={handleItemClick} />
                )}
            </div>

            <div style={{display:'flex',gap:16,marginTop:12,flexShrink:0}}>
                {Object.entries(CHANNEL_COLORS).map(([ch, color]) => (
                    <div key={ch} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'var(--text-tertiary)'}}>
                        <span style={{width:8,height:8,borderRadius:'50%',background:color}} />
                        <span style={{textTransform:'capitalize'}}>{ch}</span>
                    </div>
                ))}
                <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'var(--text-tertiary)'}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:COLORS[0]}} />
                    Events
                </div>
            </div>

            {showModal && (
                <EventModal event={editEvent} onClose={() => { setShowModal(false); setEditEvent(null); }} onSave={handleSave} onDelete={handleDelete} prospects={prospects} />
            )}

            {drawerItem && (
                <DetailDrawer item={drawerItem} onClose={() => setDrawerItem(null)} onOpenProspect={drawerItem._prospectId ? () => openProspect(drawerItem._prospectId) : null} />
            )}
        </div>
    );
}
