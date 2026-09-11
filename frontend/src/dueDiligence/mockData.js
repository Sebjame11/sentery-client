// ─── Due Diligence mock/demo research results ───
// Phase 1: frontend renders from these shapes. The Phase 2 research agent will
// produce the same structure via the Edge Function and store it in Supabase JSONB.

import { ENTITY_TYPES } from './types';

// ─── Shared source helper ───
const src = (id, name, category, date, url, summary) => ({ id, name, category, date, url, summary });

// ═══════════════════════════════════════════════════════════════
// ORGANIZATION DEMO — ABC Technologies Ltd.
// Exercises: full sections, partial ownership, adverse media, missing UBO
// ═══════════════════════════════════════════════════════════════
export const ORG_DEMO_RESULT = {
    entity: {
        id: 'org-abc',
        type: ENTITY_TYPES.ORGANIZATION,
        name: 'ABC Technologies Ltd.',
        subtitle: 'Organization',
        country: 'United States',
        riskLevel: 'medium',
        extra: { industry: 'Technology', founded: '2018', status: 'Active', jurisdiction: 'Delaware, US', website: 'https://abctechnologies.example.com' },
    },
    tagline: 'United States · Technology · Founded 2018',
    summary: 'ABC Technologies appears to be an established technology company with significant institutional funding. Research identified a complex multi-jurisdiction ownership structure and ongoing commercial litigation that may require additional investigation before an acquisition.',
    positiveSignals: [
        'Completed three institutional funding rounds totaling a reported $73M',
        'Active operating status with consistent public product releases',
        'No sanctions or PEP matches identified in public lists checked',
    ],
    concerns: [
        'Complex ownership structure involving multiple holding entities across jurisdictions',
        'Ongoing commercial dispute filed in 2025',
        'Two former executives were involved in a misconduct allegation at a previous company',
    ],
    limitations: [
        'Private company — audited financial statements are not publicly available',
        'Ownership below 10% could not be verified from public sources',
    ],
    findings: [
        {
            id: 'f1', claim: 'Complex ownership structure involving multiple holding entities', category: 'Ownership',
            severity: 'elevated', date: '2026', sourceIds: ['s1', 's7'], confidence: 'high',
            detail: 'Ownership is layered through at least two holding entities: ABC Holdings Ltd. (reported 62%) and offshore ABC Global (reported ~10%, not independently verified). Smaller shareholders could not all be identified from public filings.',
            whyItMatters: 'Multi-layer holding structures complicate UBO identification and may conceal control by undisclosed parties. Acquirers should obtain a full shareholder register and confirm the ultimate beneficial owner before signing.',
        },
        {
            id: 'f2', claim: 'Ongoing commercial dispute with a former supplier', category: 'Legal',
            severity: 'elevated', date: '2025', sourceIds: ['s2'], confidence: 'high',
            detail: 'A commercial dispute over an alleged breach of a 2024 supply agreement was filed in 2025. The matter is ongoing.',
            whyItMatters: 'Ongoing litigation can create financial exposure and may surface additional documents about company practices during discovery.',
        },
        {
            id: 'f3', claim: 'Series C round of $40M publicly reported in 2025', category: 'Funding',
            severity: 'low', date: '2025', sourceIds: ['s3', 's4'], confidence: 'high',
            detail: 'The round was covered by two independent tech publications with consistent figures. Lead investor was XYZ Capital.',
            whyItMatters: 'Institutional backing is a positive stability signal, but cap-table dilution and investor rights should be reviewed in detail.',
        },
        {
            id: 'f4', claim: 'Former CEO linked to misconduct allegations at previous employer', category: 'Management',
            severity: 'medium', date: '2023', sourceIds: ['s5'], confidence: 'medium',
            detail: 'A 2023 news article reports allegations made against the former CEO during their tenure at a prior company. The allegations were not adjudicated and no charges were filed.',
            whyItMatters: 'Allegations are not confirmed findings. They nonetheless warrant reference checks and a management interview as part of confirmatory diligence.',
        },
    ],
    risks: [
        { id: 'r1', category: 'Company', level: 'medium', explanation: 'Established operating company with institutional funding and consistent public activity.', whyItMatters: 'Overall the company appears genuine and active.', findingIds: ['f3'], sourceIds: ['s3', 's4'], limitations: 'Private financials not publicly available.' },
        { id: 'r2', category: 'Ownership', level: 'elevated', explanation: 'Multi-layer holding structure with partly unverified ownership chain.', whyItMatters: 'UBO identification is the key pre-acquisition step.', findingIds: ['f1'], sourceIds: ['s1', 's7'] },
        { id: 'r3', category: 'Legal', level: 'elevated', explanation: 'Ongoing commercial litigation filed in 2025.', whyItMatters: 'Potential financial exposure and discovery risk.', findingIds: ['f2'], sourceIds: ['s2'] },
        { id: 'r4', category: 'Regulatory', level: 'low', explanation: 'No regulatory enforcement, warnings, or licensing issues identified in public sources checked.', whyItMatters: 'No red flags found in this category.', findingIds: [], sourceIds: ['s7'] },
        { id: 'r5', category: 'Reputation', level: 'medium', explanation: 'Mixed media profile: positive funding coverage alongside management-related allegations.', whyItMatters: 'Reputation risk may affect customer and partner decisions.', findingIds: ['f4'], sourceIds: ['s5'] },
        { id: 'r6', category: 'Sanctions', level: 'low', explanation: 'No sanctions or PEP matches identified in the public lists checked.', whyItMatters: 'No sanctions exposure found.', findingIds: [], sourceIds: ['s7'] },
    ],
    people: [
        { id: 'p-john', type: 'individual', name: 'John Smith', subtitle: 'CEO — ABC Technologies', country: 'United States', riskLevel: 'medium' },
        { id: 'p-sarah', type: 'individual', name: 'Sarah Lee', subtitle: 'Founder & Director', country: 'United States', riskLevel: 'low' },
        { id: 'p-david', type: 'individual', name: 'David Chen', subtitle: 'CFO', country: 'Singapore', riskLevel: 'low' },
    ],
    organizations: [
        { id: 'org-holdings', type: 'organization', name: 'ABC Holdings Ltd.', subtitle: 'Parent company', country: 'United Kingdom', riskLevel: 'medium' },
        { id: 'org-global', type: 'organization', name: 'ABC Global Pte. Ltd.', subtitle: 'Holding entity', country: 'Singapore', riskLevel: 'medium' },
        { id: 'org-xyz', type: 'organization', name: 'XYZ Capital', subtitle: 'Investor', country: 'United States', riskLevel: 'low' },
    ],
    relationships: [
        { id: 'rel1', aId: 'org-holdings', bId: 'org-abc', type: 'OWNS', ownershipPct: 62, direct: true, verification: 'reported', date: '2026', sourceIds: ['s1'] },
        { id: 'rel2', aId: 'p-john', bId: 'org-holdings', type: 'BENEFICIAL_OWNER_OF', ownershipPct: 80, direct: false, verification: 'reported', date: '2026', sourceIds: ['s1', 's6'] },
        { id: 'rel3', aId: 'p-sarah', bId: 'org-abc', type: 'FOUNDER_OF', direct: true, verification: 'verified', date: '2018', sourceIds: ['s3'] },
        { id: 'rel4', aId: 'p-sarah', bId: 'org-abc', type: 'SHAREHOLDER_OF', ownershipPct: 18, direct: true, verification: 'reported', date: '2026', sourceIds: ['s1'] },
        { id: 'rel5', aId: 'org-xyz', bId: 'org-abc', type: 'INVESTOR_IN', ownershipPct: 10, direct: true, verification: 'reported', date: '2025', sourceIds: ['s3', 's4'] },
        { id: 'rel6', aId: 'p-john', bId: 'org-abc', type: 'CEO_OF', direct: true, verification: 'verified', date: '2021', sourceIds: ['s6'] },
        { id: 'rel7', aId: 'org-global', bId: 'org-abc', type: 'OWNS', ownershipPct: null, direct: false, verification: 'inferred', date: '', sourceIds: ['s7'], },
        { id: 'rel8', aId: 'p-david', bId: 'org-abc', type: 'DIRECTOR_OF', direct: true, verification: 'verified', date: '2022', sourceIds: ['s6'] },
    ],
    adverseMedia: [
        {
            id: 'am1', headline: 'Former supplier files commercial dispute over 2024 supply agreement',
            status: 'lawsuit', severity: 'elevated', date: '2025',
            summary: 'A former supplier alleges breach of a 2024 supply agreement and is seeking damages. The case is ongoing.',
            whyItMatters: 'An ongoing lawsuit creates direct financial exposure and may reveal internal documents during discovery.',
            confidence: 'high', sourceIds: ['s2'],
        },
        {
            id: 'am2', headline: 'Former CEO faced misconduct allegations at previous employer',
            status: 'allegation', severity: 'medium', date: '2023',
            summary: 'News reports describe allegations made against the former CEO at a prior company. No charges were filed and the matter was not adjudicated.',
            whyItMatters: 'Allegations are not confirmed findings, but management integrity is a standard diligence area for M&A.',
            confidence: 'medium', sourceIds: ['s5'],
        },
        {
            id: 'am3', headline: 'Customer complaints about billing practices on consumer forum',
            status: 'accusation', severity: 'low', date: '2024',
            summary: 'A small number of customer complaints about billing appeared on a public consumer forum. Volume is low and no pattern was established.',
            whyItMatters: 'Minor customer sentiment signal; not evidence of systemic misconduct.',
            confidence: 'low', sourceIds: ['s8'],
        },
    ],
    news: [
        { id: 'n1', headline: 'ABC Technologies raises $40M Series C led by XYZ Capital', sentiment: 'positive', date: '2025', summary: 'Funding round coverage by two independent tech publications.', sourceIds: ['s3', 's4'] },
        { id: 'n2', headline: 'ABC Technologies opens Singapore regional office', sentiment: 'positive', date: '2025', summary: 'Regional expansion reported by local tech press.', sourceIds: ['s9'] },
        { id: 'n3', headline: 'Supply agreement dispute heads to court', sentiment: 'negative', date: '2025', summary: 'Legal press summary of the ongoing commercial dispute.', sourceIds: ['s2'] },
        { id: 'n4', headline: 'ABC Technologies named in industry "ones to watch" list', sentiment: 'positive', date: '2024', summary: 'Industry publication recognition.', sourceIds: ['s9'] },
    ],
    funding: [
        { id: 'fr1', round: 'Series A', amount: 8000000, year: 2021, investors: ['Angel investors'] },
        { id: 'fr2', round: 'Series B', amount: 25000000, year: 2023, investors: ['XYZ Capital', 'Others'] },
        { id: 'fr3', round: 'Series C', amount: 40000000, year: 2025, investors: ['XYZ Capital (lead)'] },
    ],
    totalFunding: 73000000,
    social: [
        { platform: 'linkedin', summary: 'Active company page with ~12K followers and regular posts.', url: 'https://linkedin.com/company/abctechnologies' },
        { platform: 'x_twitter', handle: '@abctech', followers: 8400, summary: 'Posts product updates and industry commentary.' },
        { platform: 'github', summary: 'Public org with 23 repositories, mostly tooling and docs.', url: 'https://github.com/abctech' },
    ],
    sources: [
        src('s1', 'State business registry filing', 'government', '2026-01', '', 'Annual filing listing major shareholders above disclosure thresholds.'),
        src('s2', 'Court records — commercial division', 'legal', '2025-11', '', 'Docket entry for the commercial dispute filed by the former supplier.'),
        src('s3', 'TechCrunch-style funding coverage', 'news', '2025-06', '', 'Series C funding round announcement with investor details.'),
        src('s4', 'Second tech publication funding coverage', 'news', '2025-06', '', 'Independent confirmation of Series C figures.'),
        src('s5', 'National business daily', 'news', '2023-04', '', 'Report on misconduct allegations at a previous employer of the former CEO.'),
        src('s6', 'Company leadership page (archived)', 'company', '2026', '', 'Current officers and directors as published by the company.'),
        src('s7', 'Corporate intelligence aggregator', 'other', '2026', '', 'Aggregated registry data across jurisdictions; used for cross-checks.'),
        src('s8', 'Consumer complaints forum', 'reddit', '2024', '', 'Public thread containing customer billing complaints.'),
        src('s9', 'Local tech press', 'news', '2025-02', '', 'Coverage of the Singapore office opening and industry recognition.'),
    ],
    coverage: [
        { area: 'identity', state: 'found', sourceCount: 3 },
        { area: 'ownership', state: 'partial', sourceCount: 3 },
        { area: 'management', state: 'found', sourceCount: 2 },
        { area: 'legal', state: 'found', sourceCount: 1 },
        { area: 'regulatory', state: 'not_verified', sourceCount: 1 },
        { area: 'adverse_media', state: 'found', sourceCount: 3 },
        { area: 'news', state: 'found', sourceCount: 4 },
        { area: 'social', state: 'found', sourceCount: 3 },
        { area: 'technology', state: 'found', sourceCount: 2 },
        { area: 'geographic', state: 'found', sourceCount: 2 },
    ],
};

