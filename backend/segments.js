// ─── Sentery Segment Engine ───
// Server-side contact segmentation: rules are stored as nested JSON groups
// (ALL / ANY / NOT) and compiled to a single parameterized SQL query per
// evaluation — no client-side filtering, scales to large contact databases.
//
// The engine is deliberately independent of the frontend so the MCP server
// can reuse it (create/list/run segments from natural-language requests).
//
// Requires the migration in backend/segments.sql (Supabase SQL editor):
//   - segments, custom_fields, tasks tables
//   - prospects.updated_at / industry / lead_source / city / province / expected_close_date
//   - segment_query(text, jsonb) RPC — executes compiled SQL with bound params
//     (service_role only; anon/authenticated are revoked).
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { logActivity, userNameOf } from './activity.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Table availability (graceful degradation) ───
const tableCache = { segments: null, custom_fields: null, tasks: null };
async function tableExists(table) {
  if (tableCache[table] !== null) return tableCache[table];
  try {
    const { error } = await sb.from(table).select('id').limit(1);
    tableCache[table] = !error;
  } catch {
    tableCache[table] = false;
  }
  return tableCache[table];
}

// ─── Field catalog (shared with the MCP server and the frontend) ───
export const FIELD_DEFS = [
  { field: 'name',        label: 'Full name',        group: 'Contact',  type: 'text' },
  { field: 'first_name',  label: 'First name',       group: 'Contact',  type: 'text' },
  { field: 'last_name',   label: 'Last name',        group: 'Contact',  type: 'text' },
  { field: 'email',       label: 'Email',            group: 'Contact',  type: 'text' },
  { field: 'phone',       label: 'Phone',            group: 'Contact',  type: 'text' },
  { field: 'title',       label: 'Job title',        group: 'Contact',  type: 'text' },
  { field: 'company',     label: 'Company',          group: 'Contact',  type: 'text' },
  { field: 'industry',    label: 'Industry',         group: 'Contact',  type: 'text' },
  { field: 'lead_source', label: 'Lead source',      group: 'Contact',  type: 'text' },
  { field: 'city',        label: 'City',             group: 'Contact',  type: 'text' },
  { field: 'province',    label: 'Province / State', group: 'Contact',  type: 'text' },
  { field: 'country',     label: 'Country',          group: 'Contact',  type: 'multienum' },
  { field: 'owner',       label: 'Contact owner',    group: 'Contact',  type: 'enum' },
  { field: 'tags',        label: 'Tags',             group: 'Contact',  type: 'multienum' },
  { field: 'created_at',  label: 'Created date',     group: 'Contact',  type: 'date' },
  { field: 'updated_at',  label: 'Updated date',     group: 'Contact',  type: 'date' },
  { field: 'stage',       label: 'Status',           group: 'Deal',     type: 'enum' },
  { field: 'tier',        label: 'Tier',             group: 'Deal',     type: 'enum' },
  { field: 'deal_value',  label: 'Deal value',       group: 'Deal',     type: 'number' },
  { field: 'stage_entered_at', label: 'Stage entered date', group: 'Deal', type: 'date' },
  { field: 'expected_close_date', label: 'Expected close date', group: 'Deal', type: 'date' },
  { field: 'activity_count', label: 'Activity count', group: 'Activity', type: 'number' },
  { field: 'last_activity', label: 'Last activity date', group: 'Activity', type: 'date' },
  { field: 'last_call',   label: 'Last call date',   group: 'Activity', type: 'date' },
  { field: 'call_count',  label: 'Call count',       group: 'Activity', type: 'number' },
  { field: 'has_call',    label: 'Has had a call',   group: 'Activity', type: 'bool' },
  { field: 'has_meeting', label: 'Has had a meeting', group: 'Activity', type: 'bool' },
  { field: 'has_open_task', label: 'Has open tasks', group: 'Activity', type: 'bool' },
  { field: 'has_overdue_task', label: 'Has overdue tasks', group: 'Activity', type: 'bool' },
  { field: 'has_email_activity', label: 'Has email activity', group: 'Email', type: 'bool' },
  { field: 'has_no_email_activity', label: 'Has no email activity', group: 'Email', type: 'bool' },
  { field: 'email_count', label: 'Email count',      group: 'Email',    type: 'number' },
  { field: 'last_email',  label: 'Last email date',  group: 'Email',    type: 'date' },
  { field: 'response_count', label: 'Reply count',   group: 'Email',    type: 'number' },
  { field: 'last_reply',  label: 'Last reply date',  group: 'Email',    type: 'date' },
];

// ─── Company segment fields (companies table) ───
export const COMPANY_FIELD_DEFS = [
  { field: 'name',        label: 'Company name',    group: 'Company',   type: 'text' },
  { field: 'domain',      label: 'Domain',          group: 'Company',   type: 'text' },
  { field: 'industry',    label: 'Industry',        group: 'Company',   type: 'text' },
  { field: 'company_size',label: 'Company size',    group: 'Company',   type: 'text' },
  { field: 'company_type',label: 'Company type',    group: 'Company',   type: 'text' },
  { field: 'city',       label: 'City',             group: 'Company',   type: 'text' },
  { field: 'region',     label: 'Region',           group: 'Company',   type: 'text' },
  { field: 'country',    label: 'Country',          group: 'Company',   type: 'text' },
  { field: 'annual_revenue', label: 'Annual revenue', group: 'Company', type: 'number' },
  { field: 'tags',       label: 'Tags',             group: 'Company',   type: 'multienum' },
  { field: 'created_at', label: 'Created date',     group: 'Company',   type: 'date' },
  { field: 'updated_at', label: 'Updated date',     group: 'Company',   type: 'date' },
  // deal aggregates across the company
  { field: 'open_deals',   label: 'Open deals count',    group: 'Company deals', type: 'number' },
  { field: 'total_deal_value', label: 'Total deal value', group: 'Company deals', type: 'number' },
  { field: 'has_open_deal',label: 'Has open deal',      group: 'Company deals', type: 'bool' },
  { field: 'last_deal_activity', label: 'Last deal activity', group: 'Company deals', type: 'date' },
];

