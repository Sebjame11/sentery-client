// Unit test for the segment SQL compiler + plpgsql-style param binding simulation.
import 'dotenv/config';
import { compileNode, FIELD_DEFS } from '../segments.js';

let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log('  ✓ ' + name + (extra ? ' — ' + extra : '')); }
  else { failed++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
};

// simulate the segment_query RPC substitution (same rules as the plpgsql body)
function bind(sql, params) {
  let q = sql;
  params.forEach((v, i) => {
    const ph = '$' + (i + 1);
    if (v === null || v === undefined) q = q.split(ph).join('NULL');
    else if (typeof v === 'string') q = q.split(ph).join(`'${v.replace(/'/g, "''")}'`);
    else if (typeof v === 'number') q = q.split(ph).join(String(v));
    else if (typeof v === 'boolean') q = q.split(ph).join(String(v));
    else if (Array.isArray(v)) q = q.split(ph).join("ARRAY[" + v.map(x => `'${x}'`).join(',') + "]");
  });
  return q;
}

function compile(rules) {
  const params = [42]; // workspace_id = $1
  const sql = compileNode(rules, {}, params);
  return { sql, params, full: `p.workspace_id = $1 AND ${sql}` };
}

console.log('Field catalog sanity');
ok('catalog has 35 fields', FIELD_DEFS.length === 35, FIELD_DEFS.length + ' fields');
const groups = [...new Set(FIELD_DEFS.map(f => f.group))];
ok('groups: Contact/Deal/Activity/Email', ['Contact', 'Deal', 'Activity', 'Email'].every(g => groups.includes(g)), groups.join(','));

console.log('\nText operators');
for (const [op, val, needle] of [
  ['is', 'CEO', "lower(COALESCE(p.title,'')) = lower('CEO')"],
  ['is_not', 'CEO', "lower(COALESCE(p.title,'')) <> lower('CEO')"],
  ['contains', 'CEO', "COALESCE(p.title,'') ILIKE '%CEO%'"],
  ['not_contains', 'CEO', "COALESCE(p.title,'') NOT ILIKE '%CEO%'"],
  ['starts_with', 'VP', "COALESCE(p.title,'') ILIKE 'VP%'"],
]) {
  const r = compile({ logic: 'ALL', conditions: [{ field: 'title', op, value: val }] });
  ok(`text ${op}`, bind(r.full, r.params).includes(needle), bind(r.full, r.params).split('AND ').pop());
}
{
  const r = compile({ logic: 'ALL', conditions: [{ field: 'email', op: 'is_empty', value: '' }] });
  ok('is_empty', r.sql === "(COALESCE(p.email,'') = '')", r.sql);
}

console.log('\nNumber operators');
{
  const r = compile({ logic: 'ALL', conditions: [{ field: 'deal_value', op: 'gte', value: 10000 }] });
  ok('deal_value gte', bind(r.full, r.params).includes('p.deal_value >= 10000'), bind(r.full, r.params).split('WHERE ')[1]);
}
{
  const r = compile({ logic: 'ALL', conditions: [{ field: 'deal_value', op: 'between', value: [5000, 10000] }] });
  ok('between', bind(r.full, r.params).includes('p.deal_value BETWEEN 5000 AND 10000'));
}

console.log('\nDate operators');
{
  const r = compile({ logic: 'ALL', conditions: [{ field: 'created_at', op: 'within_days', value: 7 }] });
  ok('within_days', bind(r.full, r.params).includes('p.created_at::date >= (CURRENT_DATE - 7::int)'));
}
{
  const r = compile({ logic: 'ALL', conditions: [{ field: 'last_activity', op: 'older_than', value: 14 }] });
  ok('older_than + null guard', bind(r.full, r.params).includes('s.last_activity IS NOT NULL AND s.last_activity::date < (CURRENT_DATE - 14::int)'));
}
{
  const r = compile({ logic: 'ALL', conditions: [{ field: 'last_email', op: 'exact', value: '2026-08-01' }] });
  ok('exact date', bind(r.full, r.params).includes("s.last_email IS NOT NULL AND s.last_email::date = '2026-08-01'::date"));
}