// ═══════════════════════════════════════════════════════════════
// INDIVIDUAL DEMO — John Smith
// Exercises: person → company network, no funding section (not applicable)
// ═══════════════════════════════════════════════════════════════
export const PERSON_DEMO_RESULT = {
    entity: {
        id: 'p-john-full',
        type: ENTITY_TYPES.INDIVIDUAL,
        name: 'John Smith',
        subtitle: 'Individual',
        country: 'United States',
        riskLevel: 'medium',
        extra: { role: 'Executive', location: 'San Francisco, CA' },
    },
    tagline: 'United States · Executive · San Francisco, CA',
    summary: 'John Smith is a technology executive serving as CEO of ABC Technologies and beneficial owner of ABC Holdings. Research identified a multi-company network spanning three organizations. No sanctions or regulatory matters were identified in the public sources checked. One historical misconduct allegation was identified and was not adjudicated.',
    positiveSignals: [
        'Consistent, verifiable career history across public sources',
        'No sanctions, PEP, or regulatory matches in the lists checked',
        'Multiple directorships suggest experienced governance background',
    ],
    concerns: [
        'Historical misconduct allegation at a previous employer (not adjudicated)',
        'Beneficial ownership of a UK holding company adds cross-border complexity',
    ],
    limitations: [
        'Shareholdings below public disclosure thresholds could not be verified',
    ],
    findings: [
        {
            id: 'pf1', claim: 'Serves as CEO of ABC Technologies', category: 'Current Positions',
            severity: 'low', date: '2021', sourceIds: ['ps2'], confidence: 'high',
            detail: 'Listed as CEO on the company leadership page and in press coverage since 2021.',
            whyItMatters: 'Confirms the primary current role used in public materials.',
        },
        {
            id: 'pf2', claim: 'Reported beneficial owner of ABC Holdings Ltd. (80%)', category: 'Ownership',
            severity: 'elevated', date: '2026', sourceIds: ['ps1'], confidence: 'medium',
            detail: 'Registry-derived reporting indicates an 80% beneficial interest via an intermediate structure. Not independently verified.',
            whyItMatters: 'UBO positions in cross-border structures are a standard AML diligence focus.',
        },
        {
            id: 'pf3', claim: 'Historical misconduct allegation at previous employer', category: 'Adverse Media',
            severity: 'medium', date: '2023', sourceIds: ['ps3'], confidence: 'medium',
            detail: 'A 2023 news article describes allegations made during his tenure at a prior company. No charges were filed and the matter was not adjudicated.',
            whyItMatters: 'Allegations are not confirmed findings. Reference checks and a direct management interview are recommended.',
        },
    ],
    risks: [
        { id: 'pr1', category: 'Individual', level: 'medium', explanation: 'Experienced executive with a verifiable career history.', whyItMatters: 'Profile appears genuine and consistent.', findingIds: ['pf1'], sourceIds: ['ps2'] },
        { id: 'pr2', category: 'Ownership', level: 'elevated', explanation: 'Reported beneficial owner of a cross-border holding structure.', whyItMatters: 'UBO identification is required before transaction decisions.', findingIds: ['pf2'], sourceIds: ['ps1'] },
        { id: 'pr3', category: 'Sanctions', level: 'low', explanation: 'No sanctions or PEP matches identified in the public lists checked.', whyItMatters: 'No sanctions exposure found.', findingIds: [], sourceIds: ['ps4'] },
        { id: 'pr4', category: 'Reputation', level: 'medium', explanation: 'One historical, non-adjudicated allegation received press coverage.', whyItMatters: 'Context should be obtained directly from the individual.', findingIds: ['pf3'], sourceIds: ['ps3'] },
    ],
    people: [],
    organizations: [
        { id: 'porg-abc', type: 'organization', name: 'ABC Technologies Ltd.', subtitle: 'CEO', country: 'United States', riskLevel: 'medium' },
        { id: 'porg-holdings', type: 'organization', name: 'ABC Holdings Ltd.', subtitle: 'Beneficial Owner', country: 'United Kingdom', riskLevel: 'medium' },
        { id: 'porg-xyz', type: 'organization', name: 'XYZ Ventures', subtitle: 'Investor', country: 'United States', riskLevel: 'low' },
    ],
    relationships: [
        { id: 'prel1', aId: 'p-john-full', bId: 'porg-abc', type: 'CEO_OF', direct: true, verification: 'verified', date: '2021', sourceIds: ['ps2'] },
        { id: 'prel2', aId: 'p-john-full', bId: 'porg-holdings', type: 'BENEFICIAL_OWNER_OF', ownershipPct: 80, direct: false, verification: 'reported', date: '2026', sourceIds: ['ps1'] },
        { id: 'prel3', aId: 'p-john-full', bId: 'porg-xyz', type: 'INVESTOR_IN', ownershipPct: null, direct: true, verification: 'inferred', date: '', sourceIds: ['ps5'] },
        { id: 'prel4', aId: 'p-john-full', bId: 'porg-abc', type: 'FORMER_DIRECTOR_OF', direct: true, verification: 'verified', date: '2019-2021', sourceIds: ['ps2'] },
    ],
    adverseMedia: [
        {
            id: 'pam1', headline: 'Misconduct allegation reported at previous employer',
            status: 'allegation', severity: 'medium', date: '2023',
            summary: 'Press coverage of allegations made during his tenure at a prior company. No charges were filed and the matter was not adjudicated.',
            whyItMatters: 'Allegations are not confirmed findings and should not be treated as facts.',
            confidence: 'medium', sourceIds: ['ps3'],
        },
    ],
    news: [
        { id: 'pn1', headline: 'New CEO appointment at ABC Technologies', sentiment: 'positive', date: '2021', summary: 'Press release coverage of the CEO appointment.', sourceIds: ['ps2'] },
        { id: 'pn2', headline: 'Panel appearance at regional tech conference', sentiment: 'neutral', date: '2024', summary: 'Listed as panelist in conference materials.', sourceIds: ['ps6'] },
    ],
    social: [
        { platform: 'linkedin', summary: 'Profile lists current CEO role and prior directorships; consistent with other sources.', url: 'https://linkedin.com/in/johnsmith' },
        { platform: 'x_twitter', handle: '@johnsmith', followers: 2100, summary: 'Low-activity account; occasional industry commentary.' },
    ],
    sources: [
        src('ps1', 'UK companies registry (derived reporting)', 'government', '2026', '', 'Registry-derived beneficial ownership data.'),
        src('ps2', 'Company leadership page & press coverage', 'company', '2026', '', 'Current role and directorship history.'),
        src('ps3', 'National business daily', 'news', '2023', '', 'Report on the misconduct allegation at a previous employer.'),
        src('ps4', 'Sanctions/PEP screening (public lists)', 'government', '2026', '', 'No matches found in the public lists checked.'),
        src('ps5', 'Venture capital database', 'other', '2025', '', 'Investor listing suggesting an investment relationship.'),
        src('ps6', 'Tech conference agenda', 'other', '2024', '', 'Panelist listing confirming public profile.'),
    ],
    coverage: [
        { area: 'identity', state: 'found', sourceCount: 3 },
        { area: 'ownership', state: 'partial', sourceCount: 1 },
        { area: 'management', state: 'found', sourceCount: 2 },
        { area: 'legal', state: 'not_verified', sourceCount: 1 },
        { area: 'regulatory', state: 'not_verified', sourceCount: 1 },
        { area: 'adverse_media', state: 'found', sourceCount: 1 },
        { area: 'news', state: 'found', sourceCount: 2 },
        { area: 'social', state: 'found', sourceCount: 2 },
        { area: 'technology', state: 'not_applicable', sourceCount: 0 },
        { area: 'geographic', state: 'found', sourceCount: 1 },
    ],
};

// Recent investigations list for the landing page (matches Supabase row shape)
export const RECENT_DEMO = [
    { id: 9001, entityType: 'organization', entityName: 'ABC Technologies', status: 'completed', overallRisk: 'medium', createdAt: new Date(Date.now() - 2 * 3600e3).toISOString() },
    { id: 9002, entityType: 'individual', entityName: 'John Smith', status: 'completed', overallRisk: 'low', createdAt: new Date(Date.now() - 26 * 3600e3).toISOString() },
    { id: 9003, entityType: 'organization', entityName: 'XYZ Holdings', status: 'completed', overallRisk: 'high', createdAt: new Date('2026-08-29T10:00:00Z').toISOString() },
];

export function demoResultFor(entityType) {
    return entityType === ENTITY_TYPES.INDIVIDUAL ? PERSON_DEMO_RESULT : ORG_DEMO_RESULT;
}
