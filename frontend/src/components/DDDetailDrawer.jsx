// ─── Due Diligence detail drawer ───
// Reusable right-side panel. Opens over the report without navigating away.
// Adapts to: finding | person | organization | relationship | risk | source |
//            adverse media item | legal/regulatory item | news item

import { useEffect } from 'react';
import {
    riskColor, riskTint, riskLabel, RELATIONSHIP_TYPES,
} from '../dueDiligence/types';

const REL_LABELS = {
    OWNS: 'Owns', BENEFICIAL_OWNER_OF: 'Beneficial owner of', SHAREHOLDER_OF: 'Shareholder of',
    CONTROLS: 'Controls', DIRECTOR_OF: 'Director of', FOUNDER_OF: 'Founder of',
    CEO_OF: 'CEO of', INVESTOR_IN: 'Investor in', PARENT_OF: 'Parent of',
    SUBSIDIARY_OF: 'Subsidiary of', RELATED_TO: 'Related to', FORMER_DIRECTOR_OF: 'Former director of',
};

const VERIFICATION_LABELS = {
    verified: 'Verified', reported: 'Reported', inferred: 'Inferred relationship',
    not_verified: 'Not verified',
};

export function DDSourceRow({ source, onOpenSource }) {
    return (
        <button className="dd-drawer-source" onClick={() => onOpenSource?.(source)}>
            <div className="dd-drawer-source-dot" data-cat={source.category} />
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div className="dd-drawer-source-name">{source.name}</div>
                <div className="dd-drawer-source-meta">
                    {source.category}{source.date ? ' · ' + source.date : ''}
                </div>
            </div>
            {source.url && <span className="dd-drawer-source-open">Open Source</span>}
        </button>
    );
}

