import { useState, useRef, useMemo, useEffect } from 'react';
import Fuse from 'fuse.js';
import useStore from '../store/useStore';
import { formatMoney, daysInStage, esc, countryFlag, linkedinUrl } from '../utils/helpers';
import CountrySelect from '../components/CountrySelect';
import { PIPELINE_STAGES, STAGE_LABELS } from '../utils/constants';
import { parseCSV } from '../utils/csv';
import { showToast } from '../components/Toast';
import { openModalFn } from '../components/Modal';
import ExportCSV from '../components/ExportCSV';
import ContactEditModal from '../components/ContactEditModal';
import ComposeEmailModal from '../components/ComposeEmailModal';
import Pagination, { PAGE_SIZE } from '../components/Pagination';

export default function Prospects() {
    const { prospects, updateProspect, deleteProspect, importProspects, addTouchpoint, setDetailId } = useStore();
    const [view, setView] = useState('card');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState('newest');
    const [filter, setFilter] = useState('all');
    const [selected, setSelected] = useState(new Set());
    const [page, setPage] = useState(1);
    const [editId, setEditId] = useState(null);
    const [composeEmail, setComposeEmail] = useState(null);
    const csvRef = useRef(null);

    useEffect(() => { setPage(1); }, [search, filter, sort]);

    const fuse = useMemo(() => {
        const normalized = prospects.map(p => ({
            ...p,
            _tags: Array.isArray(p.tags) ? p.tags.map(t => typeof t === 'object' ? t.name : t).join(' ') : typeof p.tags === 'string' ? (() => { try { return JSON.parse(p.tags).map(t => typeof t === 'object' ? t.name : t).join(' '); } catch { return ''; } })() : '',
        }));
        return new Fuse(normalized, {
            keys: ['name', 'company', 'title', 'email', 'industry', '_tags'],
            threshold: 0.4,
            minMatchCharLength: 1,
        });
    }, [prospects]);

    let filtered = search
        ? fuse.search(search).map(r => r.item)
        : prospects;
    filtered = filtered.filter(p => {
        if (filter !== 'all' && p.tier !== filter) return false;
        return true;
    });
    if (sort === 'newest') filtered.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    else if (sort === 'oldest') filtered.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    else if (sort === 'value') filtered.sort((a,b) => (b.dealValue||0) - (a.dealValue||0));
    else if (sort === 'touchno') filtered.sort((a,b) => b.touchpoints.length - a.touchpoints.length);
    else if (sort === 'name') filtered.sort((a,b) => a.name.localeCompare(b.name));

    const paged = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return filtered.slice(start, start + PAGE_SIZE);
    }, [filtered, page]);

    const toggleSelect = (id, checked) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (checked) next.add(id); else next.delete(id);
            return next;
        });
    };
    const toggleAll = (checked) => {
        if (checked) setSelected(new Set(filtered.map(p => p.id)));
        else setSelected(new Set());
    };

    const bulkAdvance = () => {
        selected.forEach(id => {
            const p = prospects.find(x => x.id === id);
            if (!p) return;
            const idx = PIPELINE_STAGES.indexOf(p.stage);
            if (idx < PIPELINE_STAGES.length - 1) {
                updateProspect(id, { stage: PIPELINE_STAGES[idx+1], stageEnteredAt: new Date().toISOString().slice(0,10) });
            }
        });
        showToast(selected.size + ' prospects advanced');
        setSelected(new Set());
    };

    const bulkDelete = () => {
        if (!confirm('Delete ' + selected.size + ' prospects?')) return;
        selected.forEach(id => deleteProspect(id));
        showToast(selected.size + ' deleted');
        setSelected(new Set());
    };

    const [quickCountries, setQuickCountries] = useState([]);

    const quickAddProspect = () => {
        const nameEl = document.getElementById('quickAddName');
        const companyEl = document.getElementById('quickAddCompany');
        const name = nameEl?.value?.trim();
        if (!name) return;
        useStore.getState().addProspect({ name, company: companyEl?.value?.trim() || name, email: '', stage: 'lead', tier: 'cold', dealValue: 0, title: '', phone: '', linkedin: '', angle: '', notes: '', countries: quickCountries, stageEnteredAt: new Date().toISOString().slice(0,10) });
        showToast(name + ' added');
        nameEl.value = '';
        if (companyEl) companyEl.value = '';
        setQuickCountries([]);
    };

    const handleCSVImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const rows = parseCSV(ev.target.result);
            if (!rows.length) { showToast('No valid rows found'); return; }
            window._pendingCSVImport = rows;
            const preview = rows.slice(0, 8).map(r => '<tr><td style="font-weight:500">' + esc(r.name) + '</td><td>' + esc(r.title||'-') + '</td><td>' + esc(r.company||'-') + '</td><td>' + esc(r.email||'-') + '</td><td>' + esc(r.phone||'-') + '</td><td>' + esc(r.leadSource||'-') + '</td><td>' + esc(r.lifecycleStage||'lead') + '</td></tr>').join('');
            openModalFn('Import Preview (' + rows.length + ' prospects)',
                '<div style="margin-bottom:12px;font-size:0.82rem;color:var(--text-secondary)">Found ' + rows.length + ' prospects from CSV. Preview:</div>' +
                '<div style="overflow-x:auto"><table class="prospects-table" style="margin-bottom:16px;min-width:700px"><thead><tr><th>Name</th><th>Title</th><th>Company</th><th>Email</th><th>Phone</th><th>Lead Source</th><th>Lifecycle</th></tr></thead><tbody>' + preview +
                (rows.length > 8 ? '<tr><td colspan="7" style="text-align:center;color:var(--text-tertiary)">...and ' + (rows.length - 8) + ' more</td></tr>' : '') +
                '</tbody></table></div>' +
                '<button class="btn-primary" style="width:100%" onclick="document.dispatchEvent(new CustomEvent(\'confirmCSV\'))">Import All</button>'
            );
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const quickChangeStage = (id, newStage) => {
        const p = prospects.find(x => x.id === id);
        if (!p || p.stage === newStage) return;
        updateProspect(id, { stage: newStage, stageEnteredAt: new Date().toISOString().slice(0,10) });
        showToast(p.name + ' moved to ' + STAGE_LABELS[newStage]);
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
                '<div><div class="field-label">Days in Stage</div><div style="font-size:0.85rem">' + daysInStage(p) + ' days</div></div>' +
            '</div>' +
            '<div class="field-label">Angle</div><div style="font-size:0.85rem;margin-bottom:12px">' + esc(p.angle||'-') + '</div>' +
            '<div class="field-label">Notes</div><div style="font-size:0.85rem;margin-bottom:16px;white-space:pre-wrap">' + esc(p.notes||'-') + '</div>' +
            '<div class="field-label">Touchpoints (' + p.touchpoints.length + ')</div>' +
            '<div style="margin-top:8px">' + (p.touchpoints.length ? p.touchpoints.map(t => '<div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border)"><span class="tag tag-' + (t.outcome==='replied'?'warm':t.outcome==='meeting'?'hot':'cold') + '" style="font-size:0.68rem">' + t.outcome + '</span><div><div style="font-size:0.82rem">' + esc(t.note) + '</div><div style="font-size:0.72rem;color:var(--text-tertiary)">' + t.date + ' · ' + t.channel + '</div></div></div>').join('') : '<div style="font-size:0.82rem;color:var(--text-tertiary)">No touchpoints yet</div>') + '</div>'
        );
    };

    return (
        <>
        <div style={{animation:'fadeSlideUp 0.3s ease-out'}}>
            <h1 style={{fontSize:22,fontWeight:650,color:'var(--text-primary)',letterSpacing:-0.4,margin:'0 0 16px'}}>Prospects</h1>
            <div className="prospects-toolbar">
                <div className="search-box">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input className="search-input" placeholder="Search name, company, title, tag..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <button className={'filter-btn' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>All</button>
                <button className={'filter-btn' + (filter === 'hot' ? ' active' : '')} onClick={() => setFilter('hot')}>Hot</button>
                <button className={'filter-btn' + (filter === 'warm' ? ' active' : '')} onClick={() => setFilter('warm')}>Warm</button>
                <button className={'filter-btn' + (filter === 'cold' ? ' active' : '')} onClick={() => setFilter('cold')}>Cold</button>
                <div className="prospects-sort">
                    <label>Sort:</label>
                    <select value={sort} onChange={e => setSort(e.target.value)}>
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                        <option value="value">Value</option>
                        <option value="touchno">Most Active</option>
                        <option value="name">Name</option>
                    </select>
                </div>
                <div className="prospects-view-toggle">
                    <button className={'prospects-view-btn' + (view === 'table' ? ' active' : '')} onClick={() => setView('table')}>Table</button>
                    <button className={'prospects-view-btn' + (view === 'card' ? ' active' : '')} onClick={() => setView('card')}>Cards</button>
                </div>
                <ExportCSV />
                <button className="btn-secondary" onClick={() => csvRef.current?.click()}>Import CSV</button>
                <input ref={csvRef} type="file" accept=".csv" style={{display:'none'}} onChange={handleCSVImport} />
            </div>

            {selected.size > 0 && (
                <div className="prospects-bulk-bar active">
                    <span>{selected.size} selected</span>
                    <button className="btn-xs btn-xs-accent" onClick={bulkAdvance}>Advance Stage</button>
                    <button className="btn-xs" style={{color:'var(--danger)'}} onClick={bulkDelete}>Delete</button>
                    <button className="btn-xs" onClick={() => setSelected(new Set())}>Clear</button>
                </div>
            )}

            {view === 'table' ? (
                <>
                    <table className="prospects-table">
                        <thead>
                            <tr>
                                <th style={{width:30}}><input type="checkbox" className="prospect-checkbox" onChange={e => toggleAll(e.target.checked)} checked={selected.size === filtered.length && filtered.length > 0} /></th>
                                <th>Name</th>
                                <th>Title</th>
                                <th>Company</th>
                                <th>Country</th>
                                <th>Tier</th>
                                <th>Stage</th>
                                <th>Value</th>
                                <th>Last Touch</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {paged.map(p => {
                                const lt = p.touchpoints.length ? p.touchpoints[p.touchpoints.length-1] : null;
                                return (
                                    <tr key={p.id} style={selected.has(p.id) ? {background:'var(--accent-tint)'} : undefined}
                                        onMouseEnter={e => { if (!selected.has(p.id)) e.currentTarget.style.background = 'var(--bg-sunken)'; }}
                                        onMouseLeave={e => { if (!selected.has(p.id)) e.currentTarget.style.background = ''; }}>
                                        <td><input type="checkbox" className="prospect-checkbox" checked={selected.has(p.id)} onChange={e => toggleSelect(p.id, e.target.checked)} /></td>
                                        <td><span className="prospect-name" style={{cursor:'pointer'}} onClick={() => setDetailId(p.id)}>{p.name}</span><br/><span style={{fontSize:'0.72rem',color:'var(--text-tertiary)'}}>{p.email}</span></td>
                                        <td>{p.title}</td>
                                        <td className="prospect-company">{p.company}</td>
                                        <td style={{fontSize:'0.78rem'}}>{(p.countries?.length ? p.countries : (p.country ? [p.country] : [])).map(c => countryFlag(c) ? <span key={c} className={countryFlag(c)} style={{marginRight:3,fontSize:13,verticalAlign:-1}} title={c}></span> : null)}</td>
                                        <td><span className={'tag tag-' + p.tier}>{p.tier}</span></td>
                                        <td>
                                            <select className="inline-stage-select" value={p.stage} onChange={e => quickChangeStage(p.id, e.target.value)}>
                                                {PIPELINE_STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                                            </select>
                                        </td>
                                        <td style={{fontSize:'0.82rem',color:'var(--accent)',fontWeight:500}}>
                                            <span style={{cursor:'pointer'}} onClick={e => {
                                                const td = e.currentTarget;
                                                const orig = td.textContent.replace(/[^0-9]/g,'');
                                                td.innerHTML = '<input type="number" min="0" value="'+orig+'" style="width:80px;padding:2px 6px;font-size:12px;font-weight:500;background:var(--bg-surface);color:var(--accent);border:1.5px solid var(--accent);border-radius:4px;outline:none;" autofocus>';
                                                const inp = td.querySelector('input');
                                                inp.focus();
                                                inp.onkeydown = ev => {
                                                    if (ev.key === 'Enter') {
                                                        const n = Number(inp.value);
                                                        if (!isNaN(n) && n >= 0) { updateProspect(p.id, { dealValue: n }); }
                                                        td.textContent = n ? formatMoney(n) : '-';
                                                    }
                                                    if (ev.key === 'Escape') td.textContent = p.dealValue ? formatMoney(p.dealValue) : '-';
                                                };
                                                inp.onblur = () => td.textContent = p.dealValue ? formatMoney(p.dealValue) : '-';
                                            }}>{p.dealValue ? formatMoney(p.dealValue) : '-'}</span>
                                        </td>
                                        <td style={{fontSize:'0.78rem',color:'var(--text-tertiary)'}}>{lt ? lt.date + ' \u00b7 ' + lt.channel : '-'}</td>
                                        <td>
                                            <div className="prospect-actions">
                                                {p.email && <button className="btn-xs" onClick={e => { e.stopPropagation(); setComposeEmail(p); }}>Email</button>}
                                                <button className="btn-xs" onClick={() => setDetailId(p.id)}>View</button>
                                                <button className="btn-xs" onClick={e => { e.stopPropagation(); setEditId(p.id); }}>Edit</button>
                                                <button className="btn-xs" style={{color:'var(--danger)'}} onClick={() => { if(confirm('Delete?')) { deleteProspect(p.id); showToast('Deleted'); } }}>Del</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filtered.length === 0 && <div style={{textAlign:'center',padding:'40px 0'}}><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" style={{width:28,height:28,marginBottom:8,opacity:0.3}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><div style={{color:'var(--text-tertiary)',fontSize:'0.85rem'}}>No prospects found</div></div>}
                    <Pagination total={filtered.length} page={page} onChange={setPage} />
                    <div className="quick-add-row">
                        <input id="quickAddName" placeholder="Quick add: name" onKeyDown={e => e.key === 'Enter' && quickAddProspect()} />
                        <input id="quickAddCompany" placeholder="company" onKeyDown={e => e.key === 'Enter' && quickAddProspect()} />
                        <div style={{minWidth:180}}><CountrySelect value={quickCountries} onChange={setQuickCountries} placeholder="Countries..." /></div>
                        <button className="btn-xs btn-xs-accent" onClick={quickAddProspect}>+ Add</button>
                    </div>
                </>
            ) : (
                <>
                <div className="prospect-card-grid">
                    {paged.map(p => {
                        const lt = p.touchpoints.length ? p.touchpoints[p.touchpoints.length-1] : null;
                        const initials = p.name.split(' ').map(w => w[0]).join('').slice(0, 2);
                        const tierCls = p.tier === 'hot' ? 'hot' : p.tier === 'warm' ? 'warm' : '';
                        return (
                            <div key={p.id} className={'prospect-card' + (selected.has(p.id) ? ' selected' : '')} onClick={() => setDetailId(p.id)}>
                                <div className="prospect-card-top">
                                    <div className={'prospect-card-avatar ' + tierCls}>{initials}</div>
                                    <select className="inline-stage-select" onClick={e => e.stopPropagation()} value={p.stage} onChange={e => { e.stopPropagation(); quickChangeStage(p.id, e.target.value); }}>
                                        {PIPELINE_STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                                    </select>
                                </div>
                                <div className="prospect-card-name">{p.name}</div>
                                <div className="prospect-card-company">{p.company} &middot; {p.title}</div>
                                {(p.countries?.length ? p.countries : (p.country ? [p.country] : [])).length > 0 && (
                                    <div style={{margin:'4px 12px',fontSize:'0.72rem'}}>{(p.countries?.length ? p.countries : (p.country ? [p.country] : [])).map(c => countryFlag(c) ? <span key={c} className={countryFlag(c)} style={{marginRight:3,fontSize:12,verticalAlign:-1}} title={c}></span> : null)}</div>
                                )}
                                <div className="prospect-card-bottom">
                                    <span className="prospect-card-value" style={{cursor:'pointer'}} onClick={e => {
                                        e.stopPropagation();
                                        const el = e.currentTarget;
                                        const orig = p.dealValue || '';
                                        el.innerHTML = '<input type="number" min="0" value="'+orig+'" style="width:70px;padding:1px 4px;font-size:12px;font-weight:600;background:var(--bg-surface);color:var(--accent);border:1.5px solid var(--accent);border-radius:4px;outline:none;" autofocus>';
                                        const inp = el.querySelector('input');
                                        inp.focus();
                                        inp.onkeydown = ev => {
                                            if (ev.key === 'Enter') {
                                                const n = Number(inp.value);
                                                if (!isNaN(n) && n >= 0) updateProspect(p.id, { dealValue: n });
                                                el.textContent = n ? formatMoney(n) : '-';
                                            }
                                            if (ev.key === 'Escape') el.textContent = p.dealValue ? formatMoney(p.dealValue) : '-';
                                        };
                                        inp.onblur = () => el.textContent = p.dealValue ? formatMoney(p.dealValue) : '-';
                                    }}>{p.dealValue ? formatMoney(p.dealValue) : '-'}</span>
                                    <span className={'tag tag-' + p.tier + ' prospect-card-stage'}>{p.tier}</span>
                                </div>
                                {lt && <div className="prospect-card-touch">Last: {lt.date} &middot; {lt.channel}</div>}
                                <div className="prospect-card-actions">
                                    {p.email && <button className="btn-xs" onClick={e => { e.stopPropagation(); setComposeEmail(p); }}>Email</button>}
                                    <button className="btn-xs" onClick={e => { e.stopPropagation(); setDetailId(p.id); }}>View</button>
                                    <button className="btn-xs" onClick={e => { e.stopPropagation(); setEditId(p.id); }}>Edit</button>
                                    <button className="btn-xs" style={{color:'var(--danger)'}} onClick={e => { e.stopPropagation(); if(confirm('Delete?')) { deleteProspect(p.id); showToast('Deleted'); } }}>Del</button>
                                </div>
                            </div>
                        );
                    })}
                    {filtered.length === 0 && <div style={{textAlign:'center',padding:'40px 0',gridColumn:'1/-1'}}><svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" style={{width:28,height:28,marginBottom:8,opacity:0.3}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><div style={{color:'var(--text-tertiary)',fontSize:'0.85rem'}}>No prospects found</div></div>}
                </div>
                <Pagination total={filtered.length} page={page} onChange={setPage} />
                </>
            )}
        </div>
        {editId && (() => {
            const p = prospects.find(x => x.id === editId);
            return p ? <ContactEditModal prospect={p} onClose={() => setEditId(null)} /> : null;
        })()}
        {composeEmail && <ComposeEmailModal contact={composeEmail} onClose={() => setComposeEmail(null)} />}
        </>
    );
}
