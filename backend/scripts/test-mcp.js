// Sentery MCP end-to-end test.
// Walks: metadata → dynamic client registration → authorize redirect →
//        consent (code issued) → PKCE token exchange → MCP initialize → tools/list → tools/call
import crypto from 'node:crypto';
import fs from 'node:fs';

const env = {};
for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const BASE = process.env.MCP_SERVER_URL || env.MCP_SERVER_URL || 'http://localhost:3001';
const APP = process.env.APP_URL || env.APP_URL || 'http://localhost:5173';
const sb = await import('@supabase/supabase-js').then(m =>
  m.createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
);

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

// 1. Metadata
console.log('\n[1] Authorization server metadata');
const meta = await fetch(`${BASE}/.well-known/oauth-authorization-server`).then(r => r.json());
ok('issuer', meta.issuer === BASE, meta.issuer);
ok('authorization_endpoint', meta.authorization_endpoint?.includes('/mcp/auth/authorize'));
ok('token_endpoint', meta.token_endpoint?.includes('/mcp/auth/token'));
ok('registration_endpoint', meta.registration_endpoint?.includes('/mcp/auth/register'));
ok('S256 supported', (meta.code_challenge_methods_supported || []).includes('S256'));

// 2. Dynamic client registration
console.log('\n[2] Dynamic client registration');
const reg = await fetch(`${BASE}/mcp/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_name: 'MCP Test Client',
    redirect_uris: ['http://localhost:9999/callback'],
    token_endpoint_auth_method: 'none',
  }),
}).then(async r => ({ status: r.status, body: await r.json() }));
ok('registered', reg.status === 201 && reg.body.client_id, reg.body.client_id?.slice(0, 8) + '…');
const CLIENT_ID = reg.body.client_id;

// 3. Unauthenticated MCP call → 401 + WWW-Authenticate
console.log('\n[3] MCP auth challenge');
const noAuth = await fetch(`${BASE}/mcp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
});
ok('401 without token', noAuth.status === 401);
ok('WWW-Authenticate present', (noAuth.headers.get('www-authenticate') || '').includes('resource_metadata'), noAuth.headers.get('www-authenticate')?.slice(0, 80));

// 4. Authorize → redirects to in-app consent screen
console.log('\n[4] Authorization endpoint');
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = Buffer.from(crypto.createHash('sha256').update(verifier).digest()).toString('base64url');
const authz = await fetch(`${BASE}/mcp/auth/authorize?client_id=${encodeURIComponent(CLIENT_ID)}&redirect_uri=${encodeURIComponent('http://localhost:9999/callback')}&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&state=xyz123`, { redirect: 'manual' });
ok('302 redirect', authz.status === 302);
const loc = authz.headers.get('location') || '';
ok('redirects to app consent', loc.startsWith(`${APP}/mcp/authorize`), loc.slice(0, 90));

// 5. Consent — issue the code exactly like /api/mcp/auth/consent does (needs a real user session in the browser)
console.log('\n[5] Consent (code issuance)');
const { data: member } = await sb.from('workspace_members').select('user_id, workspace_id').limit(1).maybeSingle();
if (!member) { console.log('  ✗ no workspace member found to issue a code against'); process.exit(1); }
const code = crypto.randomBytes(24).toString('base64url');
const { error: codeErr } = await sb.from('mcp_codes').insert({
  code_hash: sha256(code),
  client_id: CLIENT_ID,
  user_id: member.user_id,
  workspace_id: member.workspace_id,
  code_challenge: challenge,
  redirect_uri: 'http://localhost:9999/callback',
  scope: 'sentery:read sentery:write',
  expires_at: new Date(Date.now() + 600000).toISOString(),
});
ok('code issued', !codeErr, codeErr?.message || '');

// 6. Token exchange (PKCE)
console.log('\n[6] Token endpoint (PKCE)');
const tok = await fetch(`${BASE}/mcp/auth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: 'http://localhost:9999/callback',
    client_id: CLIENT_ID,
  }),
}).then(async r => ({ status: r.status, body: await r.json() }));
ok('access token issued', tok.status === 200 && !!tok.body.access_token);
ok('refresh token issued', !!tok.body.refresh_token);
let ACCESS = tok.body.access_token;

// 7. Token reuse → invalid_grant
const reuse = await fetch(`${BASE}/mcp/auth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code', code, code_verifier: verifier,
    redirect_uri: 'http://localhost:9999/callback', client_id: CLIENT_ID,
  }),
});
ok('code single-use', reuse.status === 400, 'invalid_grant');