export default function DDDetailDrawer({ open, onClose, item, result, onOpenEntity, onOpenSource, onOpenFinding }) {
    // item: { kind, data }
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        if (open) window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open || !item) return null;

    const { kind, data } = item;
    const sourcesById = Object.fromEntries((result?.sources || []).map(s => [s.id, s]));
    const findingsById = Object.fromEntries((result?.findings || []).map(f => [f.id, f]));
    const getSource = (id) => sourcesById[id];
    const title = data.name || data.headline || data.claim || data.category || 'Details';
    const sub = kind === 'finding' ? (data.category || '')
        : kind === 'risk' ? 'Risk Assessment'
        : kind === 'person' || kind === 'organization' ? (data.subtitle || data.role || data.note || (kind === 'person' ? 'Individual' : 'Organization'))
        : kind === 'relationship' ? REL_LABELS[data.type] || data.type
        : kind === 'adverse' ? String(data.status || '').replace(/_/g, ' ')
        : kind === 'source' ? 'Source · ' + data.category
        : '';

    return (
        <>
            <div className="dd-drawer-overlay" onClick={onClose} />
            <aside className="dd-drawer">
                <div className="dd-drawer-header">
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="dd-drawer-kicker">{kind === 'finding' ? 'Finding' : kind === 'risk' ? 'Risk' : kind === 'adverse' ? 'Adverse Media' : kind === 'source' ? 'Source' : kind === 'relationship' ? 'Relationship' : 'Entity'}</div>
                        <div className="dd-drawer-title">{title}</div>
                        <div className="dd-drawer-sub">{sub}</div>
                    </div>
                    <button className="dd-drawer-close" onClick={onClose} aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                </div>

                <div className="dd-drawer-body">
                    {kind === 'risk' && (
                        <div className="dd-risk-chip" style={{ background: riskTint(data.level), color: riskColor(data.level) }}>
                            {riskLabel(data.level)}
                        </div>
                    )}

                    {kind === 'finding' && data.severity && (
                        <div className="dd-risk-chip" style={{ background: riskTint(data.severity), color: riskColor(data.severity) }}>
                            {riskLabel(data.severity)}
                        </div>
                    )}

                    {kind === 'adverse' && (
                        <>
                            <div className="dd-risk-chip" style={{ background: riskTint(data.severity), color: riskColor(data.severity) }}>
                                {riskLabel(data.severity)}
                            </div>
                            <div className="dd-drawer-note">
                                Status: <strong>{String(data.status).replace(/_/g, ' ')}</strong>. This is presented as reported and is not treated as a confirmed fact.
                            </div>
                        </>
                    )}

                    {/* Risk: full analysis */}
                    {kind === 'risk' && data.explanation && <p className="dd-drawer-p">{data.explanation}</p>}
                    {kind === 'risk' && data.whyItMatters && <p className="dd-drawer-p" style={{ fontStyle: 'italic', opacity: 0.8 }}>{data.whyItMatters}</p>}
                    {kind === 'risk' && (data.findingIds || []).length > 0 && (
                        <div style={{ marginTop: 8 }}>
                            <div className="dd-drawer-section-label">Supporting Findings</div>
                            {data.findingIds.map(fid => {
                                const f = result?.findings?.find(x => x.id === fid);
                                if (!f) return null;
                                return (
                                    <button key={fid} className="dd-drawer-finding" onClick={() => onOpenFinding?.(f)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}>
                                        <span className="dd-drawer-finding-sev" style={{ background: riskTint(f.severity), color: riskColor(f.severity), fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600, flexShrink: 0 }}>{riskLabel(f.severity)}</span>
                                        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{f.claim}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {kind === 'risk' && data.limitations && <p className="dd-drawer-p" style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-tertiary)', marginTop: 8 }}>{data.limitations}</p>}

                    {/* Finding: full analysis */}
                    {kind === 'finding' && data.detail && <p className="dd-drawer-p">{data.detail}</p>}
                    {kind === 'finding' && data.whyItMatters && <p className="dd-drawer-p" style={{ fontStyle: 'italic', opacity: 0.8 }}>{data.whyItMatters}</p>}

                    {/* Adverse: summary */}
                    {kind === 'adverse' && data.summary && <p className="dd-drawer-p">{data.summary}</p>}
                    {kind === 'adverse' && data.whyItMatters && <p className="dd-drawer-p" style={{ fontStyle: 'italic', opacity: 0.8 }}>{data.whyItMatters}</p>}

                    {kind === 'finding' && data.confidence && (
                        <div className="dd-drawer-note">Confidence: <strong style={{ textTransform: 'capitalize' }}>{data.confidence}</strong></div>
                    )}
                    {kind === 'adverse' && data.confidence && (
                        <div className="dd-drawer-note">Confidence: <strong style={{ textTransform: 'capitalize' }}>{data.confidence}</strong></div>
                    )}
                    {data.date && <div className="dd-drawer-note">Date: <strong>{data.date}</strong></div>}

                    {/* ── Relationship specifics ── */}
                    {kind === 'relationship' && (
                        <>
                            {data.ownershipPct != null
                                ? <div className="dd-drawer-note">Ownership: <strong>{data.ownershipPct}%</strong> · {data.direct ? 'Direct' : 'Indirect'}</div>
                                : <div className="dd-drawer-note">Ownership percentage not publicly disclosed for this relationship.</div>}
                            {data.verification && (
                                <div className="dd-drawer-note">
                                    Status: <strong>{VERIFICATION_LABELS[data.verification] || data.verification}</strong>
                                    {data.verification !== 'verified' && ' — treat with appropriate caution.'}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Person / Organization preview ── */}
                    {(kind === 'person' || kind === 'organization') && (
                        <>
                            {data.country && <div className="dd-drawer-note">Country: <strong>{data.country}</strong></div>}
                            {data.riskLevel && (
                                <div className="dd-risk-chip" style={{ background: riskTint(data.riskLevel), color: riskColor(data.riskLevel), marginTop: 10 }}>
                                    Risk: {riskLabel(data.riskLevel)}
                                </div>
                            )}
                            {(result?.relationships || []).filter(r => r.aId === data.id || r.bId === data.id).length > 0 && (
                                <div className="dd-drawer-section">
                                    <div className="dd-drawer-section-label">Relationships</div>
                                    {(result.relationships || []).filter(r => r.aId === data.id || r.bId === data.id).map(r => {
                                        const other = r.aId === data.id
                                            ? (result.organizations || []).find(o => o.id === r.bId) || (result.people || []).find(p => p.id === r.bId)
                                            : (result.organizations || []).find(o => o.id === r.aId) || (result.people || []).find(p => p.id === r.aId);
                                        return (
                                            <button key={r.id} className="dd-drawer-rel" onClick={() => other && onOpenEntity?.({ type: other.type, data: other })}>
                                                <span className="dd-drawer-rel-type">{REL_LABELS[r.type] || r.type}</span>
                                                {other ? <span className="dd-drawer-rel-name">{other.name}</span> : <span className="dd-drawer-rel-name muted">Unknown entity</span>}
                                                {r.ownershipPct != null && <span className="dd-drawer-rel-pct">{r.ownershipPct}%</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            <button className="dd-btn-primary" onClick={() => window.dispatchEvent(new CustomEvent('dd-open-full', { detail: { entityType: data.type, entityName: data.name } }))}>
                                Open Full Due Diligence
                            </button>
                        </>
                    )}

                    {/* ── Related findings (risks) ── */}
                    {kind === 'risk' && (data.findingIds || []).length > 0 && (
                        <div className="dd-drawer-section">
                            <div className="dd-drawer-section-label">Supporting findings</div>
                            {data.findingIds.map(fid => findingsById[fid]).filter(Boolean).map(f => (
                                <button key={f.id} className="dd-drawer-rel" onClick={() => onOpenFinding?.(f)}>
                                    <span className="dd-drawer-rel-type">{f.category}</span>
                                    <span className="dd-drawer-rel-name">{f.claim}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── Sources ── */}
                    {kind === 'source' ? (
                        <>
                            {data.url && (
                                <a className="dd-btn-primary" href={data.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>Open Source</a>
                            )}
                            {data.summary && <p className="dd-drawer-p">{data.summary}</p>}
                            {data.date && <div className="dd-drawer-note">Published: <strong>{data.date}</strong></div>}
                            <div className="dd-drawer-note">Category: <strong style={{ textTransform: 'capitalize' }}>{String(data.category).replace(/_/g, ' ')}</strong></div>
                        </>
                    ) : (data.sourceIds || []).length > 0 ? (
                        <div className="dd-drawer-section">
                            <div className="dd-drawer-section-label">Sources ({data.sourceIds.length})</div>
                            {data.sourceIds.map(getSource).filter(Boolean).map(s => (
                                <DDSourceRow key={s.id} source={s} onOpenSource={onOpenSource} />
                            ))}
                        </div>
                    ) : null}

                    {data.limitations && (
                        <div className="dd-drawer-limit">Limitation: {data.limitations}</div>
                    )}
                </div>
            </aside>
        </>
    );
}
