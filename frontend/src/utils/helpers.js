import { currencySymbol, getCurrencyCode } from './currency';

export function formatMoney(n) {
    n = Number(n) || 0;
    const s = currencySymbol(getCurrencyCode());
    return n >= 1000000 ? s + (n/1000000).toFixed(1) + 'M' : n >= 1000 ? s + (n/1000).toFixed(0) + 'K' : s + Math.round(n).toLocaleString();
}

import { formatDistanceToNow, format } from 'date-fns';

export function timeAgo(d) {
    if (!d) return '';
    const date = new Date(d);
    const diff = Date.now() - date.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 86400000 * 7) return formatDistanceToNow(date, { addSuffix: true });
    return format(date, 'MMM d');
}

export function daysInStage(p) {
    const date = p.stageEnteredAt || p.createdAt || p.created_at;
    if (!date) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));
}

export function daysClass(d) {
    return d <= 3 ? 'fresh' : d <= 7 ? 'warm' : 'hot';
}

export function esc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function sanitizeEmailHtml(html) {
    if (!html) return '';
    let h = html;
    h = h.replace(/<script[\s\S]*?<\/script>/gi, '');
    h = h.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
    h = h.replace(/ on\w+="[^"]*"/gi, '');
    h = h.replace(/ on\w+='[^']*'/gi, '');
    h = h.replace(/javascript:/gi, '');
    h = h.replace(/href="\/(?!\/)/gi, 'href="https://');
    h = h.replace(/src="\/(?!\/)/gi, 'src="https://');
    return h;
}

export function renderPlainText(text) {
    if (!text) return '';
    const lines = text.split('\n');
    let html = '';
    let inQuote = false;
    for (const line of lines) {
        const trimmed = line.replace(/\r$/, '');
        if (/^>/.test(trimmed)) {
            if (!inQuote) { html += '<blockquote style="margin:4px 0;padding-left:12px;border-left:2px solid #ccc;color:#666;">'; inQuote = true; }
            html += esc(trimmed.replace(/^>\s?/, '')) + '<br>';
        } else {
            if (inQuote) { html += '</blockquote>'; inQuote = false; }
            html += (trimmed ? esc(trimmed) : '<br>') + '\n';
        }
    }
    if (inQuote) html += '</blockquote>';
    return html;
}

export function linkedinUrl(value) {
    if (!value) return '';
    const v = String(value).trim();
    if (/^https?:\/\//i.test(v)) return v;
    return 'https://' + v.replace(/^\/\//, '');
}

export function getReminders(prospects) {
    const followUpDays = parseInt(localStorage.getItem('vn_followUpDays') || '5');
    const now = Date.now();
    return prospects.filter(p => {
        if (p.stage === 'won' || p.stage === 'lost') return false;
        if (!p.touchpoints || !p.touchpoints.length) {
            return daysInStage(p) >= followUpDays;
        }
        const last = p.touchpoints.reduce((a, t) => new Date(t.date) > new Date(a.date) ? t : a);
        const daysSince = Math.floor((now - new Date(last.date).getTime()) / 86400000);
        return daysSince >= followUpDays;
    });
}

export function getStreak() {
    const data = JSON.parse(localStorage.getItem('vn_dailyTouches') || '{}');
    const goal = parseInt(localStorage.getItem('vn_dailyGoal') || '10');
    let streak = 0;
    const d = new Date();
    while (true) {
        const key = d.toISOString().slice(0, 10);
        if ((data[key] || 0) >= goal) { streak++; d.setDate(d.getDate() - 1); } else break;
    }
    return streak;
}

export function getDailyTouches() {
    return JSON.parse(localStorage.getItem('vn_dailyTouches') || '{}');
}

const COUNTRY_CODES = {
    'United States':'us','Canada':'ca','United Kingdom':'gb','Germany':'de','France':'fr',
    'Netherlands':'nl','Spain':'es','Italy':'it','Sweden':'se','Norway':'no','Finland':'fi',
    'Denmark':'dk','Ireland':'ie','Belgium':'be','Switzerland':'ch','Austria':'at','Poland':'pl',
    'Portugal':'pt','Czech Republic':'cz','Japan':'jp','China':'cn','India':'in','Australia':'au',
    'South Korea':'kr','Singapore':'sg','New Zealand':'nz','Indonesia':'id','Thailand':'th',
    'Vietnam':'vn','Malaysia':'my','Philippines':'ph','Brazil':'br','Argentina':'ar',
    'Colombia':'co','Chile':'cl','Peru':'pe','Mexico':'mx','UAE':'ae','Saudi Arabia':'sa',
    'Israel':'il','South Africa':'za','Nigeria':'ng','Egypt':'eg','Kenya':'ke',
    'Russia':'ru','Turkey':'tr','Greece':'gr','Romania':'ro','Ukraine':'ua','Hungary':'hu',
    'Taiwan':'tw','Hong Kong':'hk','Pakistan':'pk','Bangladesh':'bd',
};

export function countryFlag(country) {
    const code = COUNTRY_CODES[country];
    if (!code) return null;
    return 'fi fi-' + code;
}

export const ALL_COUNTRIES = Object.keys(COUNTRY_CODES).sort();

export function countryCode(name) {
    return COUNTRY_CODES[name] || null;
}

// ── Merge prospects + deals into one array for analytics pages ──
// Deals table is the source for deal-specific fields (stage, dealValue, closeDate).
// Prospects table is the source for touchpoints, tier, angle, tags.
// When a deal has a matching prospect (by primaryContactId or name+company),
// merge them (prospect wins for touchpoints, deal wins for deal fields).
// When no match, add the deal as a new item so it shows in analytics.
const STAGE_TO_TIER = { lead:'cold', contacted:'cold', engaged:'warm', meeting:'warm', proposal:'hot', negotiation:'hot', won:'hot', lost:'cold' };

export function getUnifiedDeals(prospects, deals, companies) {
    if (!deals || deals.length === 0) return prospects || [];
    const companyMap = new Map();
    (companies || []).forEach(c => companyMap.set(String(c.id), c));

    const normalizeDeal = (d) => {
        const company = companyMap.get(String(d.company_id));
        const stage = d.stage || 'lead';
        return {
            id: 'deal-' + d.id,
            _dealId: d.id,
            name: d.primaryContactName || d.primary_contact_name || d.name || '',
            company: company?.name || d.name || '',
            stage,
            dealValue: d.dealValue ?? d.deal_value ?? 0,
            stageEnteredAt: d.stageEnteredAt || d.stage_entered_at || d.createdAt || d.created_at || null,
            createdAt: d.createdAt || d.created_at || null,
            closeDate: d.closeDate || d.close_date || null,
            priority: d.priority || 'medium',
            notes: d.notes || '',
            angle: '',
            tier: STAGE_TO_TIER[stage] || 'cold',
            touchpoints: [],
            tags: [],
            title: '',
            email: '',
            phone: '',
            linkedin: '',
            outcomeReason: d.closedWonReason || d.closed_won_reason || d.closedLostReason || d.closed_lost_reason || '',
            dealType: d.dealType || d.deal_type || '',
        };
    };

    const results = [];
    const seenProspectIds = new Set();

    for (const p of (prospects || [])) {
        results.push(p);
        seenProspectIds.add(String(p.id));
    }

    for (const d of (deals || [])) {
        const deal = normalizeDeal(d);
        let matchedProspect = null;

        // Match by primaryContactId
        const contactId = d.primaryContactId || d.primary_contact_id;
        if (contactId) {
            matchedProspect = prospects.find(p => String(p.id) === String(contactId));
        }
        // Match by name + company
        if (!matchedProspect && deal.name) {
            const dName = deal.name.toLowerCase().trim();
            const dCompany = deal.company.toLowerCase().trim();
            matchedProspect = prospects.find(p => {
                const pName = (p.name || '').toLowerCase().trim();
                const pCompany = (p.company || '').toLowerCase().trim();
                return pName === dName && (!dCompany || pCompany === dCompany);
            });
        }

        if (matchedProspect) {
            // Merge: deal provides stage/amount, prospect provides touchpoints/tier/angle
            const idx = results.findIndex(r => String(r.id) === String(matchedProspect.id));
            if (idx >= 0) {
                const merged = { ...results[idx] };
                merged.stage = deal.stage;
                merged.dealValue = deal.dealValue || merged.dealValue;
                merged.closeDate = deal.closeDate || merged.closeDate;
                merged.priority = deal.priority || merged.priority;
                merged.notes = deal.notes || merged.notes;
                merged.tier = merged.tier || deal.tier;
                merged._dealId = d.id;
                if (!merged.stageEnteredAt) merged.stageEnteredAt = deal.stageEnteredAt;
                if (!merged.createdAt) merged.createdAt = deal.createdAt;
                // Keep touchpoints from prospect (already set)
                results[idx] = merged;
            }
        } else {
            results.push(deal);
        }
    }

    return results;
}
