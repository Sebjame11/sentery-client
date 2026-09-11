import { useState, useCallback, useEffect, useMemo } from 'react';
import useStore from '../store/useStore';
import { supabase } from '../lib/supabase';
import { formatMoney, daysInStage, esc, linkedinUrl, timeAgo } from '../utils/helpers';
import { PIPELINE_STAGES as DEFAULT_STAGES, STAGE_LABELS as DEFAULT_LABELS, STAGE_WEIGHTS as DEFAULT_WEIGHTS, WIN_REASONS, LOSS_REASONS, getPipelineStages, getStageIds, getStageLabels, getStageWeights, getLeadSources } from '../utils/constants';
import { showToast } from '../components/Toast';
import { openModalFn } from '../components/Modal';
import DealDetailPanel from '../components/DealDetailPanel';
import { parseDealsCSV } from '../utils/csv';

function CreateDealForm({ onClose, companies, members, stages, stageLabels }) {
    const { createDeal, addProspect } = useStore();
    const [form, setForm] = useState({
        name: '',
        companyId: '',
        stage: 'lead',
        dealValue: '',
        priority: 'medium',
        closeDate: '',
        dealType: '',
        ownerId: '',
        ownerName: '',
        primaryContactId: '',
        primaryContactName: '',
        notes: '',
    });
    const [saving, setSaving] = useState(false);

    const selectedCompany = companies.find(c => String(c.id) === String(form.companyId));
    const companyProspects = useStore.getState().prospects.filter(p => p.company === selectedCompany?.name);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) { showToast('Deal name required'); return; }
        setSaving(true);
        try {
            await createDeal({
                name: form.name.trim(),
                companyId: form.companyId || null,
                stage: form.stage,
                dealValue: parseFloat(form.dealValue) || 0,
                priority: form.priority,
                closeDate: form.closeDate || null,
                dealType: form.dealType,
                ownerId: form.ownerId || null,
                ownerName: form.ownerName,
                primaryContactId: form.primaryContactId || null,
                primaryContactName: form.primaryContactName,
                notes: form.notes,
            });
            showToast('Deal created');
            onClose();
        } catch (err) { showToast('Error: ' + err.message); }
        finally { setSaving(false); }
    };

    return (
        <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:24,maxWidth:560,width:'95%',maxHeight:'85vh',overflow:'auto'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                    <h3 style={{margin:0,fontSize:16,fontWeight:600}}>Create Deal</h3>
                    <button className="btn-icon-sm" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                        <div className="field" style={{gridColumn:'1 / -1'}}>
                            <label className="field-label">Deal Name *</label>
                            <input className="field-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Acme Corp - Enterprise Plan" />
                        </div>
                        <div className="field">
                            <label className="field-label">Company</label>
                            <select className="field-input" value={form.companyId} onChange={e => setForm({...form, companyId: e.target.value})}>
                                <option value="">None</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="field">
                            <label className="field-label">Deal Stage</label>
                            <select className="field-input" value={form.stage} onChange={e => setForm({...form, stage: e.target.value})}>
                                {stages.map(s => <option key={s} value={s}>{stageLabels[s] || s}</option>)}
                            </select>
                        </div>
                        <div className="field">
                            <label className="field-label">Amount</label>
                            <input className="field-input" type="number" value={form.dealValue} onChange={e => setForm({...form, dealValue: e.target.value})} placeholder="0" min="0" />
                        </div>
                        <div className="field">
                            <label className="field-label">Close Date</label>
                            <input className="field-input" type="date" value={form.closeDate} onChange={e => setForm({...form, closeDate: e.target.value})} />
                        </div>
                        <div className="field">
                            <label className="field-label">Priority</label>
                            <select className="field-input" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="urgent">Urgent</option>
                            </select>
                        </div>
                        <div className="field">
                            <label className="field-label">Deal Type</label>
                            <select className="field-input" value={form.dealType} onChange={e => setForm({...form, dealType: e.target.value})}>
                                <option value="">None</option>
                                <option value="new">New Business</option>
                                <option value="expansion">Expansion</option>
                                <option value="renewal">Renewal</option>
                                <option value="upsell">Upsell</option>
                            </select>
                        </div>
                        <div className="field">
                            <label className="field-label">Deal Owner</label>
                            <select className="field-input" value={form.ownerId} onChange={e => {
                                const m = members.find(mem => mem.user_id === e.target.value);
                                setForm({...form, ownerId: e.target.value, ownerName: m?.full_name || m?.email || ''});
                            }}>
                                <option value="">No owner</option>
                                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
                            </select>
                        </div>
                        {selectedCompany && companyProspects.length > 0 && (
                            <div className="field" style={{gridColumn:'1 / -1'}}>
                                <label className="field-label">Primary Contact</label>
                                <select className="field-input" value={form.primaryContactId} onChange={e => {
                                    const c = companyProspects.find(ct => String(ct.id) === String(e.target.value));
                                    setForm({...form, primaryContactId: e.target.value, primaryContactName: c?.name || ''});
                                }}>
                                    <option value="">None</option>
                                    {companyProspects.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="field" style={{gridColumn:'1 / -1'}}>
                            <label className="field-label">Notes</label>
                            <textarea className="field-input" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Deal notes..." rows={2} />
                        </div>
                    </div>
                    <div style={{display:'flex',gap:8,marginTop:16}}>
                        <button type="button" className="btn-secondary" style={{flex:1}} onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary" style={{flex:1}} disabled={saving}>{saving ? 'Creating...' : 'Create Deal'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function Pipeline() {
    const { prospects, companies, deals, updateDeal, deleteDeal, updateProspect, deleteProspect, addTouchpoint, setDetailId } = useStore();
    const workspace = useStore(s => s.workspace);
    const hideLeadStage = workspace?.company_profile?.hideLeadStage || false;
    const ALL_PIPELINE_STAGES = useMemo(() => getStageIds(workspace), [workspace]);
    const PIPELINE_STAGES = useMemo(() => {
        if (!hideLeadStage) return ALL_PIPELINE_STAGES;
        return ALL_PIPELINE_STAGES.slice(1);
    }, [ALL_PIPELINE_STAGES, hideLeadStage]);
    const STAGE_LABELS = useMemo(() => getStageLabels(workspace), [workspace]);
    const STAGE_WEIGHTS = useMemo(() => getStageWeights(workspace), [workspace]);

    // Map deals into a prospect-compatible format for the pipeline
    const getCompanyName = useCallback((p) => {
        if (!p.company) return null;
        if (isNaN(p.company)) return p.company;
        const found = companies.find(c => String(c.id) === String(p.company));
        return found ? found.name : null;
    }, [companies]);

    const pipelineItems = useMemo(() => {
        return deals.map(d => {
            const company = companies.find(c => c.id === d.company_id);
            return {
                id: d.id,
                name: d.primary_contact_name || d.name,
                company: company?.name || '',
                title: '',
                email: '',
                phone: '',
                linkedin: '',
                country: '',
                stage: d.stage || 'lead',
                dealValue: d.deal_value || 0,
                priority: d.priority || 'medium',
                owner_name: d.owner_name || '',
                product: d.product || '',
                tier: '',
                tags: [],
                notes: d.notes || '',
                angle: '',
                touchpoints: [],
                stageEnteredAt: d.stage_entered_at || null,
                createdAt: d.created_at || d.createdAt,
                closeDate: d.close_date || null,
                dealType: d.deal_type || '',
                isDeal: true,
            };
        });
    }, [deals, companies]);

    // Detect orphaned stages
    const orphanedStages = useMemo(() => {
        const stageSet = new Set(PIPELINE_STAGES);
        const hiddenStage = hideLeadStage ? ALL_PIPELINE_STAGES[0] : null;
        const orphans = new Set();
        pipelineItems.forEach(p => { if (p.stage && !stageSet.has(p.stage) && p.stage !== hiddenStage) orphans.add(p.stage); });
        return [...orphans];
    }, [pipelineItems, PIPELINE_STAGES, hideLeadStage, ALL_PIPELINE_STAGES]);
    const ALL_STAGES = useMemo(() => [...PIPELINE_STAGES, ...orphanedStages], [PIPELINE_STAGES, orphanedStages]);
    const [expandedId, setExpandedId] = useState(null);
    const [dragId, setDragId] = useState(null);
    const [compact, setCompact] = useState(false);
    const [members, setMembers] = useState([]);
    const [products, setProducts] = useState([]);
    const [openEditor, setOpenEditor] = useState(null); // {prospectId, field, rect}
    const [showCreateDeal, setShowCreateDeal] = useState(false);
    const [search, setSearch] = useState('');
    const [period, setPeriod] = useState('all'); // 'all' | 'month' | 'quarter' | 'year'
    const [migrationMissing, setMigrationMissing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [dealDetailId, setDealDetailId] = useState(null);
    const currentYear = new Date().getFullYear();
    const [filterYear, setFilterYear] = useState(String(currentYear));
    const availableYears = useMemo(() => {
        const years = new Set();
        years.add(String(currentYear));
        pipelineItems.forEach(p => {
            const d = new Date(p.createdAt || p.created_at || 0);
            if (!isNaN(d)) years.add(String(d.getFullYear()));
        });
        return [...years].sort().reverse();
    }, [pipelineItems]);

    const filteredDeals = useMemo(() => {
        const yr = Number(filterYear);
        const base = pipelineItems.filter(p => {
            const d = new Date(p.createdAt || p.created_at || 0);
            return !isNaN(d) && d.getFullYear() === yr;
        });
        const periodFiltered = period === 'all' ? base : (() => {
            const now = new Date();
            let since;
            if (period === 'month') since = new Date(yr, now.getMonth(), 1);
            else if (period === 'quarter') {
                const q = Math.floor(now.getMonth() / 3);
                since = new Date(yr, q * 3, 1);
            } else if (period === 'year') since = new Date(yr, 0, 1);
            return base.filter(p => {
                const created = new Date(p.createdAt || p.created_at || 0);
                return created >= since;
            });
        })();
        if (!search.trim()) return periodFiltered;
        const q = search.toLowerCase();
        const companyMatch = companies.filter(c => c.name.toLowerCase().includes(q)).map(c => c.name.toLowerCase());
        return periodFiltered.filter(p => {
            const companyName = getCompanyName(p);
            const companyNameLower = (companyName || '').toLowerCase();
            return (p.name || '').toLowerCase().includes(q)
                || companyNameLower.includes(q)
                || (p.email || '').toLowerCase().includes(q)
                || (p.title || '').toLowerCase().includes(q)
                || companyMatch.includes(companyNameLower);
        });
    }, [pipelineItems, period, filterYear, search, companies]);

    const periodLabel = period === 'month' ? 'this month' : period === 'quarter' ? 'this quarter' : period === 'year' ? 'this year' : 'all time';

    useEffect(() => {
        if (!workspace?.id) return;
        let cancelled = false;
        (async () => {
            try {
                const { data: mem } = await supabase.rpc('get_workspace_members', { ws_id: workspace.id });
                if (!cancelled) setMembers(mem || []);
            } catch {}
            try {
                const cp = workspace.company_profile || {};
                if (!cancelled) setProducts(Array.isArray(cp.products) ? cp.products : []);
            } catch {}
        })();
        return () => { cancelled = true; };
    }, [workspace?.id, workspace?.company_profile?.products]);

    // Detect whether the owner_id / product columns exist by attempting a
    // column-only select. If the column is missing, Supabase returns an error
    // and we surface a banner telling the user to run the migration.
    useEffect(() => {
        if (!workspace?.id) return;
        let cancelled = false;
        (async () => {
            try {
                const { error } = await supabase.from('prospects').select('owner_id, product').limit(1);
                if (!cancelled && error && /column.*does not exist/i.test(error.message)) {
                    setMigrationMissing(true);
                } else if (!cancelled) {
                    setMigrationMissing(false);
                }
            } catch {}
        })();
        return () => { cancelled = true; };
    }, [workspace?.id]);

    // Close the popover when clicking outside
    useEffect(() => {
        if (!openEditor) return;
        const onDocClick = (e) => {
            if (e.target.closest('.pipeline-card-inline-picker')) return;
            if (e.target.closest('.pipeline-card-field')) return;
            setOpenEditor(null);
        };
        const onEsc = (e) => { if (e.key === 'Escape') setOpenEditor(null); };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onEsc);
        };
    }, [openEditor]);

    const activeDeals = filteredDeals.filter(p => p.stage !== 'won' && p.stage !== 'lost');
    const engagedDeals = activeDeals.filter(p => p.stage !== 'lead' && p.stage !== 'contacted');
    const totalValue = engagedDeals.reduce((a,p) => a + (p.dealValue||0), 0);
    const weightedValue = engagedDeals.reduce((a,p) => a + (p.dealValue||0) * (STAGE_WEIGHTS[p.stage]||0), 0);
    const activeCount = engagedDeals.length;
    const wonValue = filteredDeals.filter(p => p.stage === 'won').reduce((a,p) => a + (p.dealValue||0), 0);
    const lostValue = filteredDeals.filter(p => p.stage === 'lost').reduce((a,p) => a + (p.dealValue||0), 0);
    const wonCount = filteredDeals.filter(p => p.stage === 'won').length;
    const lostCount = filteredDeals.filter(p => p.stage === 'lost').length;
    const closedCount = wonCount + lostCount;
    const winRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0;
    const avgDealSize = activeCount > 0 ? Math.round(engagedDeals.reduce((a,p) => a + (p.dealValue||0), 0) / activeCount) : 0;
    const atRiskDeals = filteredDeals.filter(p => {
        if (p.stage === 'won' || p.stage === 'lost') return false;
        if (p.stage === 'lead' || p.stage === 'contacted') return false;
        return daysInStage(p) >= 14;
    });
    const atRiskCount = atRiskDeals.length;
    const atRiskValue = atRiskDeals.reduce((a,p) => a + (p.dealValue||0), 0);
    const avgDaysActive = activeCount > 0 ? Math.round(engagedDeals.reduce((a,p) => a + daysInStage(p), 0) / activeCount) : 0;

    const getAvgDaysInStage = useCallback((stage) => {
        const inStage = filteredDeals.filter(p => p.stage === stage && p.stageEnteredAt);
        if (!inStage.length) return 0;
        return Math.round(inStage.reduce((a,p) => a + daysInStage(p), 0) / inStage.length);
    }, [filteredDeals]);

    // Avg cycle (lead → won) for closed-won deals — measures sales velocity
    const avgCycleDays = (() => {
        const won = filteredDeals.filter(p => p.stage === 'won');
        const withDates = won.filter(p => p.createdAt && p.stageEnteredAt);
        if (!withDates.length) return 0;
        const total = withDates.reduce((a,p) => {
            const start = new Date(p.createdAt || p.created_at);
            const end = new Date(p.stageEnteredAt);
            const days = Math.max(0, Math.round((end - start) / 86400000));
            return a + days;
        }, 0);
        return Math.round(total / withDates.length);
    })();

    // 30-day forecast: weighted value of late-stage deals (proposal/negotiation) — most likely to close
    const forecast30 = filteredDeals.filter(p => p.stage === 'proposal' || p.stage === 'negotiation').reduce((a,p) => a + (p.dealValue||0) * (STAGE_WEIGHTS[p.stage]||0), 0);

    // Per-stage breakdown for the inline pill row
    const stageBreakdown = PIPELINE_STAGES.map(stage => ({
        stage,
        count: filteredDeals.filter(p => p.stage === stage).length,
        avgDays: getAvgDaysInStage(stage),
        value: filteredDeals.filter(p => p.stage === stage).reduce((a,p) => a + (p.dealValue||0), 0),
    })).filter(s => s.count > 0 || ['meeting','proposal','negotiation'].includes(s.stage));

    // Bottleneck: the active stage with the longest avg days (excluding won/lost)
    const activeStages = stageBreakdown.filter(s => s.stage !== 'won' && s.stage !== 'lost' && s.count > 0);
    const bottleneck = activeStages.length > 0 ? activeStages.reduce((a,b) => b.avgDays > a.avgDays ? b : a) : null;
    const fastestStage = activeStages.length > 0 ? activeStages.reduce((a,b) => b.avgDays < a.avgDays ? b : a) : null;

    const getNextStage = (current) => {
        if (current === 'won' || current === 'lost') return null;
        const idx = PIPELINE_STAGES.indexOf(current);
        return idx < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[idx + 1] : null;
    };

    const moveProspect = (id, newStage) => {
        const p = pipelineItems.find(x => x.id === id);
        if (!p || p.stage === newStage || !newStage) return;
        if (newStage === 'won' || newStage === 'lost') {
            openOutcomeModal(p, newStage);
            return;
        }
        updateDeal(id, { stage: newStage, stageEnteredAt: new Date().toISOString().slice(0,10) });
        setExpandedId(null);
        showToast(p.name + ' moved to ' + STAGE_LABELS[newStage]);
    };

    const handleImportDeals = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';
        setImporting(true);
        try {
            const text = await file.text();
            // Build stage map: label (lowercase) → id from user's pipeline
            const stageMap = {};
            STAGE_LABELS && Object.entries(STAGE_LABELS).forEach(([id, label]) => { stageMap[label.toLowerCase()] = id; });
            // Get unique stages from CSV using proper CSV parser
            const lines = text.replace(/\r/g, '').trim().split('\n');
            if (lines.length < 2) { showToast('CSV is empty'); setImporting(false); return; }
            function splitCSVLine(line) {
                const result = []; let current = ''; let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    if (line[i] === '"') inQuotes = !inQuotes;
                    else if (line[i] === ',' && !inQuotes) { result.push(current); current = ''; }
                    else current += line[i];
                }
                result.push(current);
                return result;
            }
            const rawHeaders = splitCSVLine(lines[0]);
            const stageColIdx = rawHeaders.findIndex(h => h.toLowerCase().replace(/[^a-z]/g, '') === 'dealstage' || h.toLowerCase() === 'deal stage');
            if (stageColIdx === -1) { showToast('No "Deal Stage" column found in CSV'); setImporting(false); return; }
            const csvStages = new Set();
            lines.slice(1).forEach(line => {
                const vals = splitCSVLine(line);
                if (vals.length > stageColIdx) {
                    const stage = vals[stageColIdx].replace(/^"|"$/g, '').trim();
                    if (stage) csvStages.add(stage);
                }
            });
            // Check which stages don't match
            const missing = [];
            csvStages.forEach(s => { if (!stageMap[s.toLowerCase()]) missing.push(s); });
            if (missing.length > 0) {
                const userList = STAGE_LABELS ? Object.values(STAGE_LABELS).join(', ') : 'none';
                showToast('Stage mismatch: ' + missing.join(', ') + ' — Your stages: ' + userList, { duration: 6000 });
                setImporting(false);
                return;
            }
            const deals = parseDealsCSV(text, stageMap);
            if (!deals.length) { showToast('No deals found in CSV'); setImporting(false); return; }
            if (!confirm('Import ' + deals.length + ' deals?')) { setImporting(false); return; }
            const imported = await useStore.getState().importDeals(deals);
            showToast(imported + ' deals imported');
        } catch (err) {
            console.error('Import error:', err);
            showToast('Import error: ' + err.message);
        } finally {
            setImporting(false);
        }
    };

    const openOutcomeModal = (p, newStage) => {
        const isWin = newStage === 'won';
        if (isWin) {
            openModalFn('Won: ' + p.name,
                '<div style="margin-bottom:16px;font-size:0.85rem;color:var(--text-secondary)">Move <strong>' + esc(p.name) + '</strong> to <strong>Won</strong>! Great job.</div>' +
                '<div class="field"><label class="field-label">Close Won Price ($)</label><input class="field-input" type="number" id="dealCloseValue" min="0" value="' + (p.dealValue || '') + '" placeholder="Final deal value" /></div>' +
                '<div class="field"><label class="field-label">Why We Won</label><select class="field-input" id="outcomeReason"><option value="">Select reason...</option>' + WIN_REASONS.map(r => '<option>' + r + '</option>').join('') + '</select></div>' +
                '<div class="field"><label class="field-label">Notes</label><textarea class="field-input" id="outcomeNotes" placeholder="What helped close this deal?"></textarea></div>' +
                '<button class="btn-primary" style="width:100%;margin-top:8px" onclick="document.dispatchEvent(new CustomEvent(\'confirmOutcome\',{detail:{id:' + p.id + ',stage:\'won\'}}))">Confirm Won</button>'
            );
        } else {
            const reasons = LOSS_REASONS;
            openModalFn('Lost: ' + p.name,
                '<div style="margin-bottom:16px;font-size:0.85rem;color:var(--text-secondary)">Move <strong>' + esc(p.name) + '</strong> to <strong>Lost</strong>?</div>' +
                '<div class="field"><label class="field-label">Why We Lost</label><select class="field-input" id="outcomeReason"><option value="">Select reason...</option>' + reasons.map(r => '<option>' + r + '</option>').join('') + '</select></div>' +
                '<div class="field"><label class="field-label">Notes</label><textarea class="field-input" id="outcomeNotes" placeholder="Optional details..."></textarea></div>' +
                '<button class="btn-primary" style="width:100%;margin-top:8px" onclick="document.dispatchEvent(new CustomEvent(\'confirmOutcome\',{detail:{id:' + p.id + ',stage:\'lost\'}}))">Confirm</button>'
            );
        }
    };

    const quickEmail = (id) => {
        const p = pipelineItems.find(x => x.id === id);
        if (!p) return;
        // Open a proper touchpoint modal for deals
        openModalFn('Log Activity: ' + p.name,
            '<div class="field"><label class="field-label">Channel</label><select class="field-input" id="tpChannel"><option>Email</option><option>Phone</option><option>LinkedIn</option><option>Meeting</option><option>SMS</option></select></div>' +
            '<div class="field"><label class="field-label">Note</label><textarea class="field-input" id="tpNote" placeholder="What happened..."></textarea></div>' +
            '<div class="field"><label class="field-label">Outcome</label><select class="field-input" id="tpOutcome"><option value="pending">Pending</option><option value="replied">Replied</option><option value="meeting">Meeting Booked</option><option value="completed">Completed</option><option value="no-reply">No Reply</option></select></div>' +
            '<button class="btn-primary" style="width:100%;margin-top:8px" onclick="document.dispatchEvent(new CustomEvent(\'logDealTouchpoint\',{detail:{dealId:' + p.id + '}}))">Save</button>'
        );
    };

    const viewProspect = (p) => {
        const sc = {lead:'tag-cold',contacted:'tag-cold',engaged:'tag-warm',meeting:'tag-warm',proposal:'tag-warm',negotiation:'tag-hot',won:'tag-won',lost:'tag-cold'};
        openModalFn(p.name + ': ' + p.company,
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">' +
                '<div><div class="field-label">Title</div><div style="font-size:0.85rem">' + esc(p.title) + '</div></div>' +
                '<div><div class="field-label">Tier</div><span class="tag tag-' + p.tier + '">' + p.tier + '</span></div>' +
                '<div><div class="field-label">Email</div><div style="font-size:0.85rem">' + esc(p.email) + '</div></div>' +
                '<div><div class="field-label">Phone</div><div style="font-size:0.85rem">' + esc(p.phone) + '</div></div>' +
                '<div><div class="field-label">LinkedIn</div>' + (p.linkedin ? '<a href="' + esc(linkedinUrl(p.linkedin)) + '" target="_blank" rel="noopener noreferrer" style="font-size:0.85rem;color:var(--accent);text-decoration:none">' + esc(p.linkedin) + '</a>' : '<div style="font-size:0.85rem">-</div>') + '</div>' +
                '<div><div class="field-label">Stage</div><span class="tag ' + (sc[p.stage]||'') + '">' + (STAGE_LABELS[p.stage]||p.stage) + '</span></div>' +
                '<div><div class="field-label">Deal Value</div><div style="font-size:0.85rem;font-weight:500;color:var(--accent)">' + (p.dealValue ? formatMoney(p.dealValue) : '-') + '</div></div>' +
                '<div><div class="field-label">Priority</div><div style="font-size:0.85rem;text-transform:capitalize">' + esc(p.priority || 'medium') + '</div></div>' +
                '<div><div class="field-label">Days in Stage</div><div style="font-size:0.85rem">' + daysInStage(p) + ' days</div></div>' +
            '</div>' +
            '<div class="field-label">Angle</div><div style="font-size:0.85rem;margin-bottom:12px">' + esc(p.angle||'-') + '</div>' +
            '<div class="field-label">Notes</div><div style="font-size:0.85rem;margin-bottom:16px;white-space:pre-wrap">' + esc(p.notes||'-') + '</div>' +
            '<div class="field-label">Touchpoints (' + p.touchpoints.length + ')</div>' +
            '<div style="margin-top:8px">' + (p.touchpoints.length ? p.touchpoints.map(t => '<div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border)"><span class="tag tag-' + (t.outcome==='replied'?'warm':t.outcome==='meeting'?'hot':'cold') + '" style="font-size:0.68rem">' + t.outcome + '</span><div><div style="font-size:0.82rem">' + esc(t.note) + '</div><div style="font-size:0.72rem;color:var(--text-tertiary)">' + t.date + ' · ' + t.channel + '</div></div></div>').join('') : '<div style="font-size:0.82rem;color:var(--text-tertiary)">No touchpoints yet</div>') + '</div>'
        );
    };

    const handleDelete = (id) => {
        const p = pipelineItems.find(x => x.id === id);
        if (!p || !confirm('Delete ' + p.name + '?')) return;
        deleteDeal(id);
        setExpandedId(null);
        showToast(p.name + ' deleted');
    };

    const saveField = async (prospectId, updates, successMsg) => {
        // Optimistic update — change local state immediately so the UI reflects it
        useStore.setState(state => ({
            deals: state.deals.map(d => d.id === prospectId ? { ...d, ...updates } : d),
        }));
        try {
            await updateDeal(prospectId, updates);
            showToast(successMsg);
        } catch (e) {
            const msg = String(e?.message || '');
            if (/column.*does not exist/i.test(msg)) {
                showToast('Columns missing — run pipeline-owner-product.sql in Supabase');
                setMigrationMissing(true);
            } else {
                showToast('Could not save — ' + (msg || 'unknown error'));
            }
            console.error('[pipeline] saveField failed:', e);
        }
    };

    const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; };
    const onDrop = (newStage) => {
        if (!dragId) return;
        moveProspect(dragId, newStage);
        setDragId(null);
    };

    const STAGE_BG = { lead:'var(--bg-sunken)', contacted:'var(--accent-tint)', engaged:'var(--accent-tint)', meeting:'var(--accent-tint)', proposal:'var(--accent-tint)', negotiation:'var(--accent-tint)', won:'var(--success-tint)', lost:'var(--danger-tint)' };
    const STAGE_FG = { lead:'var(--text-tertiary)', contacted:'var(--accent)', engaged:'var(--accent)', meeting:'var(--accent)', proposal:'var(--accent)', negotiation:'var(--accent)', won:'var(--success)', lost:'var(--danger)' };
    const maxVal = Math.max(...pipelineItems.map(x => x.dealValue || 0), 1);

    return (
        <div style={{animation:'fadeSlideUp 0.3s ease-out', display:'flex', flexDirection:'column', height:'calc(100vh - var(--header-h) - 28px)', minHeight:560}}>
            <h1 style={{fontSize:22,fontWeight:650,color:'var(--text-primary)',letterSpacing:-0.4,margin:'0 0 16px',flexShrink:0}}>Pipeline</h1>
            {migrationMissing && (
                <div style={{marginBottom:16,padding:'12px 16px',borderRadius:10,background:'var(--warning-tint)',border:'1px solid var(--warning)',display:'flex',alignItems:'center',gap:12,fontSize:13,color:'var(--text-primary)'}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width="18" height="18" style={{flexShrink:0,color:'var(--warning)'}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <div style={{flex:1}}>
                        <strong style={{fontWeight:600}}>Owner &amp; product fields aren't saving.</strong> Run <code style={{background:'var(--bg-surface)',padding:'1px 6px',borderRadius:4,fontFamily:'monospace',fontSize:12}}>backend/pipeline-owner-product.sql</code> in Supabase SQL Editor to add the missing columns.
                    </div>
                </div>
            )}
            <div className="pipeline-flow">
                {PIPELINE_STAGES.map(s => {
                    const count = filteredDeals.filter(p => p.stage === s).length;
                    const value = filteredDeals.filter(p => p.stage === s).reduce((a,p) => a + (p.dealValue||0), 0);
                    return (
                        <div key={s} className="pipeline-flow-seg" style={{background:STAGE_BG[s]}} onClick={() => {
                            const col = document.getElementById('col-' + s);
                            if (col) col.scrollIntoView({behavior:'smooth',inline:'center'});
                        }}>
                            <div className="pipeline-flow-seg-count" style={{color:STAGE_FG[s]}}>{count}</div>
                            <div className="pipeline-flow-seg-label" style={{color:STAGE_FG[s]}}>{STAGE_LABELS[s]}</div>
                            <div className="pipeline-flow-seg-tooltip">
                                <strong style={{color:STAGE_FG[s]}}>{STAGE_LABELS[s]}</strong>
                                {count} deals &middot; {formatMoney(value)}
                                {s !== 'won' && s !== 'lost' && <><br/><span>Avg {getAvgDaysInStage(s)} days</span></>}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:28,padding:'4px 0 20px',borderBottom:'1px solid var(--border)',marginBottom:14,flexShrink:0}}>
                <div style={{flex:1,display:'flex',gap:36,alignItems:'flex-end',flexWrap:'wrap'}}>
                    {[
                        { label:'Pipeline', value:formatMoney(totalValue), sub: `${activeCount} active deals` },
                        { label:'Weighted', value:formatMoney(weightedValue), sub: `Forecast ${formatMoney(forecast30)} late-stage` },
                        { label:'Won', value:formatMoney(wonValue), sub: `${wonCount} deals · ${winRate}% rate` },
                        { label:'Lost', value:formatMoney(lostValue), sub: `${lostCount} deals`, danger: lostValue > 0 },
                        { label:'Avg Cycle', value:`${avgCycleDays}d`, sub: `lead → won` },
                        { label:'At Risk', value:`${atRiskCount}`, sub: `${formatMoney(atRiskValue)} stuck 14d+`, danger: atRiskCount > 0 },
                        { label:'Avg Deal', value:formatMoney(avgDealSize), sub: `across ${activeCount} active` },
                    ].map((s, i) => (
                        <div key={i} style={{display:'flex',flexDirection:'column',gap:6}}>
                            <div style={{fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}}>{s.label}</div>
                            <div style={{fontSize:24,fontWeight:300,color: s.danger ? 'var(--danger)' : 'var(--text-primary)',lineHeight:1,letterSpacing:'-0.025em'}}>{s.value}</div>
                            <div style={{fontSize:11,color:'var(--text-tertiary)'}}>{s.sub}</div>
                        </div>
                    ))}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                    <div style={{position:'relative'}}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14" style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'var(--text-tertiary)',pointerEvents:'none'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input type="text" placeholder="Search deals..." value={search} onChange={e => setSearch(e.target.value)}
                            style={{fontSize:11,padding:'5px 8px 5px 28px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-primary)',width:160,fontFamily:'inherit',outline:'none'}} />
                        {search && <button onClick={() => setSearch('')} style={{position:'absolute',right:4,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)',fontSize:12,padding:'2px'}}>&times;</button>}
                    </div>
                    <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
                        style={{fontSize:11,fontWeight:500,padding:'5px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-primary)',cursor:'pointer',fontFamily:'inherit',outline:'none'}}>
                        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <div style={{display:'flex',padding:3,borderRadius:8,background:'var(--bg-sunken)'}}>
                        {[
                            { id:'all', label:'All' },
                            { id:'month', label:'Month' },
                            { id:'quarter', label:'Quarter' },
                            { id:'year', label:'Year' },
                        ].map(p => (
                            <button key={p.id} onClick={() => setPeriod(p.id)} style={{
                                padding:'5px 10px',borderRadius:6,border:'none',cursor:'pointer',fontSize:11,fontWeight:500,
                                background: period === p.id ? 'var(--bg-surface)' : 'transparent',
                                color: period === p.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                boxShadow: period === p.id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                transition:'all 0.15s',
                            }}>{p.label}</button>
                        ))}
                    </div>
                    <button className={'pipeline-toolbar-btn' + (compact ? ' active' : '')} onClick={() => setCompact(!compact)}>Compact</button>
                    <button className="pipeline-toolbar-btn" onClick={() => !importing && document.getElementById('importDealsCSV').click()} style={{display:'flex',alignItems:'center',gap:4,opacity:importing?0.5:1}}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        {importing ? 'Importing...' : 'Import Deals'}
                    </button>
                    <input type="file" id="importDealsCSV" accept=".csv" style={{display:'none'}} onChange={handleImportDeals} />
                    <button className="btn-primary" style={{fontSize:11,padding:'5px 12px',display:'flex',alignItems:'center',gap:4}} onClick={() => setShowCreateDeal(true)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Create Deal
                    </button>
                </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:18,flexShrink:0}}>
                <div style={{fontSize:10,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600,marginRight:4}}>Avg days in stage</div>
                {ALL_STAGES.map(stage => {
                    const count = pipelineItems.filter(p => p.stage === stage).length;
                    if (count === 0) return null;
                    const avg = getAvgDaysInStage(stage);
                    const isBottleneck = bottleneck && bottleneck.stage === stage && stage !== 'won' && stage !== 'lost';
                    return (
                        <div key={stage} style={{
                            display:'flex',alignItems:'center',gap:6,
                            padding:'4px 10px',borderRadius:14,
                            background: isBottleneck ? 'var(--danger-tint)' : 'var(--bg-surface)',
                            border: `1px solid ${isBottleneck ? 'var(--danger)' : 'var(--border)'}`,
                            fontSize:11,color:'var(--text-primary)',
                        }}>
                            <span style={{fontWeight:500,color:'var(--text-secondary)'}}>{STAGE_LABELS[stage] || stage}</span>
                            <span style={{fontWeight:650,color: isBottleneck ? 'var(--danger)' : 'var(--text-primary)'}}>{avg}d</span>
                            <span style={{fontSize:10,color:'var(--text-tertiary)'}}>({count})</span>
                        </div>
                    );
                })}
            </div>
            {totalValue > 0 && (
                <div style={{display:'flex',gap:4,alignItems:'center',marginBottom:16}}>
                    <span style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>Pipeline:</span>
                    <div style={{flex:1,height:6,background:'var(--bg-sunken)',borderRadius:3,overflow:'hidden',display:'flex'}}>
                        {PIPELINE_STAGES.filter(s => s !== 'won' && s !== 'lost').map(s => {
                            const v = filteredDeals.filter(p => p.stage === s).reduce((a,p) => a + (p.dealValue||0), 0);
                            const w = totalValue > 0 ? (v / totalValue) * 100 : 0;
                            return w > 0 ? <div key={s} style={{width:w+'%',background:STAGE_FG[s]}} title={STAGE_LABELS[s]+': '+formatMoney(v)}></div> : null;
                        })}
                    </div>
                    <span style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>{formatMoney(totalValue)}</span>
                </div>
            )}
            <div className="pipeline-board">
                {ALL_STAGES.map(s => {
                    const cards = filteredDeals.filter(p => p.stage === s);
                    const colValue = cards.reduce((a,p) => a + (p.dealValue||0), 0);
                    const stageWeight = STAGE_WEIGHTS[s] || 0;
                    const weightedValue = colValue * stageWeight;
                    return (
                        <div key={s} className="pipeline-col" id={'col-' + s}>
                            <div className="pipeline-col-header">
                                <div>
                                    <div className="pipeline-col-title">{STAGE_LABELS[s] || s}</div>
                                    <div className="pipeline-col-total">{formatMoney(colValue)}</div>
                                </div>
                                <button className="pipeline-col-add" title="Add deal to this stage" onClick={(e) => { e.stopPropagation(); setShowCreateDeal(true); }}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                </button>
                            </div>
                            <div className="pipeline-col-cards"
                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.closest('.pipeline-col').classList.add('drag-target'); }}
                                onDragLeave={(e) => e.currentTarget.closest('.pipeline-col').classList.remove('drag-target')}
                                onDrop={(e) => { e.currentTarget.closest('.pipeline-col').classList.remove('drag-target'); onDrop(s); }}>
                                {cards.length === 0 ? <div className="pipeline-empty">Drop here</div> : cards.map(p => {
                                    const d = daysInStage(p);
                                    const isExpanded = expandedId === p.id;
                                    const rawOwner = p.owner_name || '';
                                    const ownerDisplayName = rawOwner.includes('@') ? rawOwner.split('@')[0] : rawOwner;
                                    const ownerInitials = ownerDisplayName ? ownerDisplayName.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase() : '';
                                    const ownerMember = members.find(m => m.user_id === p.owner_id);
                                    const isAtRisk = d >= 14 && s !== 'won' && s !== 'lost';
                                    const editorOpen = openEditor && openEditor.prospectId === p.id;
                                    const stageIdx = PIPELINE_STAGES.indexOf(s);
                                    const totalOpenStages = PIPELINE_STAGES.filter(x => x !== 'won' && x !== 'lost').length || 1;
                                    const progressSegments = 5;
                                    const filledSegments = s === 'won' ? progressSegments : s === 'lost' ? 0 : Math.min(progressSegments, Math.round((stageIdx / (totalOpenStages - 1)) * progressSegments));
                                    const segColor = s === 'won' ? 'green' : s === 'lost' ? 'blue' : stageIdx <= 1 ? 'blue' : stageIdx <= 2 ? 'green' : stageIdx <= 3 ? 'orange' : 'purple';
                                    const touchCount = p.touchpoints ? p.touchpoints.length : 0;
                                    return (
                                        <div key={p.id} className={'pipeline-card' + (isExpanded ? ' selected' : '') + (isAtRisk ? ' at-risk' : '') + (compact ? ' compact' : '')}
                                            draggable onDragStart={(e) => onDragStart(e, p.id)}
                                            onClick={() => { if (!editorOpen) setExpandedId(isExpanded ? null : p.id); }}>
                                            <div className="pipeline-card-inner">
                                                <div className="pipeline-card-toprow">
                                                    <div className="pipeline-card-value-badge">{p.dealValue > 0 ? formatMoney(p.dealValue) : '—'}</div>
                                                    <div className="pipeline-card-metaright">
                                                        <div className="pipeline-card-date">
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                            {p.closeDate ? new Date(p.closeDate).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : 'No date'}
                                                        </div>
                                                        <div className={'pipeline-card-change ' + (stageWeight >= 0.5 ? 'positive' : 'negative')}>
                                                            {stageWeight >= 0.5
                                                                ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7l5 5H7l5-5z"/></svg>
                                                                : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17l-5-5h10l-5 5z"/></svg>}
                                                            {Math.round(stageWeight * 100)}%
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="pipeline-card-name">{getCompanyName(p) || p.name}</div>
                                                {getCompanyName(p) && p.name !== getCompanyName(p) && <div className="pipeline-card-subtitle">{p.name}</div>}
                                                <div className="pipeline-card-progress">
                                                    {Array.from({length: progressSegments}).map((_, i) => (
                                                        <div key={i} className={'pipeline-card-progress-segment' + (i < filledSegments ? ' filled ' + segColor : '')}></div>
                                                    ))}
                                                </div>
                                                <div className="pipeline-card-footer">
                                                    <div className="pipeline-card-counts">
                                                        <span className="pipeline-card-count" title="Touches">
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                                            {touchCount}
                                                        </span>
                                                        <span className="pipeline-card-count" title="Days in stage">
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                                                            {d}d
                                                        </span>
                                                        <button className={'pipeline-card-product' + (p.product ? '' : ' empty')}
                                                            onClick={(e) => { e.stopPropagation(); setOpenEditor(openEditor && openEditor.prospectId === p.id && openEditor.field === 'product' ? null : { prospectId: p.id, field: 'product' }); }}
                                                            title={p.product ? 'Product: ' + p.product + ' (click to change)' : 'Set product'}>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                                                            <span>{p.product || 'Product'}</span>
                                                        </button>
                                                    </div>
                                                    <div className="pipeline-card-avatars">
                                                        {ownerMember || ownerDisplayName ? (
                                                            <button className="pipeline-card-avatar"
                                                                onClick={(e) => { e.stopPropagation(); setOpenEditor(openEditor && openEditor.prospectId === p.id && openEditor.field === 'owner' ? null : { prospectId: p.id, field: 'owner' }); }}
                                                                title={ownerDisplayName ? 'Owner: ' + ownerDisplayName + ' (click to change)' : 'Set owner'}
                                                                style={ownerMember?.avatar_url ? {background:'transparent'} : undefined}>
                                                                {ownerMember?.avatar_url
                                                                    ? <img src={ownerMember.avatar_url} alt="" onError={e => { e.currentTarget.style.display='none'; }} />
                                                                    : (ownerInitials || '+')}
                                                            </button>
                                                        ) : (
                                                            <button className="pipeline-card-avatar ghost"
                                                                onClick={(e) => { e.stopPropagation(); setOpenEditor({ prospectId: p.id, field: 'owner' }); }}
                                                                title="Set owner">
                                                                +
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            {editorOpen && (
                                                <div className="pipeline-card-inline-picker" onClick={e => e.stopPropagation()}>
                                                    {openEditor.field === 'owner' ? (
                                                        members.length === 0 ? (
                                                            <div className="pipeline-card-inline-picker-empty">No workspace members yet</div>
                                                        ) : (
                                                            <div className="pipeline-card-inline-picker-list">
                                                                {members.map(m => (
                                                                    <button key={m.user_id} className={'pipeline-card-inline-picker-item' + (p.owner_id === m.user_id ? ' selected' : '')}
                                                                        onClick={() => { setOpenEditor(null); saveField(p.id, { owner_id: m.user_id, owner_name: m.full_name || m.email }, 'Owner set to ' + (m.full_name || m.email)); }}>
                                                                        <div className="pipeline-card-popover-avatar" style={m.avatar_url ? {background:'transparent',overflow:'hidden'} : undefined}>
                                                                            {m.avatar_url
                                                                                ? <img src={m.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e => { e.currentTarget.style.display='none'; }} />
                                                                                : (m.full_name || m.email || '?').split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase()}
                                                                        </div>
                                                                        <div style={{minWidth:0,flex:1}}>
                                                                            <div className="pipeline-card-inline-picker-name">{m.full_name || m.email}</div>
                                                                            {m.email && m.full_name && <div className="pipeline-card-inline-picker-sub">{m.email}</div>}
                                                                        </div>
                                                                        {p.owner_id === m.user_id && <div className="pipeline-card-inline-picker-check">✓</div>}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )
                                                    ) : (
                                                        products.length === 0 ? (
                                                            <div className="pipeline-card-inline-picker-empty">Configure products in Settings → Company Profile</div>
                                                        ) : (
                                                            <div className="pipeline-card-inline-picker-list">
                                                                {products.map(prod => (
                                                                    <button key={prod} className={'pipeline-card-inline-picker-item' + (p.product === prod ? ' selected' : '')}
                                                                        onClick={() => { setOpenEditor(null); saveField(p.id, { product: prod }, 'Product set to ' + prod); }}>
                                                                        <div className="pipeline-card-popover-bullet"></div>
                                                                        <div className="pipeline-card-inline-picker-name">{prod}</div>
                                                                        {p.product === prod && <div className="pipeline-card-inline-picker-check">✓</div>}
                                                                    </button>
                                                                ))}
                                                                {p.product && <button className="pipeline-card-inline-picker-clear" onClick={() => { setOpenEditor(null); saveField(p.id, { product: null }, 'Product cleared'); }}>Clear product</button>}
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            )}
                                            {isExpanded && (
                                                <div className="pipeline-card-expanded" onClick={e => e.stopPropagation()}>
                                                    <div className="pipeline-card-expanded-grid">
                                                        {p.email && <div className="pipeline-card-expanded-cell"><div className="pipeline-card-expanded-label">Email</div><a href={'mailto:' + p.email} className="pipeline-card-expanded-value link">{p.email}</a></div>}
                                                        {p.phone && <div className="pipeline-card-expanded-cell"><div className="pipeline-card-expanded-label">Phone</div><div className="pipeline-card-expanded-value">{p.phone}</div></div>}
                                                        {p.title && <div className="pipeline-card-expanded-cell"><div className="pipeline-card-expanded-label">Title</div><div className="pipeline-card-expanded-value">{esc(p.title)}</div></div>}
                                                        {p.linkedin && <div className="pipeline-card-expanded-cell"><div className="pipeline-card-expanded-label">LinkedIn</div><a href={linkedinUrl(p.linkedin)} target="_blank" rel="noopener noreferrer" className="pipeline-card-expanded-value link">{esc(p.linkedin)}</a></div>}
                                                        {p.country && <div className="pipeline-card-expanded-cell"><div className="pipeline-card-expanded-label">Country</div><div className="pipeline-card-expanded-value">{esc(p.country)}</div></div>}
                                                        {p.angle && <div className="pipeline-card-expanded-cell pipeline-card-expanded-cell-wide"><div className="pipeline-card-expanded-label">Angle</div><div className="pipeline-card-expanded-value">{esc(p.angle)}</div></div>}
                                                        {p.notes && <div className="pipeline-card-expanded-cell pipeline-card-expanded-cell-wide"><div className="pipeline-card-expanded-label">Notes</div><div className="pipeline-card-expanded-value">{esc(p.notes.length > 180 ? p.notes.substring(0,180) + '…' : p.notes)}</div></div>}
                                                        {p.touchpoints && p.touchpoints.length > 0 && (
                                                            <div className="pipeline-card-expanded-cell pipeline-card-expanded-cell-wide">
                                                                <div className="pipeline-card-expanded-label">Recent touches ({p.touchpoints.length})</div>
                                                                <div className="pipeline-card-expanded-touches">
                                                                    {[...p.touchpoints].sort((a,b) => new Date(b.date||b.created_at) - new Date(a.date||a.created_at)).slice(0,3).map((t,i) => (
                                                                        <div key={i} className="pipeline-card-expanded-touch">
                                                                            <span className={'pipeline-card-expanded-touch-outcome outcome-' + t.outcome}>{t.outcome || 'sent'}</span>
                                                                            <span className="pipeline-card-expanded-touch-note">{esc((t.note || '').substring(0,60))}</span>
                                                                            <span className="pipeline-card-expanded-touch-time">{timeAgo(t.date || t.created_at)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="pipeline-card-expanded-actions">
                                                        {getNextStage(s) && <button className="pipeline-card-expanded-btn primary" onClick={() => moveProspect(p.id, getNextStage(s))}>Advance →</button>}
                                                        <button className="pipeline-card-expanded-btn" onClick={() => quickEmail(p.id)}>Log Activity</button>
                                                        <button className="pipeline-card-expanded-btn" onClick={() => { setDealDetailId({ id: p.id, edit: true }); setExpandedId(null); }}>Edit</button>
                                                        <button className="pipeline-card-expanded-btn" onClick={() => { setDealDetailId({ id: p.id, edit: false }); setExpandedId(null); }}>View Detail</button>
                                                        <button className="pipeline-card-expanded-btn danger" onClick={() => handleDelete(p.id)}>Delete</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Stage Summary Stats */}
                            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 11, color: 'var(--text-secondary)', borderRadius: '0 0 12px 12px', flexShrink: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                    <span>{formatMoney(colValue)} | Total amount</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{formatMoney(weightedValue)} ({Math.round(stageWeight * 100)}%) | Weighted amount</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            {showCreateDeal && (
                <CreateDealForm
                    onClose={() => setShowCreateDeal(false)}
                    companies={useStore.getState().companies}
                    members={members}
                    stages={PIPELINE_STAGES}
                    stageLabels={STAGE_LABELS}
                />
            )}
            {dealDetailId && (
                <DealDetailPanel
                    prospectId={dealDetailId.id || dealDetailId}
                    editMode={dealDetailId.edit || false}
                    onClose={() => setDealDetailId(null)}
                />
            )}
        </div>
    );
}
