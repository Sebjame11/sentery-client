// ─── Due Diligence Type Definitions ───
// Structured data model for investigations. The UI renders from these shapes,
// never from hardcoded HTML sections.

export const ENTITY_TYPES = { ORGANIZATION: 'organization', INDIVIDUAL: 'individual' };
export const RISK_LEVELS = ['low', 'medium', 'elevated', 'high'];
export const RESEARCH_STATUSES = ['queued', 'researching', 'processing', 'completed', 'failed'];
export const INFO_STATES = ['found', 'partial', 'not_verified', 'not_applicable', 'not_researched'];

export const RELATIONSHIP_TYPES = [
    'OWNS', 'BENEFICIAL_OWNER_OF', 'SHAREHOLDER_OF', 'CONTROLS', 'DIRECTOR_OF',
    'FOUNDER_OF', 'CEO_OF', 'INVESTOR_IN', 'PARENT_OF', 'SUBSIDIARY_OF',
    'RELATED_TO', 'FORMER_DIRECTOR_OF',
];

export const SOURCE_CATEGORIES = ['official', 'government', 'legal', 'news', 'company', 'linkedin', 'x_twitter', 'reddit', 'other'];

export const ADVERSE_STATUSES = ['allegation', 'accusation', 'investigation', 'lawsuit', 'regulatory_action', 'criminal_charge', 'confirmed_finding', 'resolved_matter'];

export const COVERAGE_AREAS = [
    'identity', 'ownership', 'management', 'legal', 'regulatory',
    'adverse_media', 'news', 'social', 'technology', 'geographic',
];

/**
 * @typedef {Object} DDSource
 * @property {string} id
 * @property {string} name
 * @property {string} category  - one of SOURCE_CATEGORIES
 * @property {string} [date]
 * @property {string} [url]
 * @property {string} [summary]
 */

/**
 * @typedef {Object} DDFinding
 * @property {string} id
 * @property {string} claim       - short human claim
 * @property {string} category     - e.g. 'Ownership', 'Legal', 'Adverse Media'
 * @property {string} severity     - one of RISK_LEVELS
 * @property {string} [date]
 * @property {Array<string>} sourceIds - ids into investigation.sources
 * @property {string} [confidence] - 'high' | 'medium' | 'low'
 * @property {string} [detail]     - longer explanation
 * @property {string} [whyItMatters]
 */

/**
 * @typedef {Object} DDRiskAssessment
 * @property {string} id
 * @property {string} category    - e.g. 'Company', 'Ownership', 'Sanctions'
 * @property {string} level       - one of RISK_LEVELS
 * @property {string} explanation
 * @property {string} [whyItMatters]
 * @property {Array<string>} findingIds
 * @property {Array<string>} sourceIds
 * @property {string} [limitations]
 */

/**
 * @typedef {Object} DDRelationship
 * @property {string} id
 * @property {string} aId      - entity id (person or org)
 * @property {string} bId      - entity id
 * @property {string} type     - one of RELATIONSHIP_TYPES
 * @property {number} [ownershipPct]
 * @property {boolean} [direct]          - direct vs indirect ownership
 * @property {string} [verification]     - 'verified' | 'reported' | 'inferred' | 'not_verified'
 * @property {string} [date]
 * @property {Array<string>} sourceIds
 */

/**
 * @typedef {Object} DDEntity
 * @property {string} id
 * @property {'organization'|'individual'} type
 * @property {string} name
 * @property {string} [subtitle]  - e.g. 'CEO — ABC Technologies'
 * @property {string} [country]
 * @property {string} [riskLevel]
 * @property {Object} [extra]
 */

/**
 * @typedef {Object} DDAdverseMediaItem
 * @property {string} id
 * @property {string} headline
 * @property {string} status    - one of ADVERSE_STATUSES
 * @property {string} severity   - one of RISK_LEVELS
 * @property {string} [date]
 * @property {string} summary
 * @property {string} [whyItMatters]
 * @property {string} [confidence]
 * @property {Array<string>} sourceIds
 */

/**
 * @typedef {Object} DDNewsItem
 * @property {string} id
 * @property {string} headline
 * @property {'positive'|'neutral'|'negative'|'adverse'} sentiment
 * @property {string} [date]
 * @property {string} [summary]
 * @property {Array<string>} sourceIds
 */

/**
 * @typedef {Object} DDFundingRound
 * @property {string} id
 * @property {string} round      - e.g. 'Series A'
 * @property {number} [amount]
 * @property {number} [year]
 * @property {Array<string>} [investors]
 */

/**
 * @typedef {Object} DDSocialSignal
 * @property {string} platform   - 'x_twitter' | 'reddit' | 'linkedin' | 'github' | 'youtube'
 * @property {string} [handle]
 * @property {number} [followers]
 * @property {string} [summary]
 * @property {string} [url]
 */

/**
 * @typedef {Object} DDResearchCoverage
 * @property {string} area       - one of COVERAGE_AREAS
 * @property {'found'|'partial'|'not_verified'|'not_applicable'|'not_researched'} state
 * @property {number} sourceCount
 */

/**
 * @typedef {Object} DDResearchResult
 * The full structured result stored as JSONB in due_diligence_investigations.research_result
 * @property {DDEntity} entity
 * @property {string} [tagline]      - 'United States · Technology · Founded 2018'
 * @property {string} [summary]      - executive summary
 * @property {Array<string>} [positiveSignals]
 * @property {Array<string>} [concerns]
 * @property {Array<DDFinding>} findings
 * @property {Array<DDRiskAssessment>} risks
 * @property {Array<DDEntity>} people
 * @property {Array<DDEntity>} organizations
 * @property {Array<DDRelationship>} relationships
 * @property {Array<DDAdverseMediaItem>} adverseMedia
 * @property {Array<DDNewsItem>} news
 * @property {Array<DDFundingRound>} [funding]
 * @property {number} [totalFunding]
 * @property {Array<DDSocialSignal>} [social]
 * @property {Array<DDSource>} sources
 * @property {Array<DDResearchCoverage>} coverage
 * @property {Array<string>} [limitations]
 */

/**
 * @typedef {Object} DDInvestigation
 * @property {number|string} id
 * @property {string} userId
 * @property {'organization'|'individual'} entityType
 * @property {string} entityName
 * @property {string} status            - one of RESEARCH_STATUSES
 * @property {string} [overallRisk]     - one of RISK_LEVELS
 * @property {string} [summary]
 * @property {DDResearchResult} [researchResult]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

// ─── Risk level helpers ───
export const RISK_ORDER = { low: 0, medium: 1, elevated: 2, high: 3 };
export const RISK_LABELS = { low: 'Low', medium: 'Medium', elevated: 'Elevated', high: 'High' };
export const RISK_COLORS = {
    low: 'var(--success)',
    medium: 'var(--warning)',
    elevated: '#e07268',
    high: 'var(--danger)',
};
export const RISK_TINTS = {
    low: 'var(--success-tint)',
    medium: 'var(--warning-tint)',
    elevated: 'var(--danger-tint)',
    high: 'var(--danger-tint)',
};

export function riskColor(level) { return RISK_COLORS[level] || 'var(--text-tertiary)'; }
export function riskTint(level) { return RISK_TINTS[level] || 'var(--bg-sunken)'; }
export function riskLabel(level) { return RISK_LABELS[level] || 'Not assessed'; }
export function maxRisk(levels) {
    return levels.filter(Boolean).reduce((m, l) => (RISK_ORDER[l] > RISK_ORDER[m] ? l : m), 'low');
}
