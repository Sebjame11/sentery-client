// ─── Due Diligence page ───
// Standalone feature: landing (entity select + search) → researching state →
// interactive investigation workspace. Research runs through the due-diligence
// Supabase Edge Function (sentery-research-lead / Agent-Reach) and the result
// drives the same UI states.

import { useState, useEffect, useCallback, useRef } from 'react';
import useStore from '../store/useStore';
import { useAuth } from '../store/AuthContext';
import { showToast } from '../components/Toast';
import DDDetailDrawer from '../components/DDDetailDrawer';
import {
    fetchRecentInvestigations, fetchInvestigation,
    startResearchInvestigation, pollResearchInvestigation,
} from '../dueDiligence/service';
import { RECENT_DEMO } from '../dueDiligence/mockData';
import {
    ENTITY_TYPES, RISK_LABELS, riskColor, riskTint, riskLabel, COVERAGE_AREAS,
} from '../dueDiligence/types';
import { timeAgo } from '../utils/helpers';

const COVERAGE_LABELS = {
    identity: 'Identity', ownership: 'Ownership', management: 'Management', legal: 'Legal',
    regulatory: 'Regulatory', adverse_media: 'Adverse Media', news: 'News', social: 'Social',
    technology: 'Technology', geographic: 'Geographic',
};

const SOCIAL_LABELS = { x_twitter: 'X / Twitter', reddit: 'Reddit', linkedin: 'LinkedIn', github: 'GitHub', youtube: 'YouTube' };

const ORG_RESEARCH_STEPS = [
    'Identifying company', 'Finding official records', 'Researching ownership',
    'Identifying directors', 'Investigating shareholders', 'Searching legal records',
    'Investigating regulatory issues', 'Searching adverse media', 'Researching reputation',
    'Investigating related companies', 'Cross-checking findings', 'Building relationship map',
];
const PERSON_RESEARCH_STEPS = [
    'Verifying identity', 'Checking background', 'Researching career history',
    'Investigating directorships', 'Checking ownership & interests',
    'Searching legal records', 'Checking sanctions & PEP status',
    'Searching adverse media', 'Researching reputation',
    'Investigating connected companies', 'Cross-checking findings', 'Building relationship map',
];
const getResearchSteps = (type) => type === 'individual' ? PERSON_RESEARCH_STEPS : ORG_RESEARCH_STEPS;