export const OPERATORS = {
  text: [
    { op: 'is', label: 'Is' },
    { op: 'is_not', label: 'Is not' },
    { op: 'contains', label: 'Contains' },
    { op: 'not_contains', label: 'Does not contain' },
    { op: 'starts_with', label: 'Starts with' },
    { op: 'is_empty', label: 'Is empty' },
    { op: 'is_not_empty', label: 'Is not empty' },
  ],
  number: [
    { op: 'eq', label: 'Equals' },
    { op: 'gt', label: 'Greater than' },
    { op: 'lt', label: 'Less than' },
    { op: 'gte', label: 'Greater than or equal' },
    { op: 'lte', label: 'Less than or equal' },
    { op: 'between', label: 'Between' },
  ],
  date: [
    { op: 'exact', label: 'Is' },
    { op: 'before', label: 'Before' },
    { op: 'after', label: 'After' },
    { op: 'within_days', label: 'Within the last (days)' },
    { op: 'older_than', label: 'More than (days) ago' },
    { op: 'between', label: 'Between' },
  ],
  enum: [
    { op: 'is', label: 'Is' },
    { op: 'is_not', label: 'Is not' },
    { op: 'in', label: 'Is any of' },
  ],
  multienum: [
    { op: 'contains_any', label: 'Contains any of' },
    { op: 'contains_all', label: 'Contains all of' },
    { op: 'contains_none', label: 'Contains none of' },
  ],
  bool: [{ op: 'is', label: 'Is' }],
};

export const STAGES = ['lead', 'contacted', 'engaged', 'meeting', 'proposal', 'negotiation', 'won', 'lost'];
export const TIERS = ['hot', 'warm', 'cold'];

// ─── SQL compiler ───
// Builds `WHERE` fragments with $n placeholders. Params are appended to `params`
// in placeholder order, starting from $1 = workspace_id (pushed by the caller).
// Unknown fields/ops now THROW so callers can return a 400 instead of silently
// dropping the condition (which made segments match everyone).
export function compileNode(node, customFields, params, opts = {}) {
  if (!node || !Array.isArray(node.conditions) || node.conditions.length === 0) {
    return 'true';
  }
  const logic = (node.logic || 'ALL').toUpperCase();
  const parts = [];
  const errors = [];
  for (const c of node.conditions) {
    try {
      const sql = (c.conditions && Array.isArray(c.conditions))
        ? compileNode(c, customFields, params, opts)
        : compileCondition(c, customFields, params, opts);
      if (sql) parts.push('(' + sql + ')');
    } catch (e) {
      errors.push(e.message);
    }
  }
  if (errors.length) throw new Error(errors[0]);
  if (parts.length === 0) return 'true';
  if (logic === 'ANY') return parts.join(' OR ');
  if (logic === 'NOT') return 'NOT (' + parts.join(' AND ') + ')';
  return parts.join(' AND ');
}

function compileCondition(c, customFields, params, opts = {}) {
  const { field, op } = c;
  if (!field || !op) throw new Error('Condition missing field or operator');
  let value = c.value;

  // Reject empty-string values that would produce invalid SQL casts
  const badValue = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  const needsValue = !['is_empty', 'is_not_empty'].includes(op);
  const ph = () => `$${params.push(value)}`;
  const phVal = (v) => `$${params.push(v)}`;

  // ── custom fields (values keyed by definition id in prospects.custom_fields) ──
  if (field.startsWith('cf:')) {
    const id = field.slice(3);
    if (!/^\d+$/.test(String(id))) throw new Error(`Invalid custom field id "${id}"`);
    const def = customFields[id];
    const type = (def && def.type) || 'text';
    if (type === 'number') {
      const expr = `CASE WHEN p.custom_fields->>'${id}' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (p.custom_fields->>'${id}')::numeric END`;
      return numCond(expr, op, value, ph, phVal);
    }
    if (type === 'date') {
      const expr = `CASE WHEN p.custom_fields->>'${id}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN (p.custom_fields->>'${id}')::date END`;
      return dateCond(expr, op, value, false, ph, phVal);
    }
    if (type === 'checkbox') {
      if (op !== 'is') throw new Error(`Checkbox fields only support "is"`);
      const wantTrue = value === true || value === 'true';
      return wantTrue
        ? `p.custom_fields->>'${id}' = 'true'`
        : `(p.custom_fields->>'${id}' IS DISTINCT FROM 'true')`;
    }
    return textCond(`p.custom_fields->>'${id}'`, op, value, ph, phVal);
  }

  const def = FIELD_DEFS.find(f => f.field === field);
  const type = (def && def.type) || 'text';

  // ── boolean (has / has not) conditions ──
  if (type === 'bool') {
    const want = value === true || value === 'true' || value === 'yes';
    switch (field) {
      case 'has_email_activity': {
        const base = want ? 's.email_count > 0' : '(s.email_count = 0 OR s.email_count IS NULL)';
        return base;
      }
      case 'has_no_email_activity': {
        const base = want ? '(s.email_count = 0 OR s.email_count IS NULL)' : 's.email_count > 0';
        return base;
      }
      case 'has_call': {
        return want ? 's.call_count > 0' : '(s.call_count = 0 OR s.call_count IS NULL)';
      }
      case 'has_meeting': {
        const base = "EXISTS (SELECT 1 FROM public.meetings m WHERE m.prospect_id = p.id AND m.status = 'scheduled')";
        return want ? base : `NOT (${base})`;
      }
      case 'has_open_task': {
        if (!opts.tasksOk) return want ? 'false' : 'true';
        return want ? '(s2.open_tasks > 0)' : '(s2.open_tasks = 0 OR s2.open_tasks IS NULL)';
      }
      case 'has_overdue_task': {
        if (!opts.tasksOk) return want ? 'false' : 'true';
        return want ? '(s2.overdue_tasks > 0)' : '(s2.overdue_tasks = 0 OR s2.overdue_tasks IS NULL)';
      }
      default:
        throw new Error(`Unknown boolean field "${field}"`);
    }
  }

  // ── numbers ──
  if (type === 'number') {
    const expr = field === 'deal_value' ? 'p.deal_value'
      : field === 'activity_count' ? 's.activity_count'
      : field === 'email_count' ? 's.email_count'
      : field === 'response_count' ? 's.response_count'
      : field === 'call_count' ? 's.call_count'
      : 'p.deal_value';
    return numCond(expr, op, value, ph, phVal);
  }

  // ── dates ──
  if (type === 'date') {
    const activityDates = ['last_activity', 'last_email', 'last_reply', 'last_call'];
    const isActivity = activityDates.includes(field);
    const expr = field === 'expected_close_date' ? 'p.expected_close_date'
      : field === 'stage_entered_at' ? 'p.stage_entered_at'
      : field === 'created_at' ? 'p.created_at'
      : field === 'updated_at' ? 'COALESCE(p.updated_at, p.created_at)'
      : field === 'last_activity' ? 's.last_activity'
      : field === 'last_email' ? 's.last_email'
      : field === 'last_reply' ? 's.last_reply'
      : field === 'last_call' ? 's.last_call'
      : 'p.created_at';
    return dateCond(expr, op, value, isActivity, ph, phVal);
  }

  // ── enums (owner is a uuid; stage/tier are text) ──
  if (type === 'enum') {
    if (field === 'owner') {
      if (needsValue && badValue(value)) throw new Error('Owner condition requires a selected owner');
      if (op === 'in') {
        const list = (Array.isArray(value) ? value : [value]).filter(v => v && String(v).trim());
        if (!list.length) throw new Error('Owner condition requires at least one owner');
        return `p.created_by = ANY(${phVal(list)}::uuid[])`;
      }
      if (op === 'is') return `p.created_by = ${ph()}::uuid`;
      if (op === 'is_not') return `p.created_by IS DISTINCT FROM ${ph()}::uuid`;
      throw new Error(`Unsupported operator "${op}" for field "owner"`);
    }
    const expr = `p.${field}`;
    if (op === 'in') return `p.${field} = ANY(${phVal(Array.isArray(value) ? value : [value])}::text[])`;
    if (op === 'is') return `p.${field} = ${ph()}`;
    if (op === 'is_not') return `p.${field} <> ${ph()}`;
    throw new Error(`Unsupported operator "${op}" for field "${field}"`);
  }

  // ── multi-value arrays (tags, countries — jsonb columns, use ?| / ?&) ──
  if (type === 'multienum') {
    const expr = field === 'tags' ? 'p.tags' : 'p.countries';
    const arr = (Array.isArray(value) ? value : [value]).filter(v => v !== undefined && v !== null && String(v).trim() !== '');
    if (!arr.length) throw new Error(`Field "${field}" requires at least one value`);
    switch (op) {
      case 'contains_any': return `${expr} ?| ${phVal(arr)}`;
      case 'contains_all': return `${expr} ?& ${phVal(arr)}`;
      case 'contains_none': return `NOT (${expr} ?| ${phVal(arr)})`;
      default: throw new Error(`Unsupported operator "${op}" for multienum field "${field}" (use contains_any / contains_all / contains_none)`);
    }
  }

  // ── text (default) ──
  let expr;
  switch (field) {
    case 'first_name': expr = "split_part(COALESCE(p.name,''), ' ', 1)"; break;
    case 'last_name': expr = "reverse(split_part(reverse(COALESCE(p.name,'')), ' ', 1))"; break;
    case 'name': expr = 'p.name'; break;
    case 'title': expr = 'p.title'; break;
    case 'company': expr = 'p.company'; break;
    case 'email': expr = 'p.email'; break;
    case 'phone': expr = 'p.phone'; break;
    case 'industry': expr = 'p.industry'; break;
    case 'lead_source': expr = 'p.lead_source'; break;
    case 'city': expr = 'p.city'; break;
    case 'province': expr = 'p.province'; break;
    default: throw new Error(`Unknown field "${field}"`);
  }
  return textCond(expr, op, value, ph, phVal);
}

