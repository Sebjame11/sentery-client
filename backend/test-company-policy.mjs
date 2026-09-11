// Company-vs-contact policy E2E: create_company must not fabricate contacts;
// create_prospect must reject a company name as a person's name.
import crypto from 'node:crypto';
import fs from 'node:fs';

const env = {};
for (const line of fs.readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const BASE = 'http://localhost:3001';
const APP = 'http://localhost:5173';
const sb = (await import('@supabase/supabase-js')).createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

const suffix = Date.now().toString(36);
const companyName = `E2E Corp ${suffix}`;

const reg = await fetch(`${BASE}/mcp/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_name: 'Company Policy Test', redirect_uris: ['http://localhost:9999/callback'], token_endpoint_auth_method: 'none' }),
}).then(r => r.json());
const CLIENT_ID = reg.client_id;

const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = Buffer.from(crypto.createHash('sha256').update(verifier).digest()).toString('base64url');
const { data: member } = await sb.from('workspace_members').select('user_id, workspace_id').limit(1).maybeSingle();
const code = crypto.randomBytes(24).toString('base64url');
await sb.from('mcp_codes').insert({
  code_hash: sha256(code), client_id: CLIENT_ID, user_id: member.user_id, workspace_id: member.workspace_id,
  code_challenge: challenge, redirect_uri: 'http://localhost:9999/callback', scope: 'sentery:read sentery:write', expires_at: new Date(Date.now() + 300000).toISOString(),
});
const tok = await fetch(`${BASE}/mcp/auth/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: 'http://localhost:9999/callback', client_id: CLIENT_ID, client_secret: 'test' }),
}).then(r => r.json());
const token = tok.access_token;

const call = async (sessionId, method, name, args) => {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'Authorization': `Bearer ${token}`, 'mcp-protocol-version': '2025-03-26', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params: method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'policy-e2e', version: '1.0.0' } } : { name, arguments: args } }),
  });
  return { sessionId: res.headers.get('mcp-session-id'), json: await res.json() };
};

let { sessionId, json: init } = await call(null, 'initialize');
console.log('version:', init.result?.serverInfo?.version);

// 1. create_company with NO contacts → only a company
console.log('\n1) create_company (no contacts)');
const r1 = await call(sessionId, 'tools/call', 'create_company', { name: companyName, industry: 'Fintech', city: 'Phnom Penh' });
const t1 = JSON.parse(r1.json.result.content[0].text);
ok('company created', t1.company?.id && t1.company.name === companyName);
ok('no contacts added', Array.isArray(t1.contacts_added) && t1.contacts_added.length === 0);
const { count: prospectCountAfterCompany } = await sb.from('prospects').select('id', { count: 'exact', head: true }).eq('company', companyName);
ok('zero prospects linked to company', prospectCountAfterCompany === 0, `count=${prospectCountAfterCompany}`);

// 2. create_prospect with the company name and NO person info → rejected
console.log('\n2) create_prospect named after the company (no info)');
const r2 = await call(sessionId, 'tools/call', 'create_prospect', { name: companyName });
ok('rejected', r2.json.result.isError === true, JSON.stringify(r2.json.result.content[0].text).slice(0, 120));
const { count: afterReject } = await sb.from('prospects').select('id', { count: 'exact', head: true }).eq('name', companyName);
ok('no phantom prospect', afterReject === 0, `count=${afterReject}`);

// 3. create_prospect with company name + real person info → allowed
console.log('\n3) create_prospect (company name + person info)');
const r3 = await call(sessionId, 'tools/call', 'create_prospect', { name: companyName, title: 'CFO', email: `cfo@${suffix}.test` });
ok('created with person info', !r3.json.result.isError, JSON.stringify(r3.json.result).slice(0, 150));

// 4. create_company with contacts → real people added, company-named one skipped
console.log('\n4) create_company with contacts');
const r4 = await call(sessionId, 'tools/call', 'create_company', {
  name: `E2E Corp 2 ${suffix}`,
  contacts: [
    { name: `Jane Doe ${suffix}`, title: 'VP Sales', email: `jane@${suffix}.test` },
    { name: `E2E Corp 2 ${suffix}`, email: `fake@${suffix}.test` },
  ],
});
const t4 = JSON.parse(r4.json.result.content[0].text);
ok('company 2 created', t4.company?.id);
ok('one real contact added', t4.contacts_added?.length === 1 && t4.contacts_added[0].name === `Jane Doe ${suffix}`, JSON.stringify(t4.contacts_added));
ok('company-named contact skipped', !t4.contacts_added?.some(c => c.name === `E2E Corp 2 ${suffix}`));

// cleanup
await sb.from('prospects').delete().eq('company', companyName);
await sb.from('companies').delete().eq('name', companyName);
await sb.from('companies').delete().eq('name', `E2E Corp 2 ${suffix}`);
console.log(`\n═══ PASSED: ${passed}  FAILED: ${failed} ═══`);
process.exit(failed ? 1 : 0);