console.log('\nEnums / arrays');
{
  const r = compile({ logic: 'ALL', conditions: [{ field: 'stage', op: 'in', value: ['meeting', 'proposal', 'negotiation'] }] });
  ok('stage in', bind(r.full, r.params).includes("p.stage = ANY(ARRAY['meeting','proposal','negotiation']::text[])"));
}
{
  const r = compile({ logic: 'ALL', conditions: [{ field: 'tags', op: 'contains_all', value: ['Do Not Contact'] }] });
  ok('tags contains_all', bind(r.full, r.params).includes("p.tags ?& ARRAY['Do Not Contact']"));
}
{
  const r = compile({ logic: 'ALL', conditions: [{ field: 'country', op: 'contains_any', value: ['Cambodia', 'Vietnam'] }] });
  ok('country contains_any', bind(r.full, r.params).includes("p.countries ?| ARRAY['Cambodia','Vietnam']"));
}
{
  const r = compile({ logic: 'ALL', conditions: [{ field: 'owner', op: 'is', value: 'abc-123' }] });
  ok('owner uuid', bind(r.full, r.params).includes("p.created_by = 'abc-123'::uuid"));
}

console.log('\nBooleans');
{
  const r = compile({ logic: 'ALL', conditions: [{ field: 'has_email_activity', op: 'is', value: true }] });
  ok('has email', r.sql.includes('s.email_count > 0'), r.sql);
}
{
  const r = compile({ logic: 'ALL', conditions: [{ field: 'has_meeting', op: 'is', value: false }] });
  ok('has no meeting', r.sql.includes('NOT (EXISTS (SELECT 1 FROM public.meetings'));
}

console.log('\nCustom fields');
{
  const cf = { '5': { type: 'number' }, '7': { type: 'text' }, '9': { type: 'date' }, '11': { type: 'checkbox' } };
  const params = [42];
  const sql = compileNode({ logic: 'ALL', conditions: [
    { field: 'cf:5', op: 'gt', value: 100 },
    { field: 'cf:7', op: 'contains', value: 'Enterprise' },
    { field: 'cf:9', op: 'older_than', value: 30 },
    { field: 'cf:11', op: 'is', value: true },
  ] }, cf, params);
  ok('cf number cast guard', sql.includes("p.custom_fields->>'5' ~ '^-?[0-9]+"));
  ok('cf text', bind(sql, params).includes("ILIKE '%Enterprise%'"));
  ok('cf date cast', sql.includes("p.custom_fields->>'9' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'"));
  ok('cf checkbox', sql.includes("p.custom_fields->>'11' = 'true'"));
}

console.log('\nNested groups — the spec example');
const spec = {
  logic: 'ALL',
  conditions: [
    { field: 'country', op: 'is', value: 'Cambodia' },
    { field: 'industry', op: 'is', value: 'Fintech' },
    { field: 'stage', op: 'is', value: 'lead' },
    { field: 'last_activity', op: 'older_than', value: 14 },
    {
      logic: 'ANY',
      conditions: [
        { field: 'title', op: 'contains', value: 'CEO' },
        { field: 'title', op: 'contains', value: 'CFO' },
        { field: 'title', op: 'contains', value: 'Director' },
      ],
    },
    { field: 'has_open_task', op: 'is', value: false },
    { field: 'deal_value', op: 'gt', value: 10000 },
    {
      logic: 'NOT',
      conditions: [{ field: 'tags', op: 'contains_any', value: ['Do Not Contact'] }],
    },
  ],
};
const params = [42];
const full = compileNode(spec, {}, params);
const bound = bind(`p.workspace_id = $1 AND ${full}`, params);
ok('ANY nested', bound.includes("((COALESCE(p.title,'') ILIKE '%CEO%') OR (COALESCE(p.title,'') ILIKE '%CFO%') OR (COALESCE(p.title,'') ILIKE '%Director%'))"));
ok('NOT nested', bound.includes("NOT ((p.tags ?| ARRAY['Do Not Contact']))"));
ok('full example compiles', full.length > 100);
console.log('\nCompiled example:');
console.log(bound.replace(/^p\./, 'p.').slice(0, 600) + (bound.length > 600 ? ' …' : ''));

console.log('\nEmpty rules');
{
  const r = compile({ logic: 'ALL', conditions: [] });
  ok('empty → true', r.sql === 'true');
}

console.log(`\n${'='.repeat(50)}\nPassed: ${passed}  Failed: ${failed}`);
process.exit(failed ? 1 : 0);