function textCond(expr, op, value, ph, phVal) {
  const e = `COALESCE(${expr},'')`;
  const badValue = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  switch (op) {
    case 'is': return `lower(${e}) = lower(${ph()})`;
    case 'is_not': return `lower(${e}) <> lower(${ph()})`;
    case 'contains':
    case 'not_contains':
    case 'starts_with': {
      if (badValue(value)) throw new Error(`Operator "${op}" requires a value`);
      const pat = op === 'contains' ? `%${value}%` : op === 'not_contains' ? `%${value}%` : `${value}%`;
      return op === 'not_contains' ? `${e} NOT ILIKE ${phVal(pat)}` : `${e} ILIKE ${phVal(pat)}`;
    }
    case 'is_empty': return `${e} = ''`;
    case 'is_not_empty': return `${e} <> ''`;
    default: throw new Error(`Unsupported text operator "${op}"`);
  }
}

function numCond(expr, op, value, ph, phVal) {
  const bad = v => v === undefined || v === null || String(v).trim() === '';
  if (op !== 'between' && bad(value)) throw new Error('Number condition requires a value');
  switch (op) {
    case 'eq': return `${expr} = ${ph()}`;
    case 'gt': return `${expr} > ${ph()}`;
    case 'lt': return `${expr} < ${ph()}`;
    case 'gte': return `${expr} >= ${ph()}`;
    case 'lte': return `${expr} <= ${ph()}`;
    case 'between': {
      const lo = Array.isArray(value) ? value[0] : null;
      const hi = Array.isArray(value) ? value[1] : null;
      if (bad(lo) || bad(hi)) throw new Error('Number range requires both min and max');
      return `${expr} BETWEEN ${phVal(lo)} AND ${phVal(hi)}`;
    }
    default: throw new Error(`Unsupported number operator "${op}"`);
  }
}

function dateCond(expr, op, value, nullGuard, ph, phVal) {
  const guard = nullGuard ? `${expr} IS NOT NULL AND ` : '';
  const bad = v => v === undefined || v === null || String(v).trim() === '';
  switch (op) {
    case 'exact':
      if (bad(value)) throw new Error('Date condition requires a date value');
      return `${guard}${expr}::date = ${ph()}::date`;
    case 'before': return `${guard}${expr}::date < ${ph()}::date`;
    case 'after': return `${guard}${expr}::date > ${ph()}::date`;
    case 'within_days':
    case 'older_than': {
      const days = parseInt(value);
      if (isNaN(days) || days < 0) throw new Error('Days value must be a non-negative number');
      return op === 'within_days'
        ? `${guard}${expr}::date >= (CURRENT_DATE - ${phVal(days)}::int)`
        : `${guard}${expr}::date < (CURRENT_DATE - ${phVal(days)}::int)`;
    }
    case 'between': {
      const lo = Array.isArray(value) ? value[0] : null;
      const hi = Array.isArray(value) ? value[1] : null;
      if (bad(lo) || bad(hi)) throw new Error('Date range requires both start and end dates');
      return `${guard}${expr}::date BETWEEN ${phVal(lo)}::date AND ${phVal(hi)}::date`;
    }
    default: throw new Error(`Unsupported date operator "${op}"`);
  }
}