// 8. Refresh rotation
console.log('\n[7] Refresh token rotation');
const ref = await fetch(`${BASE}/mcp/auth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: tok.body.refresh_token, client_id: CLIENT_ID }),
}).then(async r => ({ status: r.status, body: await r.json() }));
ok('rotated', ref.status === 200 && !!ref.body.access_token && ref.body.refresh_token !== tok.body.refresh_token);
ACCESS = ref.body.access_token;

// 9. MCP initialize + tools
console.log('\n[8] MCP protocol');
  let SESSION_ID = null;
  const rpc = async (method, params) => {
    const r = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${ACCESS}`,
        ...(SESSION_ID ? { 'mcp-session-id': SESSION_ID } : {}),
        ...(method !== 'initialize' ? { 'mcp-protocol-version': '2025-06-18' } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: Math.floor(Math.random() * 1e9), method, params: params || {} }),
    });
    const sid = r.headers.get('mcp-session-id');
    if (sid) SESSION_ID = sid;
    return r.json();
  };
const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-test', version: '1.0' } });
ok('initialize', init.result?.serverInfo?.name === 'sentery-mcp', init.result?.serverInfo?.name);
const list = await rpc('tools/list', {});
const names = (list.result?.tools || []).map(t => t.name).sort();
ok('tools/list is expanded (60 tools)', names.length === 60, `${names.length} tools`);
['pipeline_summary', 'search_prospects', 'get_prospect', 'list_meetings', 'list_sequences', 'create_prospect', 'update_stage', 'log_touchpoint',
  'update_prospect', 'delete_prospect', 'create_company', 'update_company', 'search_companies', 'get_company', 'delete_company', 'link_prospect_to_company',
  'list_touchpoints', 'activity_summary', 'create_template', 'update_template', 'list_templates', 'delete_template',
  'create_sequence', 'update_sequence', 'delete_sequence', 'create_note', 'update_note', 'list_notes', 'delete_note',
  'get_meeting_availability', 'create_meeting', 'cancel_meeting', 'win_loss_summary', 'daily_digest', 'activity_goals_status',
  'workspace_info', 'list_members', 'add_member', 'remove_member',
  'apollo_search_people', 'apollo_search_companies', 'apollo_enrich_person', 'apollo_enrich_company', 'apollo_send_email', 'send_email',
  'search_emails', 'get_email_thread', 'get_contact_emails', 'get_company_emails', 'get_recent_emails', 'send_gmail_email', 'sync_emails']
  .forEach(t => ok(`  ${t}`, names.includes(t)));

// 10. Real tool call
console.log('\n[9] Tool call (pipeline_summary)');
const call = await rpc('tools/call', { name: 'pipeline_summary', arguments: {} });
const text = call.result?.content?.[0]?.text || '';
ok('pipeline_summary returned data', call.result && !call.error, text.slice(0, 120));

// 11. Write tool with an invalid prospect → graceful error
console.log('\n[10] Write tool error path');
const badCall = await rpc('tools/call', { name: 'update_stage', arguments: { prospect_id: crypto.randomUUID(), stage: 'nonsense' } });
ok('invalid stage rejected', badCall.result?.isError === true, (badCall.result?.content?.[0]?.text || '').slice(0, 60));

// 12. Live write path (only when --live): create prospect → move stage → log touchpoint → cleanup
if (process.argv.includes('--live')) {
  console.log('\n[11] Live write path');
  const created = await rpc('tools/call', {
    name: 'create_prospect',
    arguments: { name: 'MCP Live Test', company: 'Sentery QA', email: `mcp-live-${Date.now()}@sentery.test`, tier: 'warm', stage: 'lead', deal_value: 5000, notes: 'created via MCP test' },
  });
  const createdText = created.result?.content?.[0]?.text || '';
  let prospectId = null;
  try { prospectId = JSON.parse(createdText)?.id; } catch {}
  ok('create_prospect', !!prospectId, createdText.slice(0, 80));

  if (prospectId) {
    const moved = await rpc('tools/call', { name: 'update_stage', arguments: { prospect_id: prospectId, stage: 'contacted' } });
    ok('update_stage → contacted', (moved.result?.content?.[0]?.text || '').includes('contacted'), moved.result?.content?.[0]?.text);

    const found = await rpc('tools/call', { name: 'search_prospects', arguments: { query: 'MCP Live Test' } });
    const foundText = found.result?.content?.[0]?.text || '';
    ok('search_prospects finds it', foundText.includes('MCP Live Test'));

    const touched = await rpc('tools/call', { name: 'log_touchpoint', arguments: { prospect_id: prospectId, channel: 'Call', note: 'Live test touchpoint via MCP', outcome: 'replied' } });
    ok('log_touchpoint', (touched.result?.content?.[0]?.text || '').includes('Touchpoint logged'), touched.result?.content?.[0]?.text);

    const detail = await rpc('tools/call', { name: 'get_prospect', arguments: { prospect_id: prospectId } });
    const detailText = detail.result?.content?.[0]?.text || '';
    ok('get_prospect shows touchpoint', detailText.includes('Live test touchpoint via MCP'));

    const { error: delErr } = await sb.from('prospects').delete().eq('id', prospectId);
    ok('cleanup (prospect removed)', !delErr, delErr?.message || '');
  }
}

console.log(`\n${'='.repeat(50)}\nPassed: ${passed}  Failed: ${failed}`);
process.exit(failed ? 1 : 0);