export default function DueDiligence() {
    const workspace = useStore(s => s.workspace);
    const { user } = useAuth();

    // ── Landing state ──
    const [entityType, setEntityType] = useState(null);
    const [query, setQuery] = useState('');
    const [recent, setRecent] = useState([]);
    const [recentLoading, setRecentLoading] = useState(true);

    // ── Investigation flow state ──
    const [view, setView] = useState('landing'); // 'landing' | 'researching' | 'result'
    const [researchStep, setResearchStep] = useState(0);
    const [researchingEntityType, setResearchingEntityType] = useState(null); // persisted during researching view
    const [current, setCurrent] = useState(null); // { investigation row, result }

    // ── Drawer state ──
    const [drawerItem, setDrawerItem] = useState(null);

    // ── Ask-about (Phase 1 mock) ──
    const [askInput, setAskInput] = useState('');
    const [askReply, setAskReply] = useState(null);

    const openDrawer = (kind, data) => setDrawerItem({ kind, data });

    // ── Load recent investigations (real data; demo fallback) ──
    useEffect(() => {
        let alive = true;
        (async () => {
            if (!workspace?.id) return;
            try {
                const rows = await fetchRecentInvestigations(workspace.id);
                if (alive) { setRecent(rows); setRecentLoading(false); }
            } catch (e) {
                console.warn('[dd] recent investigations unavailable, using demo data:', e?.message);
                if (alive) { setRecent(RECENT_DEMO); setRecentLoading(false); }
            }
        })();
        return () => { alive = false; };
    }, [workspace?.id]);

    // ── Researching state driver (visual progress; real completion via polling) ──
    useEffect(() => {
        if (view !== 'researching') return;
        const steps = getResearchSteps(researchingEntityType);
        const t = setInterval(() => {
            setResearchStep(s => Math.min(s + 1, steps.length));
        }, 2500);
        return () => clearInterval(t);
    }, [view, researchingEntityType]);

    // ── Real backend polling loop ──
    const pollRef = useRef(null);
    const stopPolling = useCallback(() => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }, []);
    useEffect(() => () => stopPolling(), [stopPolling]);

    const pollUntilDone = useCallback((investigationId) => {
        stopPolling();
        let misses = 0;
        const checkOnce = async () => {
            try {
                const res = await pollResearchInvestigation(investigationId);
                misses = 0;
                if (!res?.done) return; // still researching/processing
                stopPolling();
                if (res.status === 'completed' && res.investigation?.research_result) {
                    const full = res.investigation;
                    setCurrent({ row: full, result: full.research_result, overall: full.overall_risk });
                    setView('result');
                    setRecent(prev => [{
                        id: full.id, entity_type: full.entity_type, entity_name: full.entity_name,
                        status: 'completed', overall_risk: full.overall_risk, created_at: full.created_at,
                    }, ...prev.filter(r => r.id !== full.id)]);
                } else {
                    showToast(res?.error || 'Research failed');
                    setView('landing');
                    setRecent(prev => prev.map(r => r.id === investigationId ? { ...r, status: 'failed' } : r));
                }
            } catch (e) {
                misses += 1;
                console.warn('[dd] poll failed:', e?.message);
                if (misses >= 5) { // tolerate transient errors, give up after 5 consecutive
                    stopPolling();
                    showToast('Lost contact with the research backend');
                    setView('landing');
                }
            }
        };
        pollRef.current = setInterval(checkOnce, 4000);
        setTimeout(checkOnce, 800); // first check almost immediately
    }, [stopPolling]);

    const startResearch = async (entityTypeArg, entityNameArg) => {
        const type = entityTypeArg || entityType;
        const name = (entityNameArg || query).trim();
        if (!type) { showToast('Select an entity type first'); return; }
        if (!name) { showToast('Enter a search term'); return; }
        if (!workspace?.id || !user?.id) { showToast('Sign in to start research'); return; }
        setEntityType(type);
        setQuery(name);
        setView('researching');
        setResearchingEntityType(type);
        setResearchStep(0);
        setAskReply(null);

        try {
            const started = await startResearchInvestigation({
                workspaceId: workspace.id, entityType: type, entityName: name,
            });
            if (started?.status === 'failed') throw new Error(started.error || 'Research failed to start');
            pollUntilDone(started.investigationId);
        } catch (e) {
            console.warn('[dd] start failed:', e?.message);
            showToast(e?.message || 'Could not start research');
            setView('landing');
        }
    };

    const openRecent = async (row) => {
        // In-flight investigation: resume polling where it left off.
        if (['queued', 'researching', 'processing'].includes(row.status)) {
            setEntityType(row.entity_type);
            setQuery(row.entity_name);
            setResearchingEntityType(row.entity_type);
            setView('researching');
            setResearchStep(0);
            pollUntilDone(row.id);
            return;
        }
        try {
            const full = await fetchInvestigation(row.id);
            if (full?.research_result?.entity && Object.keys(full.research_result).length) {
                setCurrent({ row: full, result: full.research_result, overall: full.overall_risk });
                setView('result');
                return;
            }
        } catch (e) { console.warn('[dd] open recent failed:', e?.message); }
        // Failed or no stored result: re-run real research with the saved name/type
        startResearch(row.entity_type, row.entity_name);
    };

    // ── Research Again / full DD from entity click ──
    useEffect(() => {
        const handler = (e) => {
            const { entityType, entityName } = e.detail || {};
            if (!entityType || !entityName) return;
            setDrawerItem(null);
            startResearch(entityType, entityName);
        };
        window.addEventListener('dd-open-full', handler);
        return () => window.removeEventListener('dd-open-full', handler);
    }, [workspace?.id, user?.id]);

    const exportReport = () => {
        if (!current?.result) return;
        try {
            const blob = new Blob([JSON.stringify(current.result, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `due-diligence-${current.result.entity?.name?.replace(/\s+/g, '-').toLowerCase() || 'report'}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Report exported (JSON)');
        } catch (e) { showToast('Export failed'); }
    };

    const askQuestion = () => {
        const q = askInput.trim();
        if (!q) return;
        // Phase 1: canned acknowledge; Phase 2 will route to the research agent.
        setAskReply({ q, a: 'This is a Phase 1 preview — the research engine connection is coming soon. Your question has been noted: "' + q + '"' });
        setAskInput('');
    };

    // ══════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════
    if (view === 'landing') return (
        <div className="dd-page">
            <div className="dd-landing">
                <div className="dd-landing-left">
                    <header className="dd-landing-header">
                        <h1>Due Diligence</h1>
                        <p>Research a company or individual before making an important business decision. Pull ownership, legal, regulatory, and adverse media signals from public sources.</p>
                    </header>

                    <div className="dd-landing-features">
                        <div className="dd-landing-feature">
                            <div className="dd-landing-feature-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"/></svg>
                            </div>
                            <div className="dd-landing-feature-text">
                                <div className="dd-landing-feature-title">Verified public sources</div>
                                <div className="dd-landing-feature-desc">Every finding is sourced — click any claim to see the original record.</div>
                            </div>
                        </div>
                        <div className="dd-landing-feature">
                            <div className="dd-landing-feature-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                            </div>
                            <div className="dd-landing-feature-text">
                                <div className="dd-landing-feature-title">Fast, under a minute</div>
                                <div className="dd-landing-feature-desc">Full investigation typically completes in 30–60 seconds.</div>
                            </div>
                        </div>
                        <div className="dd-landing-feature">
                            <div className="dd-landing-feature-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z"/><path d="M9 12l2 2 4-4"/></svg>
                            </div>
                            <div className="dd-landing-feature-text">
                                <div className="dd-landing-feature-title">No speculation, only facts</div>
                                <div className="dd-landing-feature-desc">Allegations are reported as reported, not treated as confirmed.</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="dd-landing-right">
                    <div className="dd-entity-grid">
                        <button
                            className={'dd-entity-card' + (entityType === ENTITY_TYPES.ORGANIZATION ? ' selected' : '')}
                            onClick={() => setEntityType(ENTITY_TYPES.ORGANIZATION)}>
                            <div className="dd-entity-card-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                            </div>
                            <div className="dd-entity-card-body">
                                <div className="dd-entity-name">Organization</div>
                                <div className="dd-entity-desc">Research a company, fund, target, partner, or other organization.</div>
                            </div>
                        </button>
                        <button
                            className={'dd-entity-card' + (entityType === ENTITY_TYPES.INDIVIDUAL ? ' selected' : '')}
                            onClick={() => setEntityType(ENTITY_TYPES.INDIVIDUAL)}>
                            <div className="dd-entity-card-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            </div>
                            <div className="dd-entity-card-body">
                                <div className="dd-entity-name">Individual</div>
                                <div className="dd-entity-desc">Research a founder, executive, director, shareholder, or other individual.</div>
                            </div>
                        </button>
                    </div>

                    {entityType && (
                        <div className="dd-search-bar">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <input
                                autoFocus
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && startResearch()}
                                placeholder={entityType === ENTITY_TYPES.ORGANIZATION ? 'Search company or organization...' : 'Search person...'}
                            />
                            <button className="btn-primary" onClick={() => startResearch()}>Start Research</button>
                        </div>
                    )}

                    <section className="dd-recent">
                        <div className="dd-recent-header">Recent Investigations</div>
                        {recentLoading ? (
                            <div className="dd-recent-empty">Loading…</div>
                        ) : recent.length === 0 ? (
                            <div className="dd-recent-empty">No investigations yet. Start your first research above.</div>
                        ) : (
                            <div className="dd-recent-list">
                                {recent.map(r => (
                                    <button key={r.id} className="dd-recent-item" onClick={() => openRecent(r)}>
                                        <div className="dd-recent-avatar" data-type={r.entity_type}>
                                            {r.entity_type === 'organization'
                                                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                                                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
                                        </div>
                                        <div className="dd-recent-info">
                                            <div className="dd-recent-name">{r.entity_name}</div>
                                            <div className="dd-recent-meta">
                                                {r.entity_type === 'organization' ? 'Organization' : 'Individual'}
                                                {r.overall_risk && <> · <span style={{ color: riskColor(r.overall_risk) }}>{riskLabel(r.overall_risk)} Risk</span></>}
                                                {' · ' + timeAgo(r.created_at)}
                                            </div>
                                        </div>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14" className="dd-recent-arrow"><polyline points="9 18 15 12 9 6"/></svg>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );

    if (view === 'researching') {
        const steps = getResearchSteps(researchingEntityType);
        const isPersonResearch = researchingEntityType === 'individual';
        return (
            <div className="dd-page dd-researching">
                <div className="dd-research-card">
                    <div className="dd-research-icon">{isPersonResearch ? '👤' : '🏢'}</div>
                    <div className="dd-research-title">
                        {isPersonResearch ? 'Researching' : 'Researching'} {query}…
                    </div>
                    <div className="dd-research-sub">
                        {isPersonResearch
                            ? 'Investigating background, career, directorships, legal records, sanctions, connected entities, and reputation…'
                            : 'Investigating ownership, directors, legal records, regulatory status, connected companies, and reputation…'}
                    </div>
                    <div className="dd-research-list">
                        {steps.map((step, i) => (
                            <div key={step} className={'dd-research-step ' + (i < researchStep ? 'done' : i === researchStep ? 'active' : '')}>
                                <span className="dd-research-marker">
                                    {i < researchStep ? '✓' : i === researchStep ? '●' : '○'}
                                </span>
                                {step}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ── Result workspace ──
    const result = current?.result;
    if (!result) return null;
    const ent = result.entity;
    const isOrg = ent.type === ENTITY_TYPES.ORGANIZATION;
    const findingCount = (result.findings || []).length;
    const sourceCount = (result.sources || []).length;
    // Ownership, control AND structure/network relationships — a PARENT_OF or
    // INVESTOR_IN row is as material to ownership analysis as a percentage.
    const ownershipRels = (result.relationships || []).filter(r => r.type);
    // Parse funding amounts that arrive as strings ("$75,000,000,000", "$1.2B",
    // "All-stock (…)") — workers don't always emit numeric amounts.
    const parseAmount = (a) => {
        if (a == null) return null;
        if (typeof a === 'number' && !isNaN(a)) return a;
        const s = String(a).replace(/[$,\s]/g, '').toUpperCase();
        const m = s.match(/^([\d.]+)([KMBT])?/);
        if (!m) return null;
        const n = parseFloat(m[1]);
        if (isNaN(n)) return null;
        const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2]] ?? 1;
        return n * mult;
    };
    const fundingRows = (result.funding || []).map(fr => {
        const amount = parseAmount(fr.amount);
        const investors = fr.investors || fr.leadInvestors || [];
        const date = fr.date || (fr.year ? String(fr.year) : '');
        const preMoney = parseAmount(fr.preMoneyValuation);
        return { ...fr, _amount: amount, _investors: investors, _date: date, _preMoney: preMoney };
    });
    const parsedTotal = fundingRows.reduce((sum, fr) => sum + (fr._amount || 0), 0);
    const hasFunding = isOrg && fundingRows.length > 0;
    const socialByPlatform = Object.fromEntries((result.social || []).map(s => [s.platform, s]));
    const suggestedQuestions = [
        'What are the biggest concerns?',
        isOrg ? 'Why is ownership risk elevated?' : 'What companies is this person connected to?',
        isOrg ? 'Who ultimately owns this company?' : 'Investigate the CEO further.',
        'Show me negative developments from the last 12 months.',
    ];

    const relTypeName = (t) => ({
        OWNS: 'Owns', BENEFICIAL_OWNER_OF: 'Beneficial owner of', SHAREHOLDER_OF: 'Shareholder of',
        CONTROLS: 'Controls', DIRECTOR_OF: 'Director of', FOUNDER_OF: 'Founder of', CEO_OF: 'CEO of',
        INVESTOR_IN: 'Investor in', PARENT_OF: 'Parent of', SUBSIDIARY_OF: 'Subsidiary of',
        RELATED_TO: 'Related to', FORMER_DIRECTOR_OF: 'Former director of',
    }[t] || t);

    const riskCatLabel = (cat) => ({
        governance: 'Governance', regulatory: 'Regulatory', legal: 'Legal',
        financial: 'Financial', operational: 'Operational', reputational: 'Reputational',
        compliance: 'Compliance', integrity: 'Integrity', control: 'Control',
        conflict_of_interest: 'Conflict of Interest', concentration_risk: 'Concentration Risk',
        regulatory_exposure: 'Regulatory Exposure', identity: 'Identity',
        ownership: 'Ownership', technology: 'Technology', cybersecurity: 'Cybersecurity',
        environmental: 'Environmental', sanctions: 'Sanctions', anti_bribery: 'Anti-Bribery',
        data_privacy: 'Data Privacy', market: 'Market', liquidity: 'Liquidity',
        credit: 'Credit', counterparty: 'Counterparty', geopolitical: 'Geopolitical',
    }[cat] || cat?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Other');

    return (
        <div className="dd-page dd-result">
            {/* ── Result header ── */}
            <header className="dd-result-header">
                <div className="dd-result-header-main">
                    <button className="dd-back" onClick={() => setView('landing')} title="Back">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
                        Due Diligence
                    </button>
                    <div className="dd-result-identity">
                        <h1>{ent.name}</h1>
                            <div className="dd-result-type">
                            {isOrg ? 'Organization' : 'Individual'}
                            {result.tagline ? ' · ' + result.tagline : ''}
                        </div>
                    </div>
                </div>
                <div className="dd-result-header-side">
                    <div className="dd-overall-risk">
                        <div className="dd-overall-risk-label">Overall Risk</div>
                        <div className="dd-overall-risk-value" style={{ color: riskColor(current?.overall) }}>
                            {riskLabel(current?.overall)}
                        </div>
                    </div>
                    <div className="dd-result-actions">
                        <button className="btn-secondary" onClick={() => startResearch()}>Research Again</button>
                        <button className="btn-secondary" onClick={exportReport}>Export Report</button>
                    </div>
                </div>
            </header>

            {/* ── Result meta strip ── */}
            <div className="dd-meta-strip">
                <span><strong>{findingCount}</strong> findings identified</span>
                <span className="dd-meta-sep" />
                <span><strong>{sourceCount}</strong> sources analyzed</span>
                <span className="dd-meta-sep" />
                <span>Last researched <strong>{timeAgo(new Date().toISOString())}</strong></span>
            </div>

            {/* ════════════════════════════════════════════════════════════
                INDIVIDUAL LAYOUT — profile-driven, insight-first
               ════════════════════════════════════════════════════════════ */}
            {!isOrg && (
                <div className="dd-columns">
                    <div className="dd-main">
                        {/* ── Person profile hero ── */}
                        <section className="dd-card dd-person-hero">
                            <div className="dd-person-hero-top">
                                <div className="dd-person-hero-avatar">
                                    {ent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                                <div className="dd-person-hero-info">
                                    <h2>{ent.name}</h2>
                                    {ent.subtitle && <div className="dd-person-hero-subtitle">{ent.subtitle}</div>}
                                    <div className="dd-person-hero-meta">
                                        {ent.country && <span>{ent.country}</span>}
                                        {result.tagline && <span>· {result.tagline}</span>}
                                    </div>
                                </div>
                                <div className="dd-person-hero-risk">
                                    <div className="dd-risk-chip-lg" style={{ background: riskTint(current?.overall), color: riskColor(current?.overall) }}>
                                        {riskLabel(current?.overall)} Risk
                                    </div>
                                </div>
                            </div>
                            {/* Key roles quick-strip */}
                            {(result.organizations || []).length > 0 && (
                                <div className="dd-person-roles">
                                    {(result.organizations || []).slice(0, 6).map(o => (
                                        <button key={o.id} className="dd-person-role-chip" onClick={() => openDrawer('organization', o)}>
                                            <span className="dd-person-role-name">{o.name}</span>
                                            {o.subtitle && <span className="dd-person-role-sub">{o.subtitle}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* ── Executive Summary ── */}
                        <section className="dd-card">
                            <div className="dd-card-label">Executive Summary</div>
                            <p className="dd-summary">{result.summary}</p>
                            {/* Key stat grid — numbers that matter */}
                            <div className="dd-summary-stats">
                                {current?.overall && (
                                    <div className="dd-stat-chip" style={{ borderColor: riskColor(current.overall) }}>
                                        <span className="dd-stat-val" style={{ color: riskColor(current.overall) }}>{riskLabel(current.overall)}</span>
                                        <span className="dd-stat-label">Overall risk</span>
                                    </div>
                                )}
                                {findingCount > 0 && (
                                    <div className="dd-stat-chip">
                                        <span className="dd-stat-val">{findingCount}</span>
                                        <span className="dd-stat-label">Findings</span>
                                    </div>
                                )}
                                {sourceCount > 0 && (
                                    <div className="dd-stat-chip">
                                        <span className="dd-stat-val">{sourceCount}</span>
                                        <span className="dd-stat-label">Sources</span>
                                    </div>
                                )}
                                {(result.organizations || []).length > 0 && (
                                    <div className="dd-stat-chip">
                                        <span className="dd-stat-val">{(result.organizations || []).length}</span>
                                        <span className="dd-stat-label">Connected entities</span>
                                    </div>
                                )}
                                {ownershipRels.filter(r => r.ownershipPct != null).length > 0 && (
                                    <div className="dd-stat-chip">
                                        <span className="dd-stat-val">
                                            {ownershipRels.filter(r => r.ownershipPct != null).map(r => r.ownershipPct + '%').join(', ')}
                                        </span>
                                        <span className="dd-stat-label">Ownership stakes</span>
                                    </div>
                                )}
                                {(result.risks || []).length > 0 && (
                                    <div className="dd-stat-chip">
                                        <span className="dd-stat-val">{(result.risks || []).filter(r => r.level === 'high' || r.level === 'elevated').length}</span>
                                        <span className="dd-stat-label">Elevated+ risks</span>
                                    </div>
                                )}
                            </div>
                            {/* Concerns and positives — clean labeled blocks */}
                            {((result.concerns?.length || 0) > 0 || (result.positiveSignals?.length || 0) > 0) && (
                                <div className="dd-signals">
                                    {(result.concerns?.length || 0) > 0 && (
                                        <div className="dd-signal-col">
                                            <div className="dd-signal-head">Key concerns</div>
                                            {result.concerns.map((s, i) => <div key={i} className="dd-signal-item concern">{s}</div>)}
                                        </div>
                                    )}
                                    {(result.positiveSignals?.length || 0) > 0 && (
                                        <div className="dd-signal-col positive">
                                            <div className="dd-signal-head">Positive signals</div>
                                            {result.positiveSignals.map((s, i) => <div key={i} className="dd-signal-item positive">{s}</div>)}
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* ── Risk Assessment — DETAILED ── */}
                        {(result.risks || []).length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">Risk Assessment</div>
                                {/* Overall risk bar */}
                                <div className="dd-risk-bar">
                                    <div className="dd-risk-bar-track">
                                        <div className="dd-risk-bar-fill" style={{
                                            width: (() => {
                                                const levels = { low: 25, medium: 50, elevated: 75, high: 100 };
                                                const max = Math.max(...(result.risks || []).map(r => levels[r.level] || 0));
                                                return max + '%';
                                            })(),
                                            background: riskColor(current?.overall),
                                        }} />
                                    </div>
                                    <span className="dd-risk-bar-label" style={{ color: riskColor(current?.overall) }}>{riskLabel(current?.overall)}</span>
                                </div>
                                {/* Individual risk cards — expanded */}
                                <div className="dd-risks-detail">
                                    {result.risks.map(r => {
                                        const relatedFindings = (result.findings || []).filter(f => (r.findingIds || []).includes(f.id));
                                        const riskEntities = (result.organizations || []).filter(o =>
                                            relatedFindings.some(f => (f.claim || '').toLowerCase().includes(o.name.toLowerCase()) || (f.detail || '').toLowerCase().includes(o.name.toLowerCase()))
                                        );
                                        const riskPeople = (result.people || []).filter(p =>
                                            relatedFindings.some(f => (f.claim || '').toLowerCase().includes(p.name.toLowerCase()) || (f.detail || '').toLowerCase().includes(p.name.toLowerCase()))
                                        );
                                        const affectedNames = [...riskEntities.map(e => e.name), ...riskPeople.map(p => p.name)].slice(0, 4);
                                        const what = r.explanation || r.whyItMatters;
                                        return (
                                            <button key={r.id} className="dd-risk-detail" onClick={() => openDrawer('risk', r)}>
                                                <div className="dd-risk-detail-head">
                                                    <span className="dd-risk-detail-cat">{riskCatLabel(r.category)}</span>
                                                    <span className="dd-risk-detail-level" style={{ color: riskColor(r.level) }}>{riskLabel(r.level)}</span>
                                                </div>
                                                {what && <div className="dd-risk-detail-explain">{what}</div>}
                                                {r.whyItMatters && r.whyItMatters !== what && <div className="dd-risk-detail-why">Why: {r.whyItMatters}</div>}
                                                {affectedNames.length > 0 && (
                                                    <div className="dd-risk-detail-affects">
                                                        <span className="dd-risk-affects-label">Affects:</span> {affectedNames.join(', ')}
                                                    </div>
                                                )}
                                                {relatedFindings.length > 0 && (
                                                    <div className="dd-risk-detail-findings">
                                                        {relatedFindings.slice(0, 3).map(f => (
                                                            <span key={f.id} className="dd-risk-finding-pill" style={{ background: riskTint(f.severity), color: riskColor(f.severity) }}>
                                                                {f.claim.length > 60 ? f.claim.slice(0, 57) + '...' : f.claim}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {r.limitations && <div className="dd-risk-detail-limits">{r.limitations}</div>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* ── Compliance Screening (Sanctions / PEP / AML) ── */}
                        {(() => {
                            const comp = (result.findings || []).filter(f => ['Sanctions','PEP','AML'].includes(f.category));
                            if (comp.length === 0) return null;
                            const isHit = (sev) => sev === 'high' || sev === 'elevated';
                            return (
                                <section className="dd-card dd-compliance">
                                    <div className="dd-card-label">Compliance Screening</div>
                                    <div className="dd-compliance-list">
                                        {['Sanctions','PEP','AML'].map(cat => {
                                            const f = comp.find(x => x.category === cat);
                                            if (!f) {
                                                return (
                                                    <div key={cat} className="dd-compliance-row">
                                                        <div className="dd-compliance-cat">{cat} screening</div>
                                                        <div className="dd-compliance-status not-checked">Not checked</div>
                                                    </div>
                                                );
                                            }
                                            return (
                                                <button key={cat} className={'dd-compliance-row ' + (isHit(f.severity) ? 'hit' : 'clean')} onClick={() => openDrawer('finding', f)}>
                                                    <div className="dd-compliance-cat">{cat} screening</div>
                                                    <div className={'dd-compliance-status ' + (isHit(f.severity) ? 'hit' : 'clean')}>
                                                        {isHit(f.severity) ? 'HIT' : 'NO HIT'}
                                                    </div>
                                                    <div className="dd-compliance-detail">{f.claim}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })()}

                        {/* ── Career & Roles (individual only) ── */}
                        {(result.organizations || []).length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">Career & Roles</div>
                                <div className="dd-career">
                                    {result.organizations.map(o => {
                                        const rels = (result.relationships || []).filter(r => r.bId === o.id || r.aId === o.id);
                                        const roleRels = rels.filter(r => ['CEO_OF','FOUNDER_OF','DIRECTOR_OF','CONTROLS','OWNS','BENEFICIAL_OWNER_OF','SHAREHOLDER_OF','INVESTOR_IN','FORMER_DIRECTOR_OF'].includes(r.type));
                                        const primaryRole = roleRels[0];
                                        const roleLabel = primaryRole ? relTypeName(primaryRole.type) : '';
                                        const pct = roleRels.find(r => r.ownershipPct != null)?.ownershipPct;
                                        return (
                                            <button key={o.id} className="dd-career-item" onClick={() => openDrawer('organization', o)}>
                                                <div className="dd-career-icon">{o.type === 'subsidiary' ? 'SUB' : o.type === 'investor' ? 'INV' : 'ORG'}</div>
                                                <div className="dd-career-body">
                                                    <div className="dd-career-name">{o.name}</div>
                                                    <div className="dd-career-role">
                                                        {o.subtitle || roleLabel}
                                                        {pct != null && <span className="dd-career-pct"> · {pct}%</span>}
                                                    </div>
                                                </div>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14" className="dd-recent-arrow"><polyline points="9 18 15 12 9 6"/></svg>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* ── Ownership & Corporate Network ── */}
                        {ownershipRels.length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">Ownership & Corporate Network</div>
                                {isOrg ? (
                                    <div className="dd-ownership">
                                        {ownershipRels.map(r => {
                                            const a = (result.people || []).find(p => p.id === r.aId) || (result.organizations || []).find(o => o.id === r.aId);
                                            const b = (result.organizations || []).find(o => o.id === r.bId) || (result.people || []).find(p => p.id === r.bId);
                                            return (
                                                <button key={r.id} className="dd-own-row" onClick={() => openDrawer('relationship', { ...r, _a: a, _b: b })}>
                                                    <span className="dd-own-party" onClick={e => { if (a) { e.stopPropagation(); openDrawer(a.type === 'individual' ? 'person' : 'organization', a); } }}>
                                                        {a?.name || 'Unknown'}
                                                    </span>
                                                    <span className="dd-own-mid">
                                                        <span className="dd-own-type">{relTypeName(r.type)}</span>
                                                        {r.ownershipPct != null && <span className="dd-own-pct">{r.ownershipPct}%</span>}
                                                        {r.verification && r.verification !== 'verified' && <span className="dd-own-flag">{r.verification === 'inferred' ? 'inferred' : 'reported'}</span>}
                                                    </span>
                                                    <span className="dd-own-party" onClick={e => { if (b) { e.stopPropagation(); openDrawer(b.type === 'individual' ? 'person' : 'organization', b); } }}>
                                                        {b?.name || ent.name}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    /* Individual: grouped by entity, clean table */
                                    <div className="dd-own-table">
                                        {(() => {
                                            const orgRels = new Map();
                                            for (const r of ownershipRels) {
                                                const isSubjectA = r.aId === 'ent-self' || (result.people || []).some(p => p.id === r.aId && p.name === ent.name);
                                                const otherId = isSubjectA ? r.bId : r.aId;
                                                const other = (result.organizations || []).find(o => o.id === otherId) || (result.people || []).find(p => p.id === otherId);
                                                if (!other) continue;
                                                if (!orgRels.has(otherId)) orgRels.set(otherId, { entity: other, rels: [] });
                                                orgRels.get(otherId).rels.push(r);
                                            }
                                            return Array.from(orgRels.values()).map(({ entity: org, rels }) => {
                                                // Dedupe by relationship type — keep the first one with an ownership % if any.
                                                // Priority for the "primary" type: SHAREHOLDER_OF/OWNS > CEO_OF/FOUNDER_OF > DIRECTOR_OF > others.
                                                const byType = new Map();
                                                const order = ['SHAREHOLDER_OF','OWNS','BENEFICIAL_OWNER_OF','FOUNDER_OF','CEO_OF','CONTROLS','INVESTOR_IN','DIRECTOR_OF','FORMER_DIRECTOR_OF','PARENT_OF','SUBSIDIARY_OF','RELATED_TO'];
                                                const sorted = [...rels].sort((a, b) => {
                                                    const oa = order.indexOf(a.type); const ob = order.indexOf(b.type);
                                                    return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob);
                                                });
                                                for (const r of sorted) {
                                                    if (!byType.has(r.type)) byType.set(r.type, r);
                                                }
                                                const deduped = Array.from(byType.values());
                                                const roles = deduped.map(r => relTypeName(r.type));
                                                const pcts = deduped.filter(r => r.ownershipPct != null).map(r => r.ownershipPct);
                                                const verification = deduped.find(r => r.verification && r.verification !== 'verified')?.verification;
                                                return (
                                                    <button key={org.id} className="dd-own-table-row" onClick={() => openDrawer(org.type === 'individual' ? 'person' : 'organization', org)}>
                                                        <div className="dd-own-table-left">
                                                            <span className="dd-own-table-name">{org.name}</span>
                                                            {org.subtitle && <span className="dd-own-table-sub">{org.subtitle}</span>}
                                                        </div>
                                                        <div className="dd-own-table-mid">
                                                            {roles.map((role, i) => (
                                                                <span key={i} className="dd-own-table-role">{role}</span>
                                                            ))}
                                                        </div>
                                                        <div className="dd-own-table-right">
                                                            {pcts.length > 0 && <span className="dd-own-table-pct">{pcts.join(' / ')}%</span>}
                                                            {verification && <span className="dd-own-table-flag">{verification === 'inferred' ? 'Inferred' : 'Reported'}</span>}
                                                        </div>
                                                    </button>
                                                );
                                            });
                                        })()}
                                    </div>
                                )}
                            </section>
                        )}

                        {/* ── Key Findings ── */}
                        {(result.findings || []).length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">Key Findings ({findingCount})</div>
                                <div className="dd-findings">
                                    {result.findings.map(f => (
                                        <button key={f.id} className="dd-finding" onClick={() => openDrawer('finding', f)}>
                                            <span className="dd-finding-sev" style={{ background: riskTint(f.severity), color: riskColor(f.severity) }}>
                                                {riskLabel(f.severity)}
                                            </span>
                                            <span className="dd-finding-body">
                                                <span className="dd-finding-claim">{f.claim}</span>
                                                <span className="dd-finding-meta">
                                                    {riskCatLabel(f.category)}{f.date ? ' · ' + f.date : ''} · {(f.sourceIds || []).length} source{(f.sourceIds || []).length !== 1 ? 's' : ''}
                                                </span>
                                            </span>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14" className="dd-recent-arrow"><polyline points="9 18 15 12 9 6"/></svg>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* ── Adverse Media ── */}
                        {(result.adverseMedia || []).length > 0 ? (
                            <section className="dd-card">
                                <div className="dd-card-label">Adverse Media</div>
                                <div className="dd-adverse">
                                    {result.adverseMedia.map(am => (
                                        <button key={am.id} className="dd-adverse-item" onClick={() => openDrawer('adverse', am)}>
                                            <span className="dd-finding-sev" style={{ background: riskTint(am.severity), color: riskColor(am.severity) }}>{riskLabel(am.severity)}</span>
                                            <span className="dd-finding-body">
                                                <span className="dd-finding-claim">{am.headline}</span>
                                                <span className="dd-finding-meta">
                                                    {String(am.status).replace(/_/g, ' ')}{am.date ? ' · ' + am.date : ''} · {(am.sourceIds || []).length} source{(am.sourceIds || []).length !== 1 ? 's' : ''}
                                                </span>
                                            </span>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14" className="dd-recent-arrow"><polyline points="9 18 15 12 9 6"/></svg>
                                        </button>
                                    ))}
                                </div>
                                <div className="dd-section-note">Allegations and accusations are presented as reported and are not treated as confirmed facts.</div>
                            </section>
                        ) : (
                            <section className="dd-card">
                                <div className="dd-card-label">Adverse Media</div>
                                <div className="dd-section-note">No material adverse media was identified in the public sources checked.</div>
                            </section>
                        )}

                        {/* ── Legal & Regulatory ── */}
                        {((result.findings || []).some(f => f.category === 'Legal') || (result.findings || []).some(f => f.category === 'Regulatory')) && (
                            <section className="dd-card">
                                <div className="dd-card-label">Legal & Regulatory</div>
                                <div className="dd-adverse">
                                    {result.findings.filter(f => ['Legal', 'Regulatory'].includes(f.category)).map(f => (
                                        <button key={f.id} className="dd-adverse-item" onClick={() => openDrawer('finding', f)}>
                                            <span className="dd-finding-sev" style={{ background: riskTint(f.severity), color: riskColor(f.severity) }}>{riskLabel(f.severity)}</span>
                                            <span className="dd-finding-body">
                                                <span className="dd-finding-claim">{f.claim}</span>
                                                <span className="dd-finding-meta">{riskCatLabel(f.category)}{f.date ? ' · ' + f.date : ''} · Status: {f.detail?.match(/ongoing/i) ? 'Ongoing' : 'Reported'}</span>
                                            </span>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14" className="dd-recent-arrow"><polyline points="9 18 15 12 9 6"/></svg>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* ── News ── */}
                        {(result.news || []).length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">News</div>
                                <div className="dd-news">
                                    {result.news.map(n => (
                                        <button key={n.id} className="dd-news-item" onClick={() => openDrawer('adverse', n)}>
                                            <span className={'dd-news-sentiment ' + n.sentiment}>{n.sentiment}</span>
                                            <span className="dd-finding-body">
                                                <span className="dd-finding-claim">{n.headline}</span>
                                                {n.date && <span className="dd-finding-meta">{n.date}</span>}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* ── Social / Online ── */}
                        {(result.social || []).length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">Social & Online Presence</div>
                                <div className="dd-social">
                                    {result.social.map(s => (
                                        <div key={s.platform} className="dd-social-card">
                                            <div className="dd-social-platform">{SOCIAL_LABELS[s.platform] || s.platform}</div>
                                            {s.followers != null && <div className="dd-social-count">{s.followers.toLocaleString()} followers</div>}
                                            {s.handle && <div className="dd-social-handle">{s.handle}</div>}
                                            {s.summary && <div className="dd-social-summary">{s.summary}</div>}
                                            {s.url && <a className="dd-social-link" href={s.url} target="_blank" rel="noopener noreferrer">View</a>}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* ── Sources ── */}
                        {(result.sources || []).length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">Sources ({sourceCount})</div>
                                <div className="dd-sources">
                                    {result.sources.map(s => (
                                        <button key={s.id} className="dd-source" onClick={() => openDrawer('source', s)}>
                                            <span className="dd-source-cat" data-cat={s.category}>{String(s.category).replace(/_/g, ' ')}</span>
                                            <span className="dd-source-name">{s.name}</span>
                                            {s.date && <span className="dd-source-date">{s.date}</span>}
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* ── Research Limitations ── */}
                        {(result.limitations?.length || 0) > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">Research Limitations</div>
                                <div className="dd-limits-list">
                                    {result.limitations.map((s, i) => <div key={i} className="dd-limit-item">— {s}</div>)}
                                </div>
                            </section>
                        )}

                        {/* ── Recommendations ── */}
                        {(result.recommendations || []).length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">Recommendations</div>
                                <div className="dd-recommendations">
                                    {result.recommendations.map(r => (
                                        <div key={r.id} className={'dd-recommendation dd-rec-' + (r.priority || 'medium')}>
                                            <div className="dd-rec-priority">{r.priority || 'medium'}</div>
                                            <div className="dd-rec-body">
                                                <div className="dd-rec-action">{r.action}</div>
                                                {r.rationale && <div className="dd-rec-rationale">{r.rationale}</div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* ── Ask ── */}
                        <section className="dd-card">
                            <div className="dd-card-label">Ask about this person</div>
                            <div className="dd-ask">
                                <input
                                    value={askInput}
                                    onChange={e => setAskInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && askQuestion()}
                                    placeholder="Ask a question about this person..."
                                />
                                <button className="btn-primary" onClick={askQuestion}>Ask</button>
                            </div>
                            <div className="dd-ask-suggested">
                                {suggestedQuestions.map(q => (
                                    <button key={q} onClick={() => { setAskInput(q); setAskReply(null); }}>{q}</button>
                                ))}
                            </div>
                            {askReply && (
                                <div className="dd-ask-reply">
                                    <div className="dd-ask-reply-q">"{askReply.q}"</div>
                                    <div className="dd-ask-reply-a">{askReply.a}</div>
                                </div>
                            )}
                        </section>
                    </div>

                    {/* ── Right: sidebar ── */}
                    <aside className="dd-side">
                        <div className="dd-side-card">
                            <div className="dd-card-label">Research Coverage</div>
                            <div className="dd-coverage">
                                {(result.coverage || []).map(c => (
                                    <div key={c.area} className="dd-coverage-row" title={c.state === 'not_researched' ? 'Not investigated' : c.state.replace(/_/g, ' ')}>
                                        <span>{COVERAGE_LABELS[c.area] || c.area}</span>
                                        <span className={'dd-coverage-mark ' + c.state}>
                                            {c.state === 'found' ? '✓' : c.state === 'partial' ? '~' : c.state === 'not_applicable' ? '—' : '?'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="dd-side-note">"?" means checked but not verified — different from "not investigated."</div>
                        </div>
                    </aside>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                ORGANIZATION LAYOUT — existing two-column, enhanced risk cards
               ════════════════════════════════════════════════════════════ */}
            {isOrg && (
                <div className="dd-columns">
                    <div className="dd-main">
                        {/* Executive summary */}
                        <section className="dd-card">
                            <div className="dd-card-label">Executive Summary</div>
                            <p className="dd-summary">{result.summary}</p>
                            <div className="dd-signals">
                                {(result.positiveSignals?.length || 0) > 0 && (
                                    <div className="dd-signal-col positive">
                                        <div className="dd-signal-head">Positive signals</div>
                                        {result.positiveSignals.map((s, i) => <div key={i} className="dd-signal-item positive">{s}</div>)}
                                    </div>
                                )}
                                {(result.concerns?.length || 0) > 0 && (
                                    <div className="dd-signal-col">
                                        <div className="dd-signal-head">Concerns</div>
                                        {result.concerns.map((s, i) => <div key={i} className="dd-signal-item concern">{s}</div>)}
                                    </div>
                                )}
                            </div>
                            {(result.limitations?.length || 0) > 0 && (
                                <div className="dd-limits">
                                    <div className="dd-signal-head">Research limitations</div>
                                    {result.limitations.map((s, i) => <div key={i} className="dd-signal-item limitation">{s}</div>)}
                                </div>
                            )}
                        </section>

                        {/* Key findings */}
                        {(result.findings || []).length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">Key Findings</div>
                                <div className="dd-findings">
                                    {result.findings.map(f => (
                                        <button key={f.id} className="dd-finding" onClick={() => openDrawer('finding', f)}>
                                            <span className="dd-finding-sev" style={{ background: riskTint(f.severity), color: riskColor(f.severity) }}>
                                                {riskLabel(f.severity)}
                                            </span>
                                            <span className="dd-finding-body">
                                                <span className="dd-finding-claim">{f.claim}</span>
                                                <span className="dd-finding-meta">
                                                    {riskCatLabel(f.category)}{f.date ? ' · ' + f.date : ''} · {(f.sourceIds || []).length} source{(f.sourceIds || []).length !== 1 ? 's' : ''}
                                                </span>
                                            </span>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14" className="dd-recent-arrow"><polyline points="9 18 15 12 9 6"/></svg>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Risk assessment — enhanced for org too */}
                        {(result.risks || []).length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">Risk Assessment</div>
                                <div className="dd-risk-bar">
                                    <div className="dd-risk-bar-track">
                                        <div className="dd-risk-bar-fill" style={{
                                            width: (() => {
                                                const levels = { low: 25, medium: 50, elevated: 75, high: 100 };
                                                const max = Math.max(...(result.risks || []).map(r => levels[r.level] || 0));
                                                return max + '%';
                                            })(),
                                            background: riskColor(current?.overall),
                                        }} />
                                    </div>
                                    <span className="dd-risk-bar-label" style={{ color: riskColor(current?.overall) }}>{riskLabel(current?.overall)}</span>
                                </div>
                                <div className="dd-risks-detail">
                                    {result.risks.map(r => {
                                        const relatedFindings = (result.findings || []).filter(f => (r.findingIds || []).includes(f.id));
                                        const riskEntities = (result.organizations || []).filter(o =>
                                            relatedFindings.some(f => (f.claim || '').toLowerCase().includes(o.name.toLowerCase()) || (f.detail || '').toLowerCase().includes(o.name.toLowerCase()))
                                        );
                                        const riskPeople = (result.people || []).filter(p =>
                                            relatedFindings.some(f => (f.claim || '').toLowerCase().includes(p.name.toLowerCase()) || (f.detail || '').toLowerCase().includes(p.name.toLowerCase()))
                                        );
                                        const affectedNames = [...riskEntities.map(e => e.name), ...riskPeople.map(p => p.name)].slice(0, 4);
                                        const what = r.explanation || r.whyItMatters;
                                        return (
                                            <button key={r.id} className="dd-risk-detail" onClick={() => openDrawer('risk', r)}>
                                                <div className="dd-risk-detail-head">
                                                    <span className="dd-risk-detail-cat">{riskCatLabel(r.category)}</span>
                                                    <span className="dd-risk-detail-level" style={{ color: riskColor(r.level) }}>{riskLabel(r.level)}</span>
                                                </div>
                                                {what && <div className="dd-risk-detail-explain">{what}</div>}
                                                {r.whyItMatters && r.whyItMatters !== what && <div className="dd-risk-detail-why">Why: {r.whyItMatters}</div>}
                                                {affectedNames.length > 0 && (
                                                    <div className="dd-risk-detail-affects">
                                                        <span className="dd-risk-affects-label">Affects:</span> {affectedNames.join(', ')}
                                                    </div>
                                                )}
                                                {relatedFindings.length > 0 && (
                                                    <div className="dd-risk-detail-findings">
                                                        {relatedFindings.slice(0, 3).map(f => (
                                                            <span key={f.id} className="dd-risk-finding-pill" style={{ background: riskTint(f.severity), color: riskColor(f.severity) }}>
                                                                {f.claim.length > 60 ? f.claim.slice(0, 57) + '...' : f.claim}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {r.limitations && <div className="dd-risk-detail-limits">{r.limitations}</div>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* Ownership / corporate network */}
                        {ownershipRels.length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">Ownership, Control & Corporate Network</div>
                                <div className="dd-ownership">
                                    {ownershipRels.map(r => {
                                        const a = (result.people || []).find(p => p.id === r.aId) || (result.organizations || []).find(o => o.id === r.aId);
                                        const b = (result.organizations || []).find(o => o.id === r.bId) || (result.people || []).find(p => p.id === r.bId);
                                        return (
                                            <button key={r.id} className="dd-own-row" onClick={() => openDrawer('relationship', { ...r, _a: a, _b: b })}>
                                                <span className="dd-own-party" onClick={e => { if (a) { e.stopPropagation(); openDrawer(a.type === 'individual' ? 'person' : 'organization', a); } }}>
                                                    {a?.name || 'Unknown'}
                                                </span>
                                                <span className="dd-own-mid">
                                                    <span className="dd-own-type">{relTypeName(r.type)}</span>
                                                    {r.ownershipPct != null && <span className="dd-own-pct">{r.ownershipPct}%</span>}
                                                    {r.verification && r.verification !== 'verified' && <span className="dd-own-flag">{r.verification === 'inferred' ? 'inferred' : 'reported'}</span>}
                                                </span>
                                                <span className="dd-own-party" onClick={e => { if (b) { e.stopPropagation(); openDrawer(b.type === 'individual' ? 'person' : 'organization', b); } }}>
                                                    {b?.name || ent.name}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* People (org research) */}
                        {(result.people || []).length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">Management & People</div>
                                <div className="dd-people">
                                    {result.people.map(p => (
                                        <button key={p.id} className="dd-person" onClick={() => openDrawer('person', p)}>
                                            <span className="dd-person-avatar">{p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                                            <span className="dd-person-body">
                                                <span className="dd-person-name">{p.name}</span>
                                                <span className="dd-person-sub">{p.subtitle || p.role || p.note}</span>
                                            </span>
                                            {p.riskLevel && <span className="dd-person-risk" style={{ background: riskTint(p.riskLevel), color: riskColor(p.riskLevel) }}>{riskLabel(p.riskLevel)}</span>}
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14" className="dd-recent-arrow"><polyline points="9 18 15 12 9 6"/></svg>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Adverse media */}
                        {(result.adverseMedia || []).length > 0 ? (
                            <section className="dd-card">
                                <div className="dd-card-label">Adverse Media</div>
                                <div className="dd-adverse">
                                    {result.adverseMedia.map(am => (
                                        <button key={am.id} className="dd-adverse-item" onClick={() => openDrawer('adverse', am)}>
                                            <span className="dd-finding-sev" style={{ background: riskTint(am.severity), color: riskColor(am.severity) }}>{riskLabel(am.severity)}</span>
                                            <span className="dd-finding-body">
                                                <span className="dd-finding-claim">{am.headline}</span>
                                                <span className="dd-finding-meta">
                                                    {String(am.status).replace(/_/g, ' ')}{am.date ? ' · ' + am.date : ''} · {(am.sourceIds || []).length} source{(am.sourceIds || []).length !== 1 ? 's' : ''}
                                                </span>
                                            </span>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14" className="dd-recent-arrow"><polyline points="9 18 15 12 9 6"/></svg>
                                        </button>
                                    ))}
                                </div>
                                <div className="dd-section-note">Allegations and accusations are presented as reported and are not treated as confirmed facts.</div>
                            </section>
                        ) : (
                            <section className="dd-card">
                                <div className="dd-card-label">Adverse Media</div>
                                <div className="dd-section-note">No material adverse media was identified in the public sources checked.</div>
                            </section>
                        )}

                        {/* Legal & regulatory */}
                        {((result.findings || []).some(f => f.category === 'Legal') || (result.findings || []).some(f => f.category === 'Regulatory')) && (
                            <section className="dd-card">
                                <div className="dd-card-label">Legal & Regulatory</div>
                                <div className="dd-adverse">
                                    {result.findings.filter(f => ['Legal', 'Regulatory'].includes(f.category)).map(f => (
                                        <button key={f.id} className="dd-adverse-item" onClick={() => openDrawer('finding', f)}>
                                            <span className="dd-finding-sev" style={{ background: riskTint(f.severity), color: riskColor(f.severity) }}>{riskLabel(f.severity)}</span>
                                            <span className="dd-finding-body">
                                                <span className="dd-finding-claim">{f.claim}</span>
                                                <span className="dd-finding-meta">{riskCatLabel(f.category)}{f.date ? ' · ' + f.date : ''} · Status: {f.detail?.match(/ongoing/i) ? 'Ongoing' : 'Reported'}</span>
                                            </span>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14" className="dd-recent-arrow"><polyline points="9 18 15 12 9 6"/></svg>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Funding (org only) */}
                        {hasFunding && (
                            <section className="dd-card">
                                <div className="dd-card-label">Funding</div>
                                <div className="dd-funding">
                                    {fundingRows.map(fr => (
                                        <div key={fr.id} className="dd-fund-row">
                                            <span className="dd-fund-round">{fr.round}</span>
                                            <span className="dd-fund-amount">
                                                {fr._amount != null
                                                    ? (fr._amount >= 1e9
                                                        ? '$' + (fr._amount / 1e9).toFixed(fr._amount >= 1e10 ? 0 : 1) + 'B'
                                                        : fr._amount >= 1e6
                                                            ? '$' + (fr._amount / 1e6).toFixed(0) + 'M'
                                                            : '$' + (fr._amount / 1e3).toFixed(0) + 'K')
                                                    : (fr.amount != null ? String(fr.amount) : '—')}
                                            </span>
                                            <span className="dd-fund-year">{fr._date}</span>
                                            {fr._investors?.length ? <span className="dd-fund-inv">{fr._investors.join(', ')}</span> : null}
                                        </div>
                                    ))}
                                </div>
                                {(result.totalFunding || parsedTotal) ? (
                                    <div className="dd-section-note">
                                        Total reported funding: <strong>${((result.totalFunding || parsedTotal) / 1e6).toFixed(0)}M</strong> (publicly reported)
                                    </div>
                                ) : null}
                            </section>
                        )}

                        {/* News */}
                        {(result.news || []).length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">News & Reputation</div>
                                <div className="dd-news">
                                    {result.news.map(n => (
                                        <button key={n.id} className="dd-news-item" onClick={() => openDrawer('adverse', n)}>
                                            <span className={'dd-news-sentiment ' + n.sentiment}>{n.sentiment}</span>
                                            <span className="dd-finding-body">
                                                <span className="dd-finding-claim">{n.headline}</span>
                                                {n.date && <span className="dd-finding-meta">{n.date}</span>}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Social */}
                        {(result.social || []).length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">Social & Online Signals</div>
                                <div className="dd-social">
                                    {result.social.map(s => (
                                        <div key={s.platform} className="dd-social-card">
                                            <div className="dd-social-platform">{SOCIAL_LABELS[s.platform] || s.platform}</div>
                                            {s.followers != null && <div className="dd-social-count">{s.followers.toLocaleString()} followers</div>}
                                            {s.handle && <div className="dd-social-handle">{s.handle}</div>}
                                            {s.summary && <div className="dd-social-summary">{s.summary}</div>}
                                            {s.url && <a className="dd-social-link" href={s.url} target="_blank" rel="noopener noreferrer">View</a>}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Sources */}
                        {(result.sources || []).length > 0 && (
                            <section className="dd-card">
                                <div className="dd-card-label">Sources ({sourceCount})</div>
                                <div className="dd-sources">
                                    {result.sources.map(s => (
                                        <button key={s.id} className="dd-source" onClick={() => openDrawer('source', s)}>
                                            <span className="dd-source-cat" data-cat={s.category}>{String(s.category).replace(/_/g, ' ')}</span>
                                            <span className="dd-source-name">{s.name}</span>
                                            {s.date && <span className="dd-source-date">{s.date}</span>}
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Ask */}
                        <section className="dd-card">
                            <div className="dd-card-label">Ask about this entity</div>
                            <div className="dd-ask">
                                <input
                                    value={askInput}
                                    onChange={e => setAskInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && askQuestion()}
                                    placeholder="Ask a question about this company..."
                                />
                                <button className="btn-primary" onClick={askQuestion}>Ask</button>
                            </div>
                            <div className="dd-ask-suggested">
                                {suggestedQuestions.map(q => (
                                    <button key={q} onClick={() => { setAskInput(q); setAskReply(null); }}>{q}</button>
                                ))}
                            </div>
                            {askReply && (
                                <div className="dd-ask-reply">
                                    <div className="dd-ask-reply-q">"{askReply.q}"</div>
                                    <div className="dd-ask-reply-a">{askReply.a}</div>
                                </div>
                            )}
                        </section>
                    </div>

                    <aside className="dd-side">
                        <div className="dd-side-card">
                            <div className="dd-card-label">Research Coverage</div>
                            <div className="dd-coverage">
                                {(result.coverage || []).map(c => (
                                    <div key={c.area} className="dd-coverage-row" title={c.state === 'not_researched' ? 'Not investigated' : c.state.replace(/_/g, ' ')}>
                                        <span>{COVERAGE_LABELS[c.area] || c.area}</span>
                                        <span className={'dd-coverage-mark ' + c.state}>
                                            {c.state === 'found' ? '✓' : c.state === 'partial' ? '~' : c.state === 'not_applicable' ? '—' : '?'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="dd-side-note">"?" means checked but not verified — different from "not investigated."</div>
                        </div>
                    </aside>
                </div>
            )}

            <DDDetailDrawer
                open={!!drawerItem}
                onClose={() => setDrawerItem(null)}
                item={drawerItem}
                result={result}
                onOpenEntity={({ type, data }) => openDrawer(type === 'individual' ? 'person' : 'organization', data)}
                onOpenSource={(s) => openDrawer('source', s)}
                onOpenFinding={(f) => openDrawer('finding', f)}
            />
        </div>
    );
}