// ─── Company segment compiler (companies table + deal aggregates) ───
function compileCompanyCondition(c, params, opts = {}) {
  const { field, op } = c;
  if (!field || !op) throw new Error('Condition missing field or operator');
  const value = c.value;
  const ph = () => `$${params.push(value)}`;
  const phVal = (v) => `$${params.push(v)}`;
  const def = COMPANY_FIELD_DEFS.find(f => f.field === field);
  if (!def) throw new Error(`Unknown company field "${field}"`);

  // Deal aggregates live in the company_stats CTE (alias `d`)
  if (def.group === 'Company deals') {
    const expr = field === 'open_deals' ? 'd.open_deals'
      : field === 'total_deal_value' ? 'd.total_deal_value'
      : field === 'last_deal_activity' ? 'd.last_deal_activity'
      : null;
    if (field === 'has_open_deal') {
      if (op !== 'is') throw new Error('has_open_deal only supports "is"');
      const want = value === true || value === 'true' || value === 'yes';
      return want ? 'd.open_deals > 0' : '(d.open_deals = 0 OR d.open_deals IS NULL)';
    }
    if (!expr) throw new Error(`Unknown company deal field "${field}"`);
    if (def.type === 'number') return numCond(expr, op, value, ph, phVal);
    return dateCond(expr, op, value, true, ph, phVal);
  }

  // bool
  if (def.type === 'bool') throw new Error(`Field "${field}" is not a boolean condition`);

  // multienum (tags)
  if (def.type === 'multienum') {
    const arr = (Array.isArray(value) ? value : [value]).filter(v => v !== undefined && v !== null && String(v).trim() !== '');
    if (!arr.length) throw new Error(`Field "${field}" requires at least one value`);
    switch (op) {
      case 'contains_any': return `c.tags ?| ${phVal(arr)}`;
      case 'contains_all': return `c.tags ?& ${phVal(arr)}`;
      case 'contains_none': return `NOT (c.tags ?| ${phVal(arr)})`;
      default: throw new Error(`Unsupported operator "${op}" for company tags (use contains_any / contains_all / contains_none)`);
    }
  }

  if (def.type === 'number') {
    // annual_revenue is a text column — cast safely (non-numeric → NULL)
    const expr = field === 'annual_revenue'
      ? `CASE WHEN c.annual_revenue ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN c.annual_revenue::numeric ELSE NULL END`
      : `c.${field}`;
    return numCond(expr, op, value, ph, phVal);
  }
  if (def.type === 'date') return dateCond(`c.${field}`, op, value, false, ph, phVal);
  return textCond(`c.${field}`, op, value, ph, phVal);
}

function compileCompanyNode(node, params, opts = {}) {
  if (!node || !Array.isArray(node.conditions) || node.conditions.length === 0) return 'true';
  const logic = (node.logic || 'ALL').toUpperCase();
  const parts = [];
  for (const c of node.conditions) {
    const sql = (c.conditions && Array.isArray(c.conditions))
      ? compileCompanyNode(c, params, opts)
      : compileCompanyCondition(c, params, opts);
    if (sql) parts.push('(' + sql + ')');
  }
  if (parts.length === 0) return 'true';
  if (logic === 'ANY') return parts.join(' OR ');
  if (logic === 'NOT') return 'NOT (' + parts.join(' AND ') + ')';
  return parts.join(' AND ');
}

// Deal aggregates per company (alias `d`), joined in company segment queries
const COMPANY_STATS_SQL = `
WITH company_stats AS (
  SELECT dl.company_id,
    count(*) FILTER (WHERE dl.stage NOT IN ('won','lost')) AS open_deals,
    COALESCE(sum(dl.deal_value) FILTER (WHERE dl.stage NOT IN ('won','lost')), 0) AS total_deal_value,
    max(dl.stage_entered_at) AS last_deal_activity
  FROM public.deals dl
  WHERE dl.workspace_id = $1 AND dl.company_id IS NOT NULL
  GROUP BY dl.company_id
)
`;

// ─── Company segment evaluation ───
export async function segmentCompanies(workspaceId, rules, page = 1, perPage = 10, includeContacts = false) {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const per = Math.min(Math.max(1, parseInt(perPage) || 10), 100);
  const params = [workspaceId];
  const compiled = compileCompanyNode(rules || { logic: 'ALL', conditions: [] }, params);
  const where = compiled === 'true' ? 'c.workspace_id = $1' : `c.workspace_id = $1 AND ${compiled}`;

  const base = `${COMPANY_STATS_SQL}SELECT c.id, c.name, c.domain, c.industry, c.company_size, c.annual_revenue, c.city, c.region, c.country, c.tags, c.created_at,
  d.open_deals, d.total_deal_value, d.last_deal_activity
FROM public.companies c
LEFT JOIN company_stats d ON d.company_id = c.id
WHERE ${where}`;

  const countRows = await runSql(`${COMPANY_STATS_SQL}SELECT count(*)::int AS count FROM public.companies c LEFT JOIN company_stats d ON d.company_id = c.id WHERE ${where}`, params);
  const total = countRows[0] ? countRows[0].count : 0;
  const rows = await runSql(`${base}
ORDER BY d.total_deal_value DESC NULLS LAST, c.name ASC
LIMIT ${per} OFFSET ${(pageNum - 1) * per}`, params);

  // Optionally resolve all contacts under matched companies (matched by company name)
  let contactCount = 0;
  let contacts = [];
  if (includeContacts && rows.length) {
    const names = rows.map(r => r.name);
    const phNames = names.map(n => params.push(n)).map(i => `\$${i}`).join(',');
    const cRows = await runSql(`SELECT p.id, p.name, p.email, p.title, p.company, p.stage, p.tier, p.deal_value, p.tags
FROM public.prospects p
WHERE p.workspace_id = $1 AND p.company = ANY(ARRAY[${phNames}]::text[])`, params);
    contacts = cRows || [];
    contactCount = contacts.length;
  }

  return { count: total, companies: rows, page: pageNum, perPage: per, ...(includeContacts ? { contactCount, contacts } : {}) };
}

// ─── Build the full query: { sql, params } ───
async function buildWhere(workspaceId, rules, opts = {}) {
  const customFields = (await loadCustomFields(workspaceId)).reduce((m, f) => { m[f.id] = f; return m; }, {});
  const params = [workspaceId];
  const compiled = compileNode(rules || { logic: 'ALL', conditions: [] }, customFields, params, opts);
  const where = compiled === 'true' ? 'p.workspace_id = $1' : `p.workspace_id = $1 AND ${compiled}`;
  return { where, params };
}

