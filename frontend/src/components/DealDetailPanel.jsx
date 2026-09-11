import { useState, useMemo, useEffect } from 'react';
import useStore from '../store/useStore';
import { formatMoney, daysInStage, esc, countryFlag, linkedinUrl, timeAgo } from '../utils/helpers';
import { getStageLabels, getStageWeights, getStageIds } from '../utils/constants';
import { showToast } from './Toast';
import { openModalFn } from './Modal';

const PRIORITY_COLORS = { urgent: 'var(--danger)', high: 'var(--warning)', medium: 'var(--accent)', low: 'var(--text-tertiary)' };

const inputStyle = { width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' };
const labelStyle = { fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3, display: 'block' };

export default function DealDetailPanel({ prospectId, onClose, editMode }) {
    const { deals, companies, members, updateDeal, prospects, addProspect, addTouchpoint } = useStore();
    const workspace = useStore(s => s.workspace);
    const d = deals.find(x => x.id === prospectId);
    const [editing, setEditing] = useState(!!editMode);
    const [form, setForm] = useState({});
    const [activeTab, setActiveTab] = useState('overview');
    const [contactPickerOpen, setContactPickerOpen] = useState(false);
    const [contactSearch, setContactSearch] = useState('');

    const STAGE_LABELS = useMemo(() => getStageLabels(workspace), [workspace]);
    const PIPELINE_STAGES = useMemo(() => getStageIds(workspace), [workspace]);

    // Init form when deal loads or editing toggles
    useEffect(() => {
        if (d) {
            setForm({
                name: d.name || '',
                primary_contact_name: d.primary_contact_name || '',
                stage: d.stage || 'lead',
                deal_value: d.deal_value || 0,
                priority: d.priority || 'medium',
                close_date: d.close_date || '',
                deal_type: d.deal_type || '',
                owner_name: d.owner_name || '',
                owner_id: d.owner_id || '',
                notes: d.notes || '',
                associated_call: d.associated_call || '',
                closed_won_reason: d.closed_won_reason || '',
                closed_lost_reason: d.closed_lost_reason || '',
                last_contacted: d.last_contacted || '',

            });
        }
    }, [d?.id, editing]);

    if (!d) return null;

    const p = {
        ...d,
        dealName: d.name,
        name: d.primary_contact_name || d.name,
        company: companies.find(c => c.id === d.company_id)?.name || '',
        dealValue: d.deal_value || 0,
        stage: d.stage || 'lead',
        priority: d.priority || 'medium',
        ownerName: d.owner_name || '',
        closeDate: d.close_date || null,
        dealType: d.deal_type || '',
        notes: d.notes || '',
        tags: [],
        closedLostReason: d.closed_lost_reason || '',
        closedWonReason: d.closed_won_reason || '',
        lastContacted: d.last_contacted || null,
        associatedCall: d.associated_call || '',
    };

    const company = companies.find(c => c.name === p.company);
    const stageIdx = PIPELINE_STAGES.indexOf(p.stage);
    const days = daysInStage(p);
    const initials = (p.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2);

    const relatedContacts = p.company
        ? prospects.filter(x => (x.company || '').toLowerCase() === p.company.toLowerCase() && String(x.id) !== String(d.primary_contact_id)).slice(0, 10)
        : [];

    const contactMatches = (() => {
        const q = contactSearch.trim().toLowerCase();
        let list = q
            ? prospects.filter(x => x.name.toLowerCase().includes(q) || (x.company || '').toLowerCase().includes(q))
            : prospects.filter(x => p.company && (x.company || '').toLowerCase() === p.company.toLowerCase());
        return list.slice(0, 10);
    })();

    const advanceStage = () => {
        const next = PIPELINE_STAGES[stageIdx + 1];
        if (!next || p.stage === 'won' || p.stage === 'lost') return;
        updateDeal(p.id, { stage: next, stage_entered_at: new Date().toISOString().slice(0, 10) });
        showToast(p.name + ' moved to ' + STAGE_LABELS[next]);
    };

    const setField = (field, value) => setForm(f => ({ ...f, [field]: value }));

    const saveAll = async () => {
        const updates = {
            name: form.name || null,
            primaryContactName: form.primary_contact_name || null,
            stage: form.stage,
            dealValue: Number(form.deal_value) || 0,
            priority: form.priority,
            closeDate: form.close_date || null,
            dealType: form.deal_type || null,
            ownerName: form.owner_name || null,
            ownerId: form.owner_id || null,
            notes: form.notes || null,
            associatedCall: form.associated_call || null,
            closedWonReason: form.closed_won_reason || null,
            closedLostReason: form.closed_lost_reason || null,
            lastContacted: form.last_contacted || null,
        };
        try {
            await updateDeal(p.id, updates);
            setEditing(false);
            showToast('Deal updated');
        } catch (e) {
            showToast('Save failed: ' + e.message);
        }
    };

    const STAGE_ROW = (label, field, type = 'text', options = null) => {
        if (!editing) {
            const val = form[field];
            const display = field === 'deal_value' ? formatMoney(val || 0)
                : field === 'priority' ? (val || 'medium').charAt(0).toUpperCase() + (val || 'medium').slice(1)
                : field === 'stage' ? (STAGE_LABELS[val] || val)
                : field === 'last_contacted' ? (val ? timeAgo(val) : 'Never')
                : val || '—';
            const color = field === 'priority' ? PRIORITY_COLORS[val]
                : field === 'stage' ? 'var(--accent)'
                : field === 'deal_value' ? 'var(--text-primary)' : undefined;
            return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0, minWidth: 110 }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: field === 'deal_value' ? 600 : 400, color: color || 'var(--text-primary)', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word', lineHeight: 1.4 }}>{display}</div>
                </div>
            );
        }
        if (options) {
            return (
                <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <label style={labelStyle}>{label}</label>
                    <select value={form[field] || ''} onChange={e => setField(field, e.target.value)} style={{ ...inputStyle, padding: '5px 8px' }}>
                        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
            );
        }
        if (field === 'notes' || field === 'associated_call') {
            return (
                <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <label style={labelStyle}>{label}</label>
                    <textarea value={form[field] || ''} onChange={e => setField(field, e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
            );
        }
        return (
            <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <label style={labelStyle}>{label}</label>
                <input type={type} value={form[field] || ''} onChange={e => setField(field, e.target.value)} style={inputStyle} />
            </div>
        );
    };

    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, maxWidth: '95vw',
            background: 'var(--bg-canvas)', borderLeft: '1px solid var(--border)',
            zIndex: 900, display: 'flex', flexDirection: 'column',
            boxShadow: '-8px 0 30px rgba(0,0,0,0.12)',
        }}>
            {/* Header */}
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                        <div style={{
                            width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                            background: `linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #fff))`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, fontWeight: 700, color: '#fff',
                        }}>{initials}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            {editing ? (
                                <input value={form.name} onChange={e => setField('name', e.target.value)} style={{ ...inputStyle, fontSize: 16, fontWeight: 700, padding: '2px 6px' }} placeholder="Deal name" />
                            ) : (
                                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{esc(p.dealName)}</div>
                            )}
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                                {company && <span style={{ fontWeight: 500 }}>{esc(company.name)}</span>}
                                {p.stage && <><span style={{ color: 'var(--text-tertiary)' }}>·</span><span style={{ color: 'var(--accent)', fontWeight: 500 }}>{STAGE_LABELS[p.stage] || p.stage}</span></>}
                                {p.ownerName && <><span style={{ color: 'var(--text-tertiary)' }}>·</span><span>{esc(p.ownerName)}</span></>}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {editing ? (
                            <>
                                <button onClick={saveAll} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                                <button onClick={() => setEditing(false)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                            </>
                        ) : (
                            <button onClick={() => setEditing(true)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="11" height="11" style={{ verticalAlign: -1, marginRight: 3 }}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                Edit
                            </button>
                        )}
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text-tertiary)', borderRadius: 6 }} title="Close">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>

                {/* Key Info Row */}
                <div style={{ display: 'flex', gap: 20, fontSize: 12, flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Amount</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{formatMoney(p.dealValue || 0)}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Priority</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: PRIORITY_COLORS[p.priority] || 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLORS[p.priority] || 'var(--text-tertiary)' }}></span>
                            {(p.priority || 'medium').charAt(0).toUpperCase() + (p.priority || 'medium').slice(1)}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Days in Stage</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: days >= 14 ? 'var(--danger)' : 'var(--text-primary)' }}>{days}d</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Close Date</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{p.closeDate || '—'}</div>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            {!editing && (
                <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0, overflowX: 'auto' }}>
                    {[
                        { label: 'Note', channel: 'note', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
                        { label: 'Email', channel: 'Email', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                        { label: 'Call', channel: 'Call', icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' },
                    ].map(btn => (
                        <button key={btn.label} onClick={() => {
                            openModalFn(btn.label + ': ' + p.name,
                                '<div class="field"><label class="field-label">Note</label><textarea class="field-input" id="tpNote" placeholder="What happened..."></textarea></div>' +
                                '<div class="field"><label class="field-label">Outcome</label><select class="field-input" id="tpOutcome"><option value="pending">Pending</option><option value="replied">Replied</option><option value="meeting">Meeting Booked</option><option value="completed">Completed</option><option value="no-reply">No Reply</option></select></div>' +
                                '<button class="btn-primary" style="width:100%;margin-top:8px" onclick="document.dispatchEvent(new CustomEvent(\'logDealTouchpoint\',{detail:{dealId:' + p.id + ',channel:\'' + btn.channel + '\'}}))">Save ' + btn.label + '</button>'
                            );
                        }} style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7,
                            border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)',
                            fontSize: 11, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                        }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><path d={btn.icon}/></svg>
                            {btn.label}
                        </button>
                    ))}
                    <div style={{ width: 1, background: 'var(--border)', margin: '2px 2px', flexShrink: 0 }}></div>
                    {p.stage !== 'won' && p.stage !== 'lost' && PIPELINE_STAGES[stageIdx + 1] && (
                        <button onClick={advanceStage} style={{
                            padding: '6px 12px', borderRadius: 7, border: 'none',
                            background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}>Advance →</button>
                    )}
                    <button onClick={() => { updateDeal(p.id, { stage: 'won', stage_entered_at: new Date().toISOString().slice(0, 10) }); showToast('Marked as Won'); }} style={{
                        padding: '6px 10px', borderRadius: 7, border: '1px solid var(--success)',
                        background: 'transparent', color: 'var(--success)', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    }}>Won</button>
                    <button onClick={() => { updateDeal(p.id, { stage: 'lost', stage_entered_at: new Date().toISOString().slice(0, 10) }); showToast('Marked as Lost'); }} style={{
                        padding: '6px 10px', borderRadius: 7, border: '1px solid var(--danger)',
                        background: 'transparent', color: 'var(--danger)', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    }}>Lost</button>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                {[{ key: 'overview', label: editing ? 'Edit Fields' : 'Overview' }, { key: 'activity', label: 'Activity' }, { key: 'contacts', label: 'Contacts' }].map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                        flex: 1, padding: '10px 12px', fontSize: 12, fontWeight: 500, border: 'none',
                        borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                        background: 'transparent', color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-tertiary)',
                        cursor: 'pointer', transition: 'all 0.15s',
                    }}>{tab.label}</button>
                ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                {activeTab === 'overview' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Pipeline Progress */}
                        <div style={{ padding: 14, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pipeline Progress</div>
                            <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                                {PIPELINE_STAGES.map((s, i) => (
                                    <div key={s} style={{ flex: 1, borderRadius: 2, background: i <= stageIdx ? 'var(--accent)' : 'var(--bg-sunken)' }} />
                                ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)' }}>
                                <span>{STAGE_LABELS[PIPELINE_STAGES[0]] || PIPELINE_STAGES[0]}</span>
                                <span>{STAGE_LABELS[PIPELINE_STAGES[PIPELINE_STAGES.length - 1]] || PIPELINE_STAGES[PIPELINE_STAGES.length - 1]}</span>
                            </div>
                        </div>

                        {/* About this deal */}
                        <div style={{ padding: 14, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>{editing ? 'Edit Deal' : 'About this deal'}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {editing ? (
                                    <>
                                        {STAGE_ROW('Deal Name', 'name')}
                                        {STAGE_ROW('Primary Contact', 'primary_contact_name')}
                                        {STAGE_ROW('Stage', 'stage', 'select', PIPELINE_STAGES.map(s => ({ value: s, label: STAGE_LABELS[s] || s })))}
                                        {STAGE_ROW('Amount', 'deal_value', 'number')}
                                        {STAGE_ROW('Priority', 'priority', 'select', [{value:'urgent',label:'Urgent'},{value:'high',label:'High'},{value:'medium',label:'Medium'},{value:'low',label:'Low'}])}
                                        {STAGE_ROW('Close Date', 'close_date', 'date')}
                                        {STAGE_ROW('Deal Type', 'deal_type')}
                                        {STAGE_ROW('Owner', 'owner_name')}
                                        {STAGE_ROW('Last Contacted', 'last_contacted', 'date')}
                                        {STAGE_ROW('Won Reason', 'closed_won_reason')}
                                        {STAGE_ROW('Lost Reason', 'closed_lost_reason')}
                                        {STAGE_ROW('Call Notes', 'associated_call')}
                                        {STAGE_ROW('Notes', 'notes')}
                                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                            <button onClick={saveAll} style={{ flex: 1, padding: '8px 16px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save Changes</button>
                                            <button onClick={() => setEditing(false)} style={{ padding: '8px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {[
                                            { label: 'Owner', value: p.ownerName || 'Unassigned' },
                                            { label: 'Company', value: company?.name || '—' },
                                            { label: 'Primary Contact', value: p.primaryContactName || d.primary_contact_name || '—' },
                                            { label: 'Deal Type', value: p.dealType || '—' },
                                            { label: 'Amount', value: formatMoney(p.dealValue || 0), bold: true },
                                            { label: 'Priority', value: (p.priority || 'medium').charAt(0).toUpperCase() + (p.priority || 'medium').slice(1), color: PRIORITY_COLORS[p.priority] },
                                            { label: 'Close Date', value: p.closeDate || '—' },
                                            { label: 'Deal Stage', value: STAGE_LABELS[p.stage] || p.stage, color: 'var(--accent)' },
                                            { label: 'Days in Stage', value: days + 'd', color: days >= 14 ? 'var(--danger)' : undefined },
                                            { label: 'Last Contacted', value: p.lastContacted ? timeAgo(p.lastContacted) : 'Never' },
                                            { label: 'Won Reason', value: p.closedWonReason || '—' },
                                            { label: 'Lost Reason', value: p.closedLostReason || '—' },
                                            { label: 'Call Notes', value: p.associatedCall || '—', wide: true },
                                        ].map(field => (
                                            <div key={field.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0, minWidth: 110 }}>{field.label}</div>
                                                <div style={{ fontSize: 12, fontWeight: field.bold ? 600 : 400, color: field.color || 'var(--text-primary)', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word', lineHeight: 1.4 }}>{field.value}</div>
                                            </div>
                                        ))}
                                        <button onClick={() => setEditing(true)} style={{ marginTop: 12, padding: '7px 14px', borderRadius: 7, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontSize: 11, fontWeight: 500, cursor: 'pointer', width: '100%' }}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="11" height="11" style={{ verticalAlign: -1, marginRight: 4 }}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                            Edit Deal
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Notes */}
                        {!editing && p.notes && (
                            <div style={{ padding: 14, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Notes</div>
                                <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{esc(p.notes)}</div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'activity' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginTop: 5, flexShrink: 0 }}></div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-primary)' }}><strong>Deal created</strong> {d.created_at ? timeAgo(d.created_at) : ''}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{p.dealName} was added to {STAGE_LABELS[p.stage] || p.stage}</div>
                            </div>
                        </div>
                        {d.stage_entered_at && (
                            <div style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', marginTop: 5, flexShrink: 0 }}></div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-primary)' }}><strong>Moved to {STAGE_LABELS[p.stage] || p.stage}</strong></div>
                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{d.stage_entered_at}</div>
                                </div>
                            </div>
                        )}
                        {(!d.touchpoints || d.touchpoints.length === 0) ? (
                            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>No activities recorded yet</div>
                        ) : (
                            [...d.touchpoints].sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at)).map((t, i) => (
                                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.channel === 'note' ? 'var(--accent)' : t.channel === 'Email' ? '#3b82f6' : t.channel === 'Call' ? '#10b981' : 'var(--text-tertiary)', marginTop: 5, flexShrink: 0 }}></div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase' }}>{t.channel}</span>
                                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{timeAgo(t.date || t.created_at)}</span>
                                        </div>
                                        {t.note && <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>{esc(t.note)}</div>}
                                        {t.outcome && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Outcome: {t.outcome}</div>}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === 'contacts' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Primary Contact</div>
                            {d.primary_contact_id || d.primary_contact_name ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
                                        {(d.primary_contact_name || p.name).split(' ').map(w => w[0]).join('').slice(0, 2)}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{esc(d.primary_contact_name || p.name)}</div>
                                        {d.primary_contact_id && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Linked contact record</div>}
                                        {!d.primary_contact_id && <div style={{ fontSize: 11, color: 'var(--warning)' }}>Name only (not linked)</div>}
                                    </div>
                                    <button onClick={() => setContactPickerOpen(!contactPickerOpen)} style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' }}>Change</button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--text-tertiary)', flexShrink: 0 }}>—</div>
                                    <div>
                                        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No primary contact</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Add one below</div>
                                    </div>
                                    <button onClick={() => setContactPickerOpen(!contactPickerOpen)} style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}>+ Add</button>
                                </div>
                            )}
                            {contactPickerOpen && (
                                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <input placeholder="Search contacts or type a new name..." value={contactSearch} onChange={e => setContactSearch(e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-sunken)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} autoFocus />
                                    {contactMatches.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                                            {contactMatches.map(c => (
                                                <button key={c.id} onClick={() => { updateDeal(p.id, { primary_contact_id: c.id, primary_contact_name: c.name }); setContactPickerOpen(false); setContactSearch(''); showToast('Primary contact set'); }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, border: '1px solid transparent', background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                                                    <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--bg-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>{c.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</div>
                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{esc(c.name)}</div>
                                                        {c.title && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{esc(c.title)}</div>}
                                                    </div>
                                                    {c.company && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>{esc(c.company)}</div>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {contactSearch.trim() && (
                                        <button onClick={async () => {
                                            try {
                                                const newP = await addProspect({ name: contactSearch.trim(), company: p.company || '', title: '', email: '', phone: '', notes: 'Added from deal: ' + p.name });
                                                if (newP) {
                                                    await updateDeal(p.id, { primary_contact_id: newP.id, primary_contact_name: newP.name });
                                                    setContactPickerOpen(false); setContactSearch(''); showToast('Contact created & linked');
                                                }
                                            } catch (e) { showToast('Failed: ' + e.message); }
                                        }}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 6, border: '1px dashed var(--accent)', background: 'transparent', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                                            + Create "{esc(contactSearch.trim())}" and link
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        {relatedContacts.length > 0 && (
                            <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Other Contacts at {esc(p.company)}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {relatedContacts.map(c => {
                                        const ci = c.name.split(' ').map(w => w[0]).join('').slice(0, 2);
                                        return (
                                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--bg-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>{ci}</div>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{esc(c.name)}</div>
                                                    {c.title && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{esc(c.title)}</div>}
                                                </div>
                                                <button onClick={() => { updateDeal(p.id, { primary_contact_id: c.id, primary_contact_name: c.name }); showToast('Primary contact set'); }} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}>Set Primary</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {relatedContacts.length === 0 && (
                            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No other contacts at this company</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