// touchpoint + task aggregates; $1 is the workspace id
const STATS_SQL = `
WITH contact_stats AS (
  SELECT tp.prospect_id,
    count(*) AS activity_count,
    max(tp.date) AS last_activity,
    count(*) FILTER (WHERE lower(tp.channel) = 'email') AS email_count,
    max(tp.date) FILTER (WHERE lower(tp.channel) = 'email') AS last_email,
    count(*) FILTER (WHERE lower(tp.channel) = 'email' AND lower(tp.outcome) IN ('replied','meeting')) AS response_count,
    max(tp.date) FILTER (WHERE lower(tp.channel) = 'email' AND lower(tp.outcome) IN ('replied','meeting')) AS last_reply,
    count(*) FILTER (WHERE lower(tp.channel) IN ('call','phone')) AS call_count,
    max(tp.date) FILTER (WHERE lower(tp.channel) IN ('call','phone')) AS last_call
  FROM public.touchpoints tp
  WHERE tp.prospect_id IN (SELECT id FROM public.prospects WHERE workspace_id = $1)
  GROUP BY tp.prospect_id
),
task_stats AS (
  SELECT t.prospect_id,
    count(*) FILTER (WHERE t.status = 'open') AS open_tasks,
    count(*) FILTER (WHERE t.status = 'open' AND t.due_date < CURRENT_DATE) AS overdue_tasks
  FROM public.tasks t
  WHERE t.workspace_id = $1
  GROUP BY t.prospect_id
)
`;

const STATS_SQL_NO_TASKS = STATS_SQL.replace(/,\ntask_stats AS[\s\S]*?\n\)\n/, '\n');

// ─── Run a raw segment query through the RPC (service-role only) ───
async function runSql(sql, params) {
  const { data, error } = await sb.rpc('segment_query', { query: sql, params });
  if (error) {
    if (/segment_query|Could not find the function/.test(error.message)) {
      throw new Error('Segments migration not applied — run backend/segments.sql in the Supabase SQL editor.');
    }
    throw error;
  }
  return data || [];
}

// ─── Count matches for a ruleset ───
export async function segmentCount(workspaceId, rules) {
  const tasksOk = await tableExists('tasks');
  const { where, params } = await buildWhere(workspaceId, rules, { tasksOk });
  const sql = `${tasksOk ? STATS_SQL : STATS_SQL_NO_TASKS}
SELECT count(*)::int AS count FROM public.prospects p
LEFT JOIN contact_stats s ON s.prospect_id = p.id${tasksOk ? '\nLEFT JOIN task_stats s2 ON s2.prospect_id = p.id' : ''}
WHERE ${where}`;
  const rows = await runSql(sql, params);
  return rows[0] ? rows[0].count : 0;
}

// ─── List matching contacts (paginated) ───
export async function segmentContacts(workspaceId, rules, page = 1, perPage = 10) {
  const tasksOk = await tableExists('tasks');
  const pageNum = Math.max(1, parseInt(page) || 1);
  const per = Math.min(Math.max(1, parseInt(perPage) || 10), 100);
  const { where, params } = await buildWhere(workspaceId, rules, { tasksOk });
  const countSql = `${tasksOk ? STATS_SQL : STATS_SQL_NO_TASKS}
SELECT count(*)::int AS count FROM public.prospects p
LEFT JOIN contact_stats s ON s.prospect_id = p.id${tasksOk ? '\nLEFT JOIN task_stats s2 ON s2.prospect_id = p.id' : ''}
WHERE ${where}`;
  const countRows = await runSql(countSql, params);
  const total = countRows[0] ? countRows[0].count : 0;
  const contactSql = `${tasksOk ? STATS_SQL : STATS_SQL_NO_TASKS}
SELECT p.id, p.name, p.email, p.company, p.title, p.stage, p.tier, p.deal_value, p.tags, p.countries, p.created_by, p.created_at, p.updated_at,
  s.last_activity, s.last_email, s.email_count, s.response_count, s.last_reply, s.last_call, s.call_count, s.activity_count${tasksOk ? ',\n  s2.open_tasks, s2.overdue_tasks' : ''}
FROM public.prospects p
LEFT JOIN contact_stats s ON s.prospect_id = p.id${tasksOk ? '\nLEFT JOIN task_stats s2 ON s2.prospect_id = p.id' : ''}
WHERE ${where}
ORDER BY s.last_activity DESC NULLS LAST, p.created_at DESC
LIMIT ${per} OFFSET ${(pageNum - 1) * per}`;
  const rows = await runSql(contactSql, params);

  // resolve owner display names
  const ids = [...new Set(rows.map(r => r.created_by).filter(Boolean))];
  let ownerNames = {};
  if (ids.length) {
    const { data: profs } = await sb.from('profiles').select('id, display_name').in('id', ids);
    ownerNames = (profs || []).reduce((m, o) => { m[o.id] = o.display_name; return m; }, {});
  }
  return {
    count: total,
    contacts: rows.map(r => ({ ...r, owner_name: ownerNames[r.created_by] || null })),
    page: pageNum,
    perPage: per,
  };
}

async function loadCustomFields(workspaceId) {
  try {
    const { data } = await sb.from('custom_fields').select('id, name, type, options, required')
      .eq('workspace_id', workspaceId).order('position', { ascending: true }).order('created_at', { ascending: true });
    return (data || []).map(f => ({ ...f, id: String(f.id) }));
  } catch {
    return [];
  }
}

// ─── REST router ───
export function segmentsRouter() {
  const router = Router();

  async function requireMember(req, res, next) {
    try {
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      if (!token) return res.status(401).json({ error: 'Not authenticated' });
      const { data: { user }, error } = await sb.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid session' });
      const wsId = Number(req.query.workspace_id || req.body.workspace_id);
      if (!wsId) return res.status(400).json({ error: 'workspace_id required' });
      const { data: member } = await sb.from('workspace_members')
        .select('role').eq('workspace_id', wsId).eq('user_id', user.id).maybeSingle();
      if (!member) return res.status(403).json({ error: 'Not a workspace member' });
      req.workspaceId = wsId;
      req.userId = user.id;
      req.isAdmin = member.role === 'admin';
      next();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  const needTable = async (res, table, hint) => {
    if (!(await tableExists(table))) {
      res.status(503).json({ error: hint || `Table "${table}" missing — run backend/segments.sql in the Supabase SQL editor.` });
      return false;
    }
    return true;
  };

  async function seedPresetsIfEmpty(workspaceId) {
    if (!(await tableExists('segments'))) return;
    const { count } = await sb.from('segments').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
    if (count > 0) return;
    const presets = [
      ['New Leads', 'Newly created leads from the last 30 days', { logic: 'ALL', conditions: [{ field: 'stage', op: 'is', value: 'lead' }, { field: 'created_at', op: 'within_days', value: 30 }] }],
      ['Hot Leads', 'Hot-tier prospects with an open pipeline', { logic: 'ALL', conditions: [{ field: 'tier', op: 'is', value: 'hot' }, { field: 'stage', op: 'is_not', value: 'won' }, { field: 'stage', op: 'is_not', value: 'lost' }] }],
      ['High-Value Leads', 'Open deals worth $50K or more', { logic: 'ALL', conditions: [{ field: 'deal_value', op: 'gte', value: 50000 }, { field: 'stage', op: 'is_not', value: 'won' }, { field: 'stage', op: 'is_not', value: 'lost' }] }],
      ['No Contact 7+ Days', 'Active prospects not contacted in over a week', { logic: 'ALL', conditions: [{ field: 'stage', op: 'is_not', value: 'won' }, { field: 'stage', op: 'is_not', value: 'lost' }, { field: 'last_activity', op: 'older_than', value: 7 }] }],
      ['No Contact 14+ Days', 'Active prospects not contacted in over two weeks', { logic: 'ALL', conditions: [{ field: 'stage', op: 'is_not', value: 'won' }, { field: 'stage', op: 'is_not', value: 'lost' }, { field: 'last_activity', op: 'older_than', value: 14 }] }],
      ['No Contact 30+ Days', 'Active prospects not contacted in over a month', { logic: 'ALL', conditions: [{ field: 'stage', op: 'is_not', value: 'won' }, { field: 'stage', op: 'is_not', value: 'lost' }, { field: 'last_activity', op: 'older_than', value: 30 }] }],
      ['Active Opportunities', 'Deals actively moving through the pipeline', { logic: 'ALL', conditions: [{ field: 'stage', op: 'in', value: ['meeting', 'proposal', 'negotiation'] }, { field: 'deal_value', op: 'gt', value: 0 }] }],
      ['At-Risk Opportunities', 'Active deals with no contact in 14+ days', { logic: 'ALL', conditions: [{ field: 'stage', op: 'in', value: ['meeting', 'proposal', 'negotiation'] }, { field: 'last_activity', op: 'older_than', value: 14 }] }],
      ['Recently Contacted', 'Prospects reached out to in the last week', { logic: 'ALL', conditions: [{ field: 'last_activity', op: 'within_days', value: 7 }] }],
      ['Unresponsive Contacts', 'Email sent but no reply in 7+ days', { logic: 'ALL', conditions: [{ field: 'email_count', op: 'gt', value: 0 }, { field: 'response_count', op: 'eq', value: 0 }, { field: 'last_email', op: 'older_than', value: 7 }] }],
      ['Overdue Follow-Ups', 'Open deals that need a follow-up now', { logic: 'ALL', conditions: [{ field: 'stage', op: 'is_not', value: 'won' }, { field: 'stage', op: 'is_not', value: 'lost' }, { field: 'last_activity', op: 'older_than', value: 5 }] }],
      ['Customers', 'Won deals — your customers', { logic: 'ALL', conditions: [{ field: 'stage', op: 'is', value: 'won' }] }],
      ['Former Customers', 'Lost deals that previously generated revenue', { logic: 'ALL', conditions: [{ field: 'stage', op: 'is', value: 'lost' }, { field: 'deal_value', op: 'gt', value: 0 }] }],
    ];
    const rows = presets.map(([name, description, rules]) => ({
      workspace_id: workspaceId, name, description, rules, is_preset: true, created_by: null,
    }));
    const { error } = await sb.from('segments').insert(rows);
    if (error) console.error('[segments] preset seed error:', error.message);
  }

  // GET /api/segments — list with live counts
  router.get('/segments', requireMember, async (req, res) => {
    try {
      if (!(await needTable(res, 'segments'))) return;
      await seedPresetsIfEmpty(req.workspaceId);
      const { data } = await sb.from('segments').select('*').eq('workspace_id', req.workspaceId)
        .is('archived_at', null).order('is_favorite', { ascending: false }).order('updated_at', { ascending: false });
      const { data: owners } = await sb.from('profiles').select('id, display_name');
      const ownerMap = (owners || []).reduce((m, o) => { m[o.id] = o.display_name; return m; }, {});
      const list = [];
      for (const s of data || []) {
        let count = 0;
        try { count = await segmentCount(req.workspaceId, s.rules); } catch (e) { console.error('[segments] count error', e.message); }
        list.push({ ...s, match_count: count, created_by_name: ownerMap[s.created_by] || null });
      }
      res.json({ segments: list });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/segments/fields — field catalog + dynamic options
  router.get('/segments/fields', requireMember, async (req, res) => {
    try {
      const customFields = await loadCustomFields(req.workspaceId);
      let tags = [];
      try {
        // tags is a jsonb array — unnest() doesn't accept jsonb
        const rows = await runSql(
          `SELECT DISTINCT t.tag AS tag FROM public.prospects p, jsonb_array_elements_text(CASE WHEN jsonb_typeof(p.tags) = 'array' THEN p.tags ELSE '[]'::jsonb END) AS t(tag)
           WHERE p.workspace_id = $1 ORDER BY 1`,
          [req.workspaceId]
        );
        tags = rows.map(r => r.tag).filter(Boolean);
      } catch { /* migration missing — tags just won't populate */ }
      let companyTags = [];
      try {
        const rows = await runSql(
          `SELECT DISTINCT t.tag AS tag FROM public.companies c, jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.tags) = 'array' THEN c.tags ELSE '[]'::jsonb END) AS t(tag)
           WHERE c.workspace_id = $1 ORDER BY 1`,
          [req.workspaceId]
        );
        companyTags = rows.map(r => r.tag).filter(Boolean);
      } catch { /* companies table missing tags — skip */ }
      const { data: ownerRows } = await sb.from('prospects').select('created_by').eq('workspace_id', req.workspaceId).not('created_by', 'is', null);
      const ids = [...new Set((ownerRows || []).map(r => r.created_by))];
      let owners = [];
      if (ids.length) {
        const { data: profs } = await sb.from('profiles').select('id, display_name').in('id', ids);
        owners = (profs || []).map(o => ({ id: o.id, name: o.display_name || o.id }));
      }
      res.json({
        fields: FIELD_DEFS,
        company_fields: COMPANY_FIELD_DEFS,
        custom_fields: customFields,
        options: { stages: STAGES, tiers: TIERS, tags, owners },
        company_options: { tags: companyTags },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/segments/companies/preview — evaluate company rules live
  router.post('/segments/companies/preview', requireMember, async (req, res) => {
    try {
      const { rules, page = 1, perPage = 10, include_contacts: includeContacts = false } = req.body || {};
      if (!rules || !Array.isArray(rules.conditions)) return res.status(400).json({ error: 'rules.conditions must be an array' });
      const result = await segmentCompanies(req.workspaceId, rules, page, perPage, includeContacts);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/segments/:id
  router.get('/segments/:id', requireMember, async (req, res) => {
    try {
      if (!(await needTable(res, 'segments'))) return;
      const { data } = await sb.from('segments').select('*').eq('id', req.params.id).eq('workspace_id', req.workspaceId).maybeSingle();
      if (!data) return res.status(404).json({ error: 'Segment not found' });
      res.json({ segment: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/segments — create
  router.post('/segments', requireMember, async (req, res) => {
    try {
      if (!(await needTable(res, 'segments'))) return;
      const { name, description, rules, entity } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
      if (!rules || !Array.isArray(rules.conditions)) return res.status(400).json({ error: 'Rules required' });
      const { data, error } = await sb.from('segments').insert({
        workspace_id: req.workspaceId, name: name.trim(), description: (description || '').trim(),
        rules, created_by: req.userId, entity: entity === 'company' ? 'company' : 'contact',
      }).select().single();
      if (error) throw error;
      (async () => {
        const actor = await userNameOf(req.userId);
        const count = await segmentCount(req.workspaceId, rules);
        logActivity({
          workspaceId: req.workspaceId, userId: req.userId, user_name: actor,
          action: 'created', entityType: 'segment', entityId: data.id, entityName: data.name,
          summary: `created the segment "${data.name}" (${count} prospect${count === 1 ? '' : 's'} matched)`,
          metadata: { match_count: count },
        });
      })();
      res.json({ segment: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/segments/:id
  router.patch('/segments/:id', requireMember, async (req, res) => {
    try {
      if (!(await needTable(res, 'segments'))) return;
      const patch = {};
      if (req.body.name !== undefined) patch.name = req.body.name;
      if (req.body.description !== undefined) patch.description = req.body.description;
      if (req.body.rules !== undefined) {
        if (!req.body.rules || !Array.isArray(req.body.rules.conditions)) return res.status(400).json({ error: 'Invalid rules' });
        patch.rules = req.body.rules;
      }
      if (req.body.is_favorite !== undefined) patch.is_favorite = !!req.body.is_favorite;
      if (req.body.archived !== undefined) patch.archived_at = req.body.archived ? new Date().toISOString() : null;
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to update' });
      patch.updated_at = new Date().toISOString();
      const { data, error } = await sb.from('segments').update(patch).eq('id', req.params.id).eq('workspace_id', req.workspaceId).select().single();
      if (error) throw error;
      res.json({ segment: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/segments/:id
  router.delete('/segments/:id', requireMember, async (req, res) => {
    try {
      if (!(await needTable(res, 'segments'))) return;
      const { data: seg } = await sb.from('segments').select('name').eq('id', req.params.id).eq('workspace_id', req.workspaceId).maybeSingle();
      const { error } = await sb.from('segments').delete().eq('id', req.params.id).eq('workspace_id', req.workspaceId);
      if (error) throw error;
      if (seg) {
        (async () => {
          const actor = await userNameOf(req.userId);
          logActivity({
            workspaceId: req.workspaceId, userId: req.userId, user_name: actor,
            action: 'deleted', entityType: 'segment', entityId: req.params.id, entityName: seg.name,
            summary: `deleted the segment "${seg.name}"`,
          });
        })();
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/segments/:id/duplicate
  router.post('/segments/:id/duplicate', requireMember, async (req, res) => {
    try {
      if (!(await needTable(res, 'segments'))) return;
      const { data: src } = await sb.from('segments').select('*').eq('id', req.params.id).eq('workspace_id', req.workspaceId).maybeSingle();
      if (!src) return res.status(404).json({ error: 'Segment not found' });
      const { data, error } = await sb.from('segments').insert({
        workspace_id: req.workspaceId, name: src.name + ' (copy)', description: src.description,
        rules: src.rules, is_favorite: false, is_preset: false, created_by: req.userId,
      }).select().single();
      if (error) throw error;
      (async () => {
        const actor = await userNameOf(req.userId);
        logActivity({
          workspaceId: req.workspaceId, userId: req.userId, user_name: actor,
          action: 'duplicated', entityType: 'segment', entityId: data.id, entityName: data.name,
          summary: `duplicated the segment "${src.name}" as "${data.name}"`,
        });
      })();
      res.json({ segment: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/custom-fields — replace-all sync (used by the Custom Fields page)
  router.put('/custom-fields', requireMember, async (req, res) => {
    try {
      if (!(await needTable(res, 'custom_fields'))) return;
      const incoming = Array.isArray(req.body.fields) ? req.body.fields : [];
      const { data: existing } = await sb.from('custom_fields').select('id').eq('workspace_id', req.workspaceId);
      const existingIds = (existing || []).map(f => String(f.id));
      const incomingIds = incoming.map(f => String(f.id)).filter(Boolean);
      const toDelete = existingIds.filter(id => !incomingIds.includes(id));
      if (toDelete.length) await sb.from('custom_fields').delete().in('id', toDelete).eq('workspace_id', req.workspaceId);
      for (const f of incoming) {
        const row = {
          workspace_id: req.workspaceId, name: String(f.name || '').trim(), type: f.type || 'text',
          options: f.options || [], required: !!f.required, position: f.position || 0,
        };
        if (!row.name) continue;
        if (f.id && existingIds.includes(String(f.id))) {
          await sb.from('custom_fields').update(row).eq('id', f.id).eq('workspace_id', req.workspaceId);
        } else {
          await sb.from('custom_fields').insert(row);
        }
      }
      const { data } = await sb.from('custom_fields').select('*').eq('workspace_id', req.workspaceId).order('position', { ascending: true }).order('created_at', { ascending: true });
      res.json({ custom_fields: (data || []).map(f => ({ ...f, id: String(f.id) })) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/custom-fields
  router.get('/custom-fields', requireMember, async (req, res) => {
    try {
      const data = await loadCustomFields(req.workspaceId);
      res.json({ custom_fields: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/segments/preview/count — evaluate arbitrary rules
  router.post('/segments/preview/count', requireMember, async (req, res) => {
    try {
      const { rules } = req.body;
      if (!rules || !Array.isArray(rules.conditions)) return res.status(400).json({ error: 'Rules required' });
      const count = await segmentCount(req.workspaceId, rules);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/segments/preview — count + matching contacts (paginated)
  router.post('/segments/preview', requireMember, async (req, res) => {
    try {
      const { rules, page = 1, perPage = 10 } = req.body;
      if (!rules || !Array.isArray(rules.conditions)) return res.status(400).json({ error: 'Rules required' });
      const result = await segmentContacts(req.workspaceId, rules, page, perPage);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/segments/:id/run — run a saved segment
  router.post('/segments/:id/run', requireMember, async (req, res) => {
    try {
      if (!(await needTable(res, 'segments'))) return;
      const { data: seg } = await sb.from('segments').select('*').eq('id', req.params.id).eq('workspace_id', req.workspaceId).maybeSingle();
      if (!seg) return res.status(404).json({ error: 'Segment not found' });
      const result = await segmentContacts(req.workspaceId, seg.rules, req.body.page, req.body.perPage);
      (async () => {
        const actor = await userNameOf(req.userId);
        logActivity({
          workspaceId: req.workspaceId, userId: req.userId, user_name: actor,
          action: 'ran', entityType: 'segment', entityId: seg.id, entityName: seg.name,
          summary: `ran the segment "${seg.name}"`,
          metadata: { match_count: result.total !== undefined ? result.total : null },
        });
      })();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/segments/actions — bulk actions on matching contacts
  router.post('/segments/actions', requireMember, async (req, res) => {
    try {
      const { segment_id, rules, action, payload } = req.body;
      let effectiveRules = rules;
      if (segment_id) {
        if (!(await needTable(res, 'segments'))) return;
        const { data: seg } = await sb.from('segments').select('rules').eq('id', segment_id).eq('workspace_id', req.workspaceId).maybeSingle();
        if (!seg) return res.status(404).json({ error: 'Segment not found' });
        effectiveRules = seg.rules;
      }
      if (!effectiveRules || !Array.isArray(effectiveRules.conditions)) return res.status(400).json({ error: 'Rules required' });
      if (!action) return res.status(400).json({ error: 'Action required' });

      // fetch matching prospect ids (cap 5000)
      const { where, params } = await buildWhere(req.workspaceId, effectiveRules, { tasksOk });
      const sql = `SELECT p.id, p.email, p.tags FROM public.prospects p WHERE ${where} ORDER BY p.id LIMIT 5000`;
      const matches = await runSql(sql, params);
      const ids = matches.map(r => r.id);
      if (ids.length === 0) return res.json({ affected: 0, matched: 0, message: 'No contacts match' });

      let affected = 0;
      switch (action) {
        case 'assign_owner': {
          if (!payload || !payload.user_id) return res.status(400).json({ error: 'user_id required' });
          const { error } = await sb.from('prospects').update({ created_by: payload.user_id }).in('id', ids);
          if (error) throw error;
          affected = ids.length;
          break;
        }
        case 'change_stage': {
          if (!payload || !payload.stage) return res.status(400).json({ error: 'stage required' });
          const { error } = await sb.from('prospects').update({ stage: payload.stage, stage_entered_at: new Date().toISOString().slice(0, 10) }).in('id', ids);
          if (error) throw error;
          affected = ids.length;
          break;
        }
        case 'add_tag':
        case 'remove_tag': {
          if (!payload || !payload.tag) return res.status(400).json({ error: 'tag required' });
          const tag = String(payload.tag).trim();
          const CHUNK = 200;
          for (let i = 0; i < ids.length; i += CHUNK) {
            const chunk = ids.slice(i, i + CHUNK);
            const { data: rows } = await sb.from('prospects').select('id, tags').in('id', chunk);
            const updates = (rows || []).map(r => {
              const tags = Array.isArray(r.tags) ? r.tags : [];
              const next = action === 'add_tag'
                ? (tags.includes(tag) ? tags : [...tags, tag])
                : tags.filter(t => t !== tag);
              return sb.from('prospects').update({ tags: next }).eq('id', r.id);
            });
            await Promise.all(updates);
            affected += updates.length;
          }
          break;
        }
        case 'create_tasks': {
          if (!(await needTable(res, 'tasks'))) return;
          if (!payload || !payload.title) return res.status(400).json({ error: 'title required' });
          const rows = ids.map(pid => ({
            workspace_id: req.workspaceId, prospect_id: pid, title: payload.title,
            due_date: payload.due_date || null, status: 'open', created_by: req.userId,
          }));
          const CHUNK = 200;
          for (let i = 0; i < rows.length; i += CHUNK) {
            const { error } = await sb.from('tasks').insert(rows.slice(i, i + CHUNK));
            if (error) throw error;
          }
          affected = rows.length;
          break;
        }
        case 'send_email': {
          if (!payload || !payload.subject || !payload.body) return res.status(400).json({ error: 'subject and body required' });
          const API_KEY = process.env.RESEND_API_KEY;
          if (!API_KEY || API_KEY.startsWith('re_xxxx')) return res.status(400).json({ error: 'Resend API key not configured' });
          const { Resend } = await import('resend');
          const resend = new Resend(API_KEY);
          const emails = matches.map(r => r.email).filter(Boolean).slice(0, 200);
          const from = process.env.RESEND_FROM || 'Sentery <notifications@sentery.it.com>';
          for (const to of emails) {
            try {
              await resend.emails.send({ from, to, subject: payload.subject, html: String(payload.body).replace(/\n/g, '<br/>') });
              affected++;
            } catch (e) { console.error('[segments] send_email to', to, 'failed:', e.message); }
          }
          break;
        }
        default:
          return res.status(400).json({ error: `Unknown action: ${action}` });
      }
      res.json({ affected, matched: ids.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}