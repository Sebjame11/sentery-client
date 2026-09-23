import { Router } from 'express';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { getAccessToken, googleFetch, computeOpenSlots } from './meetings.js';
import { segmentCount, segmentContacts, segmentCompanies } from './segments.js';
import { searchMessages, getMessageDetail, sendEmailViaGmail, syncEmail } from './emails.js';
import { logActivity, userNameOf } from './activity.js';

// ─── Sentery MCP Server + OAuth 2.0 Authorization Server ───
// Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization

const sb = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const router = Router();

if (!sb) console.warn('[MCP] Supabase service role not configured — MCP endpoints disabled');

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const SERVER_BASE = (process.env.MCP_SERVER_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '');
const AUTHORIZATION_ENDPOINT = `${SERVER_BASE}/mcp/auth/authorize`;
const TOKEN_ENDPOINT = `${SERVER_BASE}/mcp/auth/token`;
const REGISTRATION_ENDPOINT = `${SERVER_BASE}/mcp/auth/register`;
const MCP_ENDPOINT = `${SERVER_BASE}/mcp`;
const METADATA_URL = `${SERVER_BASE}/.well-known/oauth-authorization-server`;

const ACCESS_TTL = 60 * 60; // 1h
const REFRESH_TTL = 60 * 60 * 24 * 30; // 30d
const CODE_TTL = 10 * 60; // 10min
const STAGES = ['lead', 'contacted', 'engaged', 'meeting', 'proposal', 'negotiation', 'won', 'lost'];
const SCOPES = ['sentery:read', 'sentery:write'];
const APOLLO_BASE = 'https://api.apollo.io';
const CURRENCIES = [
  { code: 'USD', symbol: '$' }, { code: 'EUR', symbol: '€' }, { code: 'GBP', symbol: '£' },
  { code: 'JPY', symbol: '¥' }, { code: 'CNY', symbol: '¥' }, { code: 'AUD', symbol: 'A$' },
  { code: 'CAD', symbol: 'C$' }, { code: 'CHF', symbol: 'Fr ' }, { code: 'SGD', symbol: 'S$' },
  { code: 'HKD', symbol: 'HK$' }, { code: 'NZD', symbol: 'NZ$' }, { code: 'INR', symbol: '₹' },
  { code: 'KRW', symbol: '₩' }, { code: 'THB', symbol: '฿' }, { code: 'VND', symbol: '₫' },
  { code: 'IDR', symbol: 'Rp' }, { code: 'MYR', symbol: 'RM' }, { code: 'PHP', symbol: '₱' },
  { code: 'AED', symbol: 'د.إ' }, { code: 'SAR', symbol: 'ر.س' }, { code: 'BRL', symbol: 'R$' },
  { code: 'MXN', symbol: 'Mex$' }, { code: 'ZAR', symbol: 'R' }, { code: 'SEK', symbol: 'kr' },
  { code: 'NOK', symbol: 'kr' }, { code: 'DKK', symbol: 'kr' }, { code: 'PLN', symbol: 'zł' },
  { code: 'TRY', symbol: '₺' }, { code: 'RUB', symbol: '₽' },
];
function formatMoney(amount, currencyCode) {
  const cur = CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0];
  const num = Number(amount) || 0;
  return `${cur.symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

let resend = null;
try {
  const { Resend } = await import('resend');
  if (process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.startsWith('re_xxxx')) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
} catch { resend = null; }

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function randToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// Supabase silently caps queries at 1000 rows — paginate big scans.
async function fetchAll(buildQuery, maxPages = 20) {
  const rows = [];
  for (let page = 0; page < maxPages; page++) {
    const { data, error } = await buildQuery().range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function needDb(res) {
  if (sb) return true;
  res.status(503).json({ error: 'MCP not configured — add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env' });
  return false;
}

async function findClient(clientId) {
  const { data } = await sb.from('mcp_clients').select('*').eq('client_id', clientId).maybeSingle();
  return data || null;
}

// ─── Dynamic client registration (RFC 7591) ───
// ChatGPT / Claude Desktop / other MCP clients hit this on first connect.
router.post('/mcp/auth/register', async (req, res) => {
  try {
    if (!needDb(res)) return;
    const { client_name, redirect_uris, client_uri, token_endpoint_auth_method, logo_uri } = req.body || {};
    if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return res.status(400).json({ error: 'redirect_uris must be a non-empty array' });
    }
    const uris = redirect_uris.map(u => String(u).replace(/\/+$/, ''));
    for (const u of uris) {
      let parsed;
      try { parsed = new URL(u); } catch { return res.status(400).json({ error: `Invalid redirect_uri: ${u}` }); }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return res.status(400).json({ error: `redirect_uri must be http(s): ${u}` });
      }
    }
    const confidential = token_endpoint_auth_method !== 'none' && token_endpoint_auth_method !== 'nil';
    const clientId = randToken(16);
    const clientSecret = confidential ? randToken(32) : null;
    let { data, error } = await sb.from('mcp_clients').insert({
      client_id: clientId,
      client_secret_hash: clientSecret ? sha256(clientSecret) : null,
      client_name: client_name || 'Unknown MCP client',
      client_uri: client_uri || null,
      redirect_uris: uris,
      confidential,
    }).select().single();
    if (error && /column.*logo_uri/i.test(error.message)) {
      const fallback = await sb.from('mcp_clients').insert({
        client_id: clientId,
        client_secret_hash: clientSecret ? sha256(clientSecret) : null,
        client_name: client_name || 'Unknown MCP client',
        client_uri: client_uri || null,
        redirect_uris: uris,
        confidential,
      }).select().single();
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;
    res.status(201).json({
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_name: data.client_name,
      client_uri: data.client_uri,
      logo_uri: logo_uri || `${SERVER_BASE}/favicon.svg`,
      redirect_uris: data.redirect_uris,
      token_endpoint_auth_method: confidential ? 'client_secret_post' : 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Public info + client lookup (used by the Settings UI and consent screen) ───
router.get('/api/mcp/info', (_req, res) => {
  res.json({
    name: 'Sentery MCP',
    server_url: MCP_ENDPOINT,
    metadata_url: METADATA_URL,
    authorization_endpoint: AUTHORIZATION_ENDPOINT,
    token_endpoint: TOKEN_ENDPOINT,
    app_url: APP_URL,
    logo_url: `${SERVER_BASE}/favicon.svg`,
    scopes: SCOPES.map(scope => ({
      scope,
      description: scope === 'sentery:read' ? 'Read your pipeline, prospects, and meetings' : 'Update prospects, log touchpoints, run sequences',
    })),
  });
});

router.get('/api/mcp/client', async (req, res) => {
  try {
    if (!needDb(res)) return;
    const { data } = await sb.from('mcp_clients')
      .select('client_id, client_name, client_uri')
      .eq('client_id', String(req.query.client_id || ''))
      .maybeSingle();
    if (!data) return res.status(404).json({ error: 'Unknown client' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Connected apps (user's Supabase session) ───
async function sessionUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return null;
  const { data: { user }, error } = await sb.auth.getUser(token);
  return error || !user ? null : user;
}

router.get('/api/mcp/connections', async (req, res) => {
  try {
    if (!needDb(res)) return;
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { data: tokens } = await sb.from('mcp_tokens')
      .select('client_id, created_at, refresh_expires_at')
      .eq('user_id', user.id).is('revoked_at', null);
    if (!tokens || tokens.length === 0) return res.json({ data: [] });
    const clientIds = [...new Set(tokens.map(t => t.client_id))];
    const { data: clients } = await sb.from('mcp_clients')
      .select('client_id, client_name, client_uri').in('client_id', clientIds);
    const byId = Object.fromEntries((clients || []).map(c => [c.client_id, c]));
    const byName = new Map();
    for (const t of tokens) {
      const name = byId[t.client_id]?.client_name || 'Unknown client';
      if (!byName.has(name)) {
        byName.set(name, { client_ids: [], client_uri: byId[t.client_id]?.client_uri || null, connected_at: t.created_at, expires_at: t.refresh_expires_at });
      }
      const e = byName.get(name);
      e.client_ids.push(t.client_id);
      if (t.created_at < e.connected_at) e.connected_at = t.created_at;
      if (!e.expires_at || (t.refresh_expires_at && t.refresh_expires_at < e.expires_at)) e.expires_at = t.refresh_expires_at;
    }
    const data = [...byName.entries()].map(([client_name, e]) => ({ client_name, ...e, count: e.client_ids.length }));
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/mcp/revoke', async (req, res) => {
  try {
    if (!needDb(res)) return;
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const { client_id, client_name } = req.body || {};
    let q = sb.from('mcp_tokens').update({ revoked_at: new Date().toISOString() })
      .eq('user_id', user.id).is('revoked_at', null);
    if (client_name) {
      const { data: clients } = await sb.from('mcp_clients').select('client_id').eq('client_name', client_name);
      const ids = (clients || []).map(c => c.client_id);
      if (ids.length === 0) return res.json({ success: true });
      q = q.in('client_id', ids);
    } else if (client_id) {
      q = q.eq('client_id', client_id);
    }
    const { error } = await q;
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Authorization server metadata (RFC 8414) ───
router.get('/.well-known/oauth-authorization-server', (_req, res) => {
  res.json({
    issuer: SERVER_BASE,
    authorization_endpoint: AUTHORIZATION_ENDPOINT,
    token_endpoint: TOKEN_ENDPOINT,
    registration_endpoint: REGISTRATION_ENDPOINT,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: SCOPES,
    scopes: SCOPES.map(scope => ({
      scope,
      description: scope === 'sentery:read' ? 'Read your pipeline, prospects, and meetings' : 'Update prospects, log touchpoints, run sequences',
    })),
  });
});

// ─── Authorization endpoint ───
// Validates the client request, then hands off to the in-app consent screen.
router.get('/mcp/auth/authorize', async (req, res) => {
  try {
    if (!needDb(res)) return;
    const { client_id, redirect_uri, response_type, state, code_challenge, code_challenge_method, scope } = req.query;
    const fail = (error, desc) => {
      if (redirect_uri) {
        return res.redirect(`${redirect_uri}${redirect_uri.includes('?') ? '&' : '?'}error=${error}${desc ? `&error_description=${encodeURIComponent(desc)}` : ''}${state ? `&state=${encodeURIComponent(state)}` : ''}`);
      }
      return res.status(400).json({ error, error_description: desc });
    };
    if (response_type !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported');
    if (!client_id) return fail('invalid_request', 'Missing client_id');
    if (!redirect_uri) return fail('invalid_request', 'Missing redirect_uri');
    if (!code_challenge) return fail('invalid_request', 'Missing code_challenge (PKCE required)');
    if (code_challenge_method && code_challenge_method !== 'S256') return fail('invalid_request', 'Only S256 PKCE supported');
    const client = await findClient(client_id);
    if (!client) return fail('invalid_client', 'Unknown client_id');
    if (!client.redirect_uris.includes(String(redirect_uri).replace(/\/+$/, ''))) {
      return fail('invalid_request', 'redirect_uri not registered for this client');
    }
    const params = new URLSearchParams({
      client_id, redirect_uri, response_type: 'code', code_challenge, scope: scope || SCOPES.join(' '),
      ...(code_challenge_method ? { code_challenge_method } : {}),
      ...(state ? { state } : {}),
    });
    res.redirect(`${APP_URL}/mcp/authorize?${params.toString()}`);
  } catch (err) {
    res.status(500).json({ error: 'server_error', error_description: err.message });
  }
});

// ─── Consent (called by the in-app consent screen with the user's session) ───
router.post('/api/mcp/auth/consent', async (req, res) => {
  try {
    if (!needDb(res)) return;
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });

    const { client_id, redirect_uri, state, code_challenge, scope } = req.body || {};
    if (!client_id || !redirect_uri || !code_challenge) {
      return res.status(400).json({ error: 'Missing client_id, redirect_uri, or code_challenge' });
    }
    const client = await findClient(client_id);
    if (!client) return res.status(400).json({ error: 'Unknown client_id' });
    if (!client.redirect_uris.includes(String(redirect_uri).replace(/\/+$/, ''))) {
      return res.status(400).json({ error: 'redirect_uri not registered for this client' });
    }

    const { data: member } = await sb.from('workspace_members')
      .select('workspace_id').eq('user_id', user.id).eq('is_default', true).maybeSingle();
    let workspaceId;
    if (member) {
      workspaceId = member.workspace_id;
    } else {
      const { data: fallback } = await sb.from('workspace_members')
        .select('workspace_id').eq('user_id', user.id).order('workspace_id').limit(1).maybeSingle();
      if (!fallback) return res.status(400).json({ error: 'No workspace found for this user' });
      workspaceId = fallback.workspace_id;
      await sb.from('workspace_members').update({ is_default: true }).eq('user_id', user.id).eq('workspace_id', workspaceId);
    }

    const code = randToken(24);
    const { error: insertErr } = await sb.from('mcp_codes').insert({
      code_hash: sha256(code),
      client_id: client.client_id,
      user_id: user.id,
      workspace_id: workspaceId,
      code_challenge,
      redirect_uri: String(redirect_uri),
      scope: scope || SCOPES.join(' '),
      expires_at: new Date(Date.now() + CODE_TTL * 1000).toISOString(),
    });
    if (insertErr) throw insertErr;

    const base = String(redirect_uri);
    const sep = base.includes('?') ? '&' : '?';
    res.json({ redirect_url: `${base}${sep}code=${code}${state ? `&state=${encodeURIComponent(state)}` : ''}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Token endpoint (authorization code + refresh, PKCE S256) ───
router.post('/mcp/auth/token', async (req, res) => {
  try {
    if (!needDb(res)) return;
    const { grant_type, code, code_verifier, redirect_uri, client_id, client_secret, refresh_token } = req.body || {};

    if (grant_type === 'authorization_code') {
      if (!code || !code_verifier || !client_id) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'code, code_verifier, and client_id required' });
      }
      const client = await findClient(client_id);
      if (!client) return res.status(400).json({ error: 'invalid_client' });
      if (client.confidential) {
        if (!client_secret || sha256(client_secret) !== client.client_secret_hash) {
          return res.status(401).json({ error: 'invalid_client', error_description: 'Invalid client_secret' });
        }
      }
      const { data: codeRow } = await sb.from('mcp_codes')
        .select('*').eq('code_hash', sha256(code)).maybeSingle();
      if (!codeRow || codeRow.client_id !== client.client_id) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid code' });
      }
      if (codeRow.used_at) return res.status(400).json({ error: 'invalid_grant', error_description: 'Code already used' });
      if (new Date(codeRow.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'Code expired' });
      }
      const expectedChallenge = Buffer.from(crypto.createHash('sha256').update(code_verifier).digest())
        .toString('base64url').replace(/=+$/, '');
      if (expectedChallenge !== String(codeRow.code_challenge).replace(/=+$/, '')) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      }
      if (redirect_uri && codeRow.redirect_uri !== String(redirect_uri).replace(/\/+$/, '')) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
      }
      await sb.from('mcp_codes').update({ used_at: new Date().toISOString() }).eq('code_hash', sha256(code));

      const accessToken = randToken(32);
      const refreshTok = randToken(32);
      const { error: insErr } = await sb.from('mcp_tokens').insert({
        access_hash: sha256(accessToken),
        refresh_hash: sha256(refreshTok),
        client_id: client.client_id,
        user_id: codeRow.user_id,
        workspace_id: codeRow.workspace_id,
        scope: codeRow.scope,
        expires_at: new Date(Date.now() + ACCESS_TTL * 1000).toISOString(),
        refresh_expires_at: new Date(Date.now() + REFRESH_TTL * 1000).toISOString(),
      });
      if (insErr) throw insErr;
      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TTL,
        refresh_token: refreshTok,
        scope: codeRow.scope,
      });
    }

    if (grant_type === 'refresh_token') {
      if (!refresh_token || !client_id) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'refresh_token and client_id required' });
      }
      const client = await findClient(client_id);
      if (!client) return res.status(400).json({ error: 'invalid_client' });
      if (client.confidential && (!client_secret || sha256(client_secret) !== client.client_secret_hash)) {
        return res.status(401).json({ error: 'invalid_client', error_description: 'Invalid client_secret' });
      }
      const { data: row } = await sb.from('mcp_tokens')
        .select('*').eq('refresh_hash', sha256(refresh_token)).maybeSingle();
      if (!row || row.revoked_at || row.client_id !== client.client_id) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid refresh_token' });
      }
      if (new Date(row.refresh_expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'Refresh token expired' });
      }
      const accessToken = randToken(32);
      const refreshTok = randToken(32);
      await sb.from('mcp_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', row.id);
      const { error: insErr } = await sb.from('mcp_tokens').insert({
        access_hash: sha256(accessToken),
        refresh_hash: sha256(refreshTok),
        client_id: client.client_id,
        user_id: row.user_id,
        workspace_id: row.workspace_id,
        scope: row.scope,
        expires_at: new Date(Date.now() + ACCESS_TTL * 1000).toISOString(),
        refresh_expires_at: new Date(Date.now() + REFRESH_TTL * 1000).toISOString(),
      });
      if (insErr) throw insErr;
      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TTL,
        refresh_token: refreshTok,
        scope: row.scope,
      });
    }

    return res.status(400).json({ error: 'unsupported_grant_type' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MCP Bearer auth middleware ───
// Unauthenticated → 401 + WWW-Authenticate → clients discover the OAuth server.
async function mcpAuth(req, res, next) {
  try {
    if (!needDb(res)) return;
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer /, '');
    if (!auth.startsWith('Bearer ') || !token) {
      console.log(`[mcp-auth] ${req.method} ${req.path} no-bearer → 401`);
      res.set('WWW-Authenticate', `Bearer resource_metadata="${METADATA_URL}"`)
        .status(401).json({ error: 'unauthorized' });
      return;
    }
    const { data: row } = await sb.from('mcp_tokens')
      .select('*').eq('access_hash', sha256(token)).maybeSingle();
    if (!row || row.revoked_at || new Date(row.expires_at).getTime() < Date.now()) {
      console.log(`[mcp-auth] ${req.method} ${req.path} token-not-found → 401`);
      res.set('WWW-Authenticate', `Bearer resource_metadata="${METADATA_URL}", error="invalid_token"`)
        .status(401).json({ error: 'invalid_token' });
      return;
    }
    req.mcpAuth = { userId: row.user_id, workspaceId: await resolveActiveWorkspace(row.user_id, row.workspace_id), scope: row.scope, clientId: row.client_id };
    next();
  } catch (err) {
    console.error('[mcp-auth] error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// The workspace a connection operates on always follows the user's CURRENTLY active
// workspace in the app (workspace_members.is_default), not the one pinned at consent time.
// Falls back to the consent-time workspace if the user has no default anymore.
async function resolveActiveWorkspace(userId, pinnedWorkspaceId) {
  try {
    const { data: member } = await sb.from('workspace_members')
      .select('workspace_id').eq('user_id', userId).eq('is_default', true).maybeSingle();
    if (member?.workspace_id) return member.workspace_id;
  } catch { /* fall through to pinned workspace */ }
  return pinnedWorkspaceId;
}

// ─── MCP server factory: one server per connection, closed over the user's workspace ───
function createSenteryServer(ctx) {
  const mcpLog = async ({ action, entityType, entityId = null, entityName = null, summary, metadata = {} }) => {
    try {
      const actor = await userNameOf(ctx.userId);
      logActivity({
        workspaceId: ctx.workspaceId, userId: ctx.userId, user_name: actor,
        action, entityType, entityId, entityName,
        summary,
        metadata: { ...metadata, via_ai: true },
      });
    } catch { /* never block the tool on logging */ }
  };
  // Stage IDs valid for the CURRENT workspace: custom pipeline_stages from the
  // workspace profile when configured, otherwise the defaults. Resolved per call
  // because the active workspace can change between requests.
  const workspaceStages = async () => {
    try {
      const { data } = await sb.from('workspaces').select('company_profile').eq('id', ctx.workspaceId).maybeSingle();
      const custom = Array.isArray(data?.company_profile?.pipeline_stages) ? data.company_profile.pipeline_stages : null;
      if (custom) {
        const ids = custom.map(s => String(s?.id || '')).filter(Boolean);
        if (ids.length) {
          const labels = Object.fromEntries(custom.map(s => [String(s.id), s.name || s.id]));
          return { ids, labels };
        }
      }
    } catch { /* fall back to defaults */ }
    return { ids: STAGES, labels: STAGE_LABELS };
  };
  const validateStage = async (stage) => {
    const { ids, labels } = await workspaceStages();
    const input = String(stage).toLowerCase().trim();
    const match = ids.find(id => id.toLowerCase() === input || String(labels[id] || '').toLowerCase().trim() === input);
    if (match) return null;
    const stageList = ids.map(id => `${id} (${labels[id] || id})`).join(', ');
    return { content: [{ type: 'text', text: `Unknown stage "${stage}" for this workspace. Valid stages: ${stageList}. Tip: you can pass either the stage id or its display name (e.g. "POC").` }], isError: true };
  };
  const normalizeStage = async (stage) => {
    if (!stage) return stage;
    const { ids, labels } = await workspaceStages();
    const input = String(stage).toLowerCase().trim();
    return ids.find(id => id.toLowerCase() === input || String(labels[id] || '').toLowerCase().trim() === input) || stage;
  };
  const workspaceCurrency = async () => {
    try {
      const { data } = await sb.from('workspaces').select('company_profile').eq('id', ctx.workspaceId).maybeSingle();
      return data?.company_profile?.currency || 'USD';
    } catch { return 'USD'; }
  };
  const server = new McpServer({
    name: 'sentery-mcp',
    version: '1.9.0',
    instructions: 'Sentery CRM tools. All tools operate on the authenticated user\'s ACTIVE workspace — it follows whichever workspace is active in the Sentery app in real time. Use list_workspaces to confirm which workspace you are in.\n\nProspects (contacts): pipeline summary, search, create, update, delete, update stage, tags. Tag contacts with update_prospect_tags (add/remove without overwriting) or create_prospect/update_prospect tags param. Stages are workspace-specific (see pipeline_summary valid_stages).\n\nDeals (company pipeline): create_company first, then create_deal. Deals have their own stage, value, priority, owner, contact, and outcome fields. log_touchpoint supports deal_id to log activity on a deal. search_deals searches across all deal fields; get_deal_timeline gives full history; merge_deals combines duplicates; bulk_update_stage moves many records at once.\n\nCompanies: search, create, update, delete, link contacts, count, tags (update_company_tags for add/remove). Use duplicate_check BEFORE creating a new company or prospect to avoid duplicates.\n\nTouchpoints: log on a prospect OR a deal. Exactly one of prospect_id or deal_id is required.\n\nCalendar events: list upcoming events, create manual events (meetings booked via Google are in list_meetings).\n\nSegments: full CRUD for BOTH contact segments and company segments (entity field). create_segment builds rule-based segments; update_segment modifies name/description/rules/entity; delete_segment removes them. Company segments match companies by industry, size, revenue, tags, country, deal aggregates (open_deals, total_deal_value, has_open_deal) and can return all contacts under the matched companies (run_company_segment). Invalid rules now error clearly instead of matching everyone.\n\nMeetings: get_availability, create (with Google Meet link), cancel, list.\n\nInsights: pipeline_summary (contacts + deals), win_loss_summary (contacts + deals), count_companies, count_deals, daily_digest, activity_goals_status.\n\nWorkspace: info, members, add/remove members, list all workspaces.\n\nEmail: ALWAYS prefer send_gmail_email (free, better deliverability). Only use send_email (Resend) as fallback when Gmail is not connected. Emails are synced from connected Gmail — search, threads, send.\n\nApollo: people/company search, enrichment, sending.\n\nDestructive tools (delete_*, merge_deals) require confirm: true. Create meetings with get_meeting_availability first. COMPANY POLICY: create_company creates ONLY the company record — never create a prospect whose name is a company name. Contacts must be real people; only add them when you have their actual info. If no real contacts are known, leave them out and ask the user who to add. Custom stages: if a workspace has custom pipeline stages, use those IDs (pipeline_summary valid_stages returns them). Currency: deal values are returned in the workspace currency (see currency field in responses).',
  });

  // Read ───
  server.tool(
    'pipeline_summary',
    'Counts and total values per pipeline stage across BOTH contacts (prospects) and company deals in the active workspace. Returns the workspace valid stage ids.',
    { stage: z.string().optional().describe('Filter to a single stage') },
    async ({ stage }) => {
      try {
        const { ids: validStages, labels: stageLabels } = await workspaceStages();
        const build = (table) => () => {
          let q = sb.from(table).select('stage, deal_value').eq('workspace_id', ctx.workspaceId);
          if (stage) q = q.eq('stage', stage);
          return q;
        };
        const [prospectRows, dealRows, currency] = await Promise.all([
          fetchAll(build('prospects')),
          fetchAll(build('deals')).catch(() => []),
          workspaceCurrency(),
        ]);
        const tally = (rows) => {
          const counts = {}, values = {};
          let totalValue = 0;
          rows.forEach(r => {
            counts[r.stage] = (counts[r.stage] || 0) + 1;
            values[r.stage] = (values[r.stage] || 0) + (Number(r.deal_value) || 0);
            totalValue += Number(r.deal_value) || 0;
          });
          return { counts, values, totalValue };
        };
        const p = tally(prospectRows), d = tally(dealRows);
        const fmtVals = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, formatMoney(v, currency)]));
        return { content: [{ type: 'text', text: JSON.stringify({
          valid_stages: validStages,
          stage_labels: stageLabels,
          currency,
          contacts: { stages: p.counts, deal_values: fmtVals(p.values), total_prospects: prospectRows.length, total_deal_value: formatMoney(p.totalValue, currency) },
          deals: { stages: d.counts, deal_values: fmtVals(d.values), total_deals: dealRows.length, total_deal_value: formatMoney(d.totalValue, currency) },
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'search_prospects',
    'Search prospects by name, company, or email. Returns id, name, company, stage, tier, deal value, lead source.',
    {
      query: z.string().describe('Search term (name, company, or email)'),
      stage: z.string().optional().describe('Filter by stage'),
      lead_source: z.string().optional().describe('Filter by lead source'),
      limit: z.number().min(1).max(50).optional().describe('Max results (default 20)'),
    },
    async ({ query, stage, lead_source, limit }) => {
      try {
        let q = sb.from('prospects').select('id, name, title, company, email, stage, tier, deal_value, lead_source, created_at')
          .eq('workspace_id', ctx.workspaceId)
          .or(`name.ilike.%${query}%,company.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(Math.min(limit || 20, 50));
        if (stage) q = q.eq('stage', stage);
        if (lead_source) q = q.eq('lead_source', lead_source);
        const { data, error } = await q;
        if (error) throw error;
        return { content: [{ type: 'text', text: JSON.stringify(data || [], null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_prospect',
    'Full detail for one prospect including recent touchpoints.',
    { prospect_id: z.union([z.string(), z.number()]).describe('Prospect UUID') },
    async ({ prospect_id }) => {
      try {
        const { data: p, error } = await sb.from('prospects')
          .select('*').eq('id', prospect_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
        if (error) throw error;
        if (!p) return { content: [{ type: 'text', text: 'Prospect not found in this workspace' }] };
        const { data: tps } = await sb.from('touchpoints')
          .select('*').eq('prospect_id', prospect_id).order('date', { ascending: false }).limit(25);
        return { content: [{ type: 'text', text: JSON.stringify({ ...p, touchpoints: tps || [] }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'list_meetings',
    'List scheduled meetings in the workspace.',
    {
      status: z.enum(['scheduled', 'cancelled']).optional().describe('Filter by status'),
      limit: z.number().min(1).max(50).optional().describe('Max results (default 20)'),
    },
    async ({ status, limit }) => {
      try {
        let q = sb.from('meetings').select('id, guest_name, guest_email, guest_company, starts_at, ends_at, status, location')
          .eq('workspace_id', ctx.workspaceId).order('starts_at', { ascending: false }).limit(Math.min(limit || 20, 50));
        if (status) q = q.eq('status', status);
        const { data, error } = await q;
        if (error) throw error;
        return { content: [{ type: 'text', text: JSON.stringify(data || [], null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'list_sequences',
    'List outreach sequences available in the workspace.',
    {},
    async () => {
      try {
        const { data, error } = await sb.from('sequences')
          .select('id, name, created_at').eq('workspace_id', ctx.workspaceId).limit(50);
        if (error) throw error;
        return { content: [{ type: 'text', text: JSON.stringify(data || [], null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // Write ───
server.tool(
    'create_prospect',
    'Add a new prospect (a real person) to the pipeline. The name must be a real person — never use a company name as the prospect name. If the name matches an existing company, at least one of email/phone/title is required.',
    {
      name: z.string().min(1).describe('Full name of a real person'),
      company: z.string().optional(),
      title: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      linkedin: z.string().optional(),
      tier: z.enum(['cold', 'warm', 'hot']).optional(),
      stage: z.string().optional().describe('Pipeline stage id for this workspace (see pipeline_summary or list_workspaces for valid stages)'),
      deal_value: z.number().min(0).optional(),
      lead_source: z.string().optional().describe('Where this lead came from (e.g. Inbound, Outbound, Referral, LinkedIn, Event)'),
      tags: z.array(z.string()).optional().describe('Labels/tags for this contact'),
      countries: z.array(z.string()).optional(),
      notes: z.string().optional(),
    },
    async (args) => {
      try {
        if (args.stage) {
          const bad = await validateStage(args.stage);
          if (bad) return bad;
        }
        let companies = [];
        try {
          const { data } = await sb.from('companies').select('name').eq('workspace_id', ctx.workspaceId);
          companies = (data || []).map(c => String(c.name || '').trim().toLowerCase()).filter(Boolean);
        } catch { /* companies table missing — guard skipped */ }
        const looksLikeCompany = companies.includes(String(args.name).trim().toLowerCase());
        if (looksLikeCompany && !(args.email || args.phone || args.title)) {
          return { content: [{ type: 'text', text: `"${args.name}" is a company in this workspace — not a person. Don't create a contact named after the company. Add real people instead: provide the person's name with at least an email, phone, or job title, or pass them via create_company contacts, or ask the user who the contacts at ${args.name} are.` }], isError: true };
        }
        const { data, error } = await sb.from('prospects').insert({
          workspace_id: ctx.workspaceId,
          name: args.name,
          company: args.company || null,
          title: args.title || null,
          email: args.email || null,
          phone: args.phone || null,
          linkedin: args.linkedin || null,
          tier: args.tier || 'cold',
          stage: args.stage || 'lead',
          deal_value: args.deal_value || 0,
          lead_source: args.lead_source || '',
          angle: null,
          notes: args.notes || '',
          tags: (args.tags || []).map(t => String(t).trim()).filter(Boolean).map((name, i) => ({ name, color: ['Red','Orange','Yellow','Green','Blue','Purple','Gray'][i % 7] })),
          countries: args.countries || [],
          stage_entered_at: new Date().toISOString().slice(0, 10),
        }).select('id, name, stage').single();
        if (error) throw error;
        mcpLog({
          action: 'added', entityType: 'prospect', entityId: data.id, entityName: data.name,
          summary: `added ${data.name}${args.company ? ` from ${args.company}` : ''} as a new prospect`,
          metadata: { company: args.company || null, tier: args.tier || 'cold', stage: data.stage },
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'update_stage',
    'Move a prospect to a new pipeline stage. Optionally record the outcome (won/lost) with reason, notes, and the actual closed deal value.',
    {
      prospect_id: z.union([z.string(), z.number()]),
      stage: z.string().describe('Target pipeline stage id for this workspace'),
      outcome_reason: z.string().optional().describe('Why the deal won or lost'),
      outcome_notes: z.string().optional().describe('Extra notes on the outcome'),
      deal_value: z.number().min(0).optional().describe('Actual closed deal value'),
    },
    async ({ prospect_id, stage, outcome_reason, outcome_notes, deal_value }) => {
      try {
        const bad = await validateStage(stage);
        if (bad) return bad;
        const normalizedStage = await normalizeStage(stage);
        const updates = { stage: normalizedStage, stage_entered_at: new Date().toISOString().slice(0, 10) };
        if (outcome_reason !== undefined) updates.outcome_reason = outcome_reason;
        if (outcome_notes !== undefined) updates.outcome_notes = outcome_notes;
        if (deal_value !== undefined) updates.deal_value = deal_value;
        const { data, error } = await sb.from('prospects')
          .update(updates)
          .eq('id', prospect_id).eq('workspace_id', ctx.workspaceId)
          .select('id, name, stage, deal_value').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Prospect not found in this workspace' }] };
        mcpLog({
          action: 'moved', entityType: 'prospect', entityId: data.id, entityName: data.name,
          summary: `moved ${data.name} to ${data.stage}`,
          metadata: { stage: data.stage, deal_value: data.deal_value },
        });
        return { content: [{ type: 'text', text: `Moved ${data.name} to ${data.stage} (deal value ${formatMoney(data.deal_value, await workspaceCurrency())})` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'log_touchpoint',
    'Log an outreach touchpoint (call, email, meeting...) on a prospect OR a deal. Exactly one of prospect_id or deal_id is required.',
    {
      prospect_id: z.union([z.string(), z.number()]).optional(),
      deal_id: z.union([z.string(), z.number()]).optional(),
      channel: z.enum(['Email', 'LinkedIn', 'Call', 'SMS', 'Calendar', 'Other']),
      note: z.string().describe('What happened in the interaction'),
      outcome: z.enum(['pending', 'replied', 'bounced', 'no_reply', 'unsubscribed']).optional(),
    },
    async ({ prospect_id, deal_id, channel, note, outcome }) => {
      try {
        if (!prospect_id && !deal_id) return { content: [{ type: 'text', text: 'Provide exactly one of prospect_id or deal_id' }], isError: true };
        if (prospect_id && deal_id) return { content: [{ type: 'text', text: 'Provide exactly one of prospect_id or deal_id, not both' }], isError: true };
        const entityLabel = prospect_id ? 'prospect' : 'deal';
        const entityId = prospect_id || deal_id;
        const entityCol = prospect_id ? 'prospect_id' : 'deal_id';
        const payload = {
          [entityCol]: entityId,
          channel,
          note,
          outcome: outcome || 'pending',
          date: new Date().toISOString().slice(0, 10),
          created_by: ctx.userId,
          workspace_id: ctx.workspaceId,
        };
        let { data, error } = await sb.from('touchpoints').insert(payload).select('id, date, channel').single();
        // If touchpoints.workspace_id is missing in schema cache, retry without it
        if (error && error.code === 'PGRST204' && /workspace_id/i.test(error.message || '')) {
          delete payload.workspace_id;
          ({ data, error } = await sb.from('touchpoints').insert(payload).select('id, date, channel').single());
        }
        if (error) throw error;
        (async () => {
          let name = null, company = null;
          try {
            if (prospect_id) {
              const { data: p } = await sb.from('prospects').select('name, company').eq('id', prospect_id).maybeSingle();
              name = p?.name; company = p?.company;
            } else {
              const { data: d } = await sb.from('deals').select('name, companies(name)').eq('id', deal_id).maybeSingle();
              name = d?.name; company = d?.companies?.name;
            }
          } catch { /* ignore */ }
          const verbs = { Email: 'emailed', LinkedIn: 'sent a LinkedIn message to', Call: 'called', SMS: 'texted', Calendar: 'booked a meeting with', Other: 'followed up with' };
          const verb = verbs[channel] || 'followed up with';
          mcpLog({
            action: 'touchpoint', entityType: 'touchpoint', entityId: data.id, entityName: name || null,
            summary: `${verb} ${name || `a ${entityLabel}`}${company ? ` (${company})` : ''} [${entityLabel}]`,
            metadata: { channel, outcome: outcome || 'pending', [entityCol]: entityId },
          });
        })();
        return { content: [{ type: 'text', text: `Touchpoint logged on ${data.date}: ${channel} on ${entityLabel}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ─── Prospects: full edit ───
  server.tool(
    'update_prospect',
    'update any field on an existing prospect: deal value, tier, notes, title, company, email, phone, linkedin, angle, tags, lead source, outcome details.',
    {
      prospect_id: z.union([z.string(), z.number()]),
      name: z.string().min(1).optional(),
      title: z.string().optional(),
      company: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      linkedin: z.string().optional(),
      tier: z.enum(['cold', 'warm', 'hot']).optional(),
      stage: z.string().optional().describe('Pipeline stage id for this workspace'),
      deal_value: z.number().min(0).optional(),
      lead_source: z.string().optional().describe('Where this lead came from'),
      angle: z.string().optional(),
      notes: z.string().optional(),
      tags: z.array(z.string()).optional(),
      countries: z.array(z.string()).optional(),
      outcome_reason: z.string().optional(),
      outcome_notes: z.string().optional(),
    },
    async (args) => {
      try {
        const { prospect_id, ...fields } = args;
        if (Object.keys(fields).length === 0) return { content: [{ type: 'text', text: 'Nothing to update — provide at least one field' }] };
        if (fields.stage !== undefined) {
          const bad = await validateStage(fields.stage);
          if (bad) return bad;
          fields.stage = await normalizeStage(fields.stage);
        }
        const updates = { ...fields };
        if (updates.tags !== undefined) {
          const TAG_PALETTE = ['Red','Orange','Yellow','Green','Blue','Purple','Gray'];
          updates.tags = (Array.isArray(updates.tags) ? updates.tags : [])
            .map(t => (t && typeof t === 'object' ? t : { name: String(t ?? '').trim(), color: null }))
            .map((t, i) => ({ name: String(t.name || '').trim(), color: t.color || TAG_PALETTE[i % TAG_PALETTE.length] }))
            .filter(t => t.name);
        }
        if (updates.stage !== undefined) updates.stage_entered_at = new Date().toISOString().slice(0, 10);
        const { data, error } = await sb.from('prospects')
          .update(updates)
          .eq('id', prospect_id).eq('workspace_id', ctx.workspaceId)
          .select('id, name, stage, tier, deal_value, company').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Prospect not found in this workspace' }] };
        mcpLog({
          action: 'updated', entityType: 'prospect', entityId: data.id, entityName: data.name,
          summary: `updated ${data.name}${data.company ? ` from ${data.company}` : ''}`,
          metadata: { fields: Object.keys(fields) },
        });
        return { content: [{ type: 'text', text: `Updated ${data.name}: ` + Object.keys(fields).join(', ') }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'update_prospect_tags',
    'Add or remove tags (labels) on a contact WITHOUT overwriting the rest. Pass add_tags and/or remove_tags. Tags are plain strings, case-insensitive (adding "Fintech" when "fintech" exists just keeps one). Use update_prospect tags param only for full replacement.',
    {
      prospect_id: z.union([z.string(), z.number()]),
      add_tags: z.array(z.string()).optional().describe('Tags to add'),
      remove_tags: z.array(z.string()).optional().describe('Tags to remove (case-insensitive)'),
    },
    async ({ prospect_id, add_tags, remove_tags }) => {
      try {
        if (!add_tags?.length && !remove_tags?.length) return { content: [{ type: 'text', text: 'Provide add_tags and/or remove_tags' }], isError: true };
        const { data: p, error: qErr } = await sb.from('prospects').select('id, name, tags')
          .eq('id', prospect_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
        if (qErr) throw qErr;
        if (!p) return { content: [{ type: 'text', text: 'Prospect not found in this workspace' }], isError: true };
        const toName = t => (t && typeof t === 'object' ? t.name : t);
        const current = (Array.isArray(p.tags) ? p.tags : [])
          .map(t => (t && typeof t === 'object' ? t : { name: String(toName(t) || '').trim(), color: null }))
          .map(t => ({ ...t, name: String(t.name || '').trim() }))
          .filter(t => t.name);
        const rm = new Set((Array.isArray(remove_tags) ? remove_tags : []).map(t => String(t || '').trim().toLowerCase()).filter(Boolean));
        const kept = current.filter(t => !rm.has(t.name.toLowerCase()));
        const existing = new Set(kept.map(t => t.name.toLowerCase()));
        const added = [];
        const TAG_PALETTE = ['Red','Orange','Yellow','Green','Blue','Purple','Gray'];
        (Array.isArray(add_tags) ? add_tags : []).map(t => String(t || '').trim()).filter(Boolean).forEach(name => {
          if (!existing.has(name.toLowerCase())) {
            const color = TAG_PALETTE[kept.length % TAG_PALETTE.length];
            kept.push({ name, color });
            existing.add(name.toLowerCase());
            added.push(name);
          }
        });
        const removedCount = current.filter(t => rm.has(t.name.toLowerCase())).length;
        const { error: uErr } = await sb.from('prospects').update({ tags: kept }).eq('id', prospect_id).eq('workspace_id', ctx.workspaceId);
        if (uErr) throw uErr;
        const names = kept.map(t => t.name);
        mcpLog({
          action: 'updated', entityType: 'prospect', entityId: p.id, entityName: p.name,
          summary: `${added.length ? 'added ' + added.join(', ') : ''}${added.length && removedCount ? ' and ' : ''}${removedCount ? 'removed ' + removedCount + ' tag' + (removedCount > 1 ? 's' : '') : ''} on ${p.name}`,
          metadata: { tags: names },
        });
        return { content: [{ type: 'text', text: `Tags updated on ${p.name}. Current tags: ${names.length ? names.join(', ') : 'none'}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'delete_prospect',
    'Permanently delete a prospect and all its touchpoints. Requires confirm: true.',
    {
      prospect_id: z.union([z.string(), z.number()]),
      confirm: z.boolean().describe('Must be true to delete'),
    },
    async ({ prospect_id, confirm }) => {
      try {
        if (!confirm) return { content: [{ type: 'text', text: 'Deletion cancelled — set confirm: true to proceed' }] };
        await sb.from('touchpoints').delete().eq('prospect_id', prospect_id);
        const { data, error } = await sb.from('prospects')
          .delete().eq('id', prospect_id).eq('workspace_id', ctx.workspaceId)
          .select('id, name').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Prospect not found in this workspace' }] };
        mcpLog({
          action: 'deleted', entityType: 'prospect', entityId: data.id, entityName: data.name,
          summary: `removed ${data.name} from the pipeline`,
        });
        return { content: [{ type: 'text', text: `Deleted prospect: ${data.name}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ─── Companies ───
  server.tool(
    'search_companies',
    'Search companies in the workspace by name, domain, or industry. Returns total count matching the query.',
    {
      query: z.string().optional().describe('Search term (name or domain) — omit to list all'),
      industry: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
    },
    async ({ query, industry, limit }) => {
      try {
        let q = sb.from('companies').select('id, name, domain, industry, company_size, annual_revenue, city, country, tags')
          .eq('workspace_id', ctx.workspaceId);
        if (query) q = q.or(`name.ilike.%${query}%,domain.ilike.%${query}%`);
        if (industry) q = q.eq('industry', industry);
        const lim = Math.min(limit || 50, 100);
        q = q.order('name', { ascending: true }).limit(lim);
        const { data, error, count } = await q;
        if (error) throw error;
        return { content: [{ type: 'text', text: JSON.stringify({ total: count ?? (data || []).length, companies: data || [] }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'count_companies',
    'Returns the total number of companies in the active workspace.',
    {},
    async () => {
      try {
        const { count, error } = await sb.from('companies').select('id', { count: 'exact', head: true }).eq('workspace_id', ctx.workspaceId);
        if (error) throw error;
        return { content: [{ type: 'text', text: JSON.stringify({ total_companies: count || 0 }) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_company',
    'Full detail for one company in the workspace.',
    { company_id: z.union([z.string(), z.number()]) },
    async ({ company_id }) => {
      try {
        const { data, error } = await sb.from('companies')
          .select('*').eq('id', company_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Company not found in this workspace' }] };
        const { data: prospects } = await sb.from('prospects')
          .select('id, name, stage, deal_value').eq('workspace_id', ctx.workspaceId).eq('company', data.name).limit(50);
        return { content: [{ type: 'text', text: JSON.stringify({ ...data, prospects: prospects || [] }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'create_company',
    'Add a new company to the workspace. Creates ONLY the company — it does NOT create contacts. Only pass contacts when you have real people (given by the user or found via people search); never invent a contact named after the company. If you cannot find real people, leave contacts empty and ask the user who to add.',
    {
      name: z.string().min(1),
      domain: z.string().optional(),
      industry: z.string().optional(),
      company_size: z.string().optional(),
      annual_revenue: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      country: z.string().optional(),
      description: z.string().optional(),
      linkedin_url: z.string().optional(),
      tags: z.array(z.string()).optional(),
      contacts: z.array(z.object({
        name: z.string().min(1).describe('Real person full name'),
        title: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        linkedin: z.string().optional(),
        tier: z.enum(['cold', 'warm', 'hot']).optional(),
        lead_source: z.string().optional().describe('Where this lead came from'),
      })).optional().describe('Real people at this company to add as contacts — only when known (user-provided or from search results). Never include a contact named after the company.'),
    },
    async (args) => {
      try {
        const { data, error } = await sb.from('companies').insert({
          workspace_id: ctx.workspaceId,
          name: args.name,
          domain: args.domain || '',
          industry: args.industry || '',
          company_size: args.company_size || '',
          annual_revenue: args.annual_revenue || '',
          phone: args.phone || '',
          address: args.address || '',
          city: args.city || '',
          region: args.region || '',
          country: args.country || '',
          description: args.description || '',
          linkedin_url: args.linkedin_url || '',
          tags: args.tags || [],
          custom_fields: {},
        }).select('id, name, domain, industry').single();
        if (error) throw error;
        const contacts = [];
        for (const c of args.contacts || []) {
          if (!c.name || String(c.name).toLowerCase() === String(args.name).toLowerCase()) continue;
          const { data: p, error: pErr } = await sb.from('prospects').insert({
            workspace_id: ctx.workspaceId,
            name: c.name,
            company: args.name,
            title: c.title || null,
            email: c.email || null,
            phone: c.phone || null,
            linkedin: c.linkedin || null,
            tier: c.tier || 'cold',
            stage: 'lead',
            deal_value: 0,
            lead_source: c.lead_source || '',
            angle: null,
            notes: '',
            created_by: ctx.userId,
            stage_entered_at: new Date().toISOString().slice(0, 10),
          }).select('id, name, email, title').single();
          if (pErr) throw pErr;
          contacts.push(p);
        }
        mcpLog({
          action: 'added', entityType: 'company', entityId: data.id, entityName: data.name,
          summary: `added ${data.name} to the company list${contacts.length ? ` with ${contacts.length} contact${contacts.length > 1 ? 's' : ''}` : ''}`,
          metadata: { industry: args.industry || null, contacts_added: contacts.length },
        });
        return { content: [{ type: 'text', text: JSON.stringify({ company: data, contacts_added: contacts }, null, 2) }] };
      } catch (err) {
        if (/schema cache|Could not find the table/.test(err.message)) {
          return { content: [{ type: 'text', text: 'Companies table is missing — run backend/companies.sql in the Supabase SQL editor first, then retry.' }], isError: true };
        }
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'update_company',
    'Update fields on an existing company.',
    {
      company_id: z.union([z.string(), z.number()]),
      name: z.string().min(1).optional(),
      domain: z.string().optional(),
      industry: z.string().optional(),
      company_size: z.string().optional(),
      annual_revenue: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      country: z.string().optional(),
      description: z.string().optional(),
      linkedin_url: z.string().optional(),
      tags: z.array(z.string()).optional(),
    },
    async (args) => {
      try {
        const { company_id, ...fields } = args;
        if (Object.keys(fields).length === 0) return { content: [{ type: 'text', text: 'Nothing to update — provide at least one field' }] };
        const { data, error } = await sb.from('companies')
          .update(fields).eq('id', company_id).eq('workspace_id', ctx.workspaceId)
          .select('id, name').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Company not found in this workspace' }] };
        mcpLog({
          action: 'updated', entityType: 'company', entityId: data.id, entityName: data.name,
          summary: `updated ${data.name}'s profile`,
          metadata: { fields: Object.keys(fields) },
        });
        return { content: [{ type: 'text', text: `Updated ${data.name}: ` + Object.keys(fields).join(', ') }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'update_company_tags',
    'Add or remove tags (labels) on a company WITHOUT overwriting the rest. Pass add_tags and/or remove_tags. Tags are plain strings, case-insensitive.',
    {
      company_id: z.union([z.string(), z.number()]),
      add_tags: z.array(z.string()).optional().describe('Tags to add'),
      remove_tags: z.array(z.string()).optional().describe('Tags to remove (case-insensitive)'),
    },
    async ({ company_id, add_tags, remove_tags }) => {
      try {
        if (!add_tags?.length && !remove_tags?.length) return { content: [{ type: 'text', text: 'Provide add_tags and/or remove_tags' }], isError: true };
        const { data: c, error: qErr } = await sb.from('companies').select('id, name, tags')
          .eq('id', company_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
        if (qErr) throw qErr;
        if (!c) return { content: [{ type: 'text', text: 'Company not found in this workspace' }], isError: true };
        const normalize = arr => (Array.isArray(arr) ? arr : [])
          .map(t => (t && typeof t === 'object' ? t.name : t))
          .map(t => String(t || '').trim()).filter(Boolean);
        const current = normalize(c.tags);
        const rm = new Set(normalize(remove_tags).map(t => t.toLowerCase()));
        const kept = current.filter(t => !rm.has(t.toLowerCase()));
        const existing = new Set(kept.map(t => t.toLowerCase()));
        const added = [];
        normalize(add_tags).forEach(t => {
          if (!existing.has(t.toLowerCase())) { kept.push(t); existing.add(t.toLowerCase()); added.push(t); }
        });
        const { error: uErr } = await sb.from('companies').update({ tags: kept }).eq('id', company_id).eq('workspace_id', ctx.workspaceId);
        if (uErr) throw uErr;
        mcpLog({
          action: 'updated', entityType: 'company', entityId: c.id, entityName: c.name,
          summary: `${added.length ? 'added ' + added.join(', ') : ''}${added.length && rm.size ? ' and ' : ''}${rm.size ? 'removed ' + rm.size + ' tag' + (rm.size > 1 ? 's' : '') : ''} on ${c.name}`,
          metadata: { tags: kept },
        });
        return { content: [{ type: 'text', text: `Tags updated on ${c.name}. Current tags: ${kept.length ? kept.join(', ') : 'none'}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'delete_company',
    'Permanently delete a company. Requires confirm: true.',
    {
      company_id: z.union([z.string(), z.number()]),
      confirm: z.boolean(),
    },
    async ({ company_id, confirm }) => {
      try {
        if (!confirm) return { content: [{ type: 'text', text: 'Deletion cancelled — set confirm: true to proceed' }] };
        const { data, error } = await sb.from('companies')
          .delete().eq('id', company_id).eq('workspace_id', ctx.workspaceId)
          .select('id, name').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Company not found in this workspace' }] };
        mcpLog({
          action: 'deleted', entityType: 'company', entityId: data.id, entityName: data.name,
          summary: `removed ${data.name} from the company list`,
        });
        return { content: [{ type: 'text', text: `Deleted company: ${data.name}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'link_prospect_to_company',
    'Associate a prospect with a company by company name.',
    {
      prospect_id: z.union([z.string(), z.number()]),
      company_name: z.string().describe('Company name to link (as shown on the Companies page)'),
    },
    async ({ prospect_id, company_name }) => {
      try {
        const { data, error } = await sb.from('prospects')
          .update({ company: company_name })
          .eq('id', prospect_id).eq('workspace_id', ctx.workspaceId)
          .select('id, name, company').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Prospect not found in this workspace' }] };
        return { content: [{ type: 'text', text: `Linked ${data.name} to ${data.company}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ─── Deals (company pipeline) ───
  async function resolveCompanyId(name) {
    if (!name) return null;
    const { data } = await sb.from('companies').select('id, name')
      .eq('workspace_id', ctx.workspaceId).ilike('name', String(name).trim()).limit(1);
    return data?.[0]?.id ?? null;
  }

  async function resolveContactId(name) {
    if (!name) return null;
    const { data } = await sb.from('prospects').select('id')
      .eq('workspace_id', ctx.workspaceId).ilike('name', String(name).trim()).limit(1);
    return data?.[0]?.id ?? null;
  }

  server.tool(
    'list_deals',
    'List and search company deals in the active workspace: id, name, company, stage, value, priority, close date, owner, primary contact.',
    {
      query: z.string().optional().describe('Search deal name'),
      company: z.string().optional().describe('Filter by company name (partial match)'),
      stage: z.string().optional().describe('Filter by pipeline stage'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 25)'),
    },
    async ({ query, company, stage, limit }) => {
      try {
        if (stage) { const bad = await validateStage(stage); if (bad) return bad; }
        let q = sb.from('deals')
          .select('id, name, stage, deal_value, priority, close_date, deal_type, owner_name, primary_contact_name, companies(name)')
          .eq('workspace_id', ctx.workspaceId).order('created_at', { ascending: false })
          .limit(Math.min(limit || 25, 100));
        if (query) q = q.ilike('name', `%${query}%`);
        if (company) q = q.ilike('companies.name', `%${company}%`);
        if (stage) q = q.eq('stage', stage);
        const { data, error } = await q;
        if (error) throw error;
        const currency = await workspaceCurrency();
        const rows = (data || []).map(({ companies, ...d }) => ({ ...d, deal_value: formatMoney(d.deal_value, currency), company: companies?.name || null }));
        return { content: [{ type: 'text', text: JSON.stringify({ currency, deals: rows }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'count_deals',
    'Returns the total number of deals and a breakdown by stage in the active workspace.',
    {},
    async () => {
      try {
        const { ids: validStages, labels: stageLabels } = await workspaceStages();
        const { data: rows, error } = await sb.from('deals').select('stage').eq('workspace_id', ctx.workspaceId);
        if (error) throw error;
        const stageCounts = {};
        validStages.forEach(s => { stageCounts[stageLabels[s] || s] = 0; });
        (rows || []).forEach(r => { const label = stageLabels[r.stage] || r.stage; stageCounts[label] = (stageCounts[label] || 0) + 1; });
        return { content: [{ type: 'text', text: JSON.stringify({ total_deals: (rows || []).length, by_stage: stageCounts }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'search_deals',
    'Full-text search across all deal fields (name, company, contact, owner, notes) in the active workspace. More thorough than list_deals which only searches name.',
    {
      query: z.string().min(1).describe('Search term — matches deal name, company name, contact, or owner'),
      stage: z.string().optional().describe('Optional stage filter'),
      limit: z.number().min(1).max(50).optional().describe('Max results (default 10)'),
    },
    async ({ query, stage, limit }) => {
      try {
        if (stage) { const bad = await validateStage(stage); if (bad) return bad; }
        const lim = Math.min(limit || 10, 50);
        const term = `%${query}%`;
        // Search deal-owned columns via or(); foreign-table (companies.name) filters
        // inside .or() break PostgREST's logic-tree parser, so company matches are
        // resolved separately below.
        let q = sb.from('deals')
          .select('id, name, stage, deal_value, priority, close_date, deal_type, owner_name, primary_contact_name, notes, companies(name)')
          .eq('workspace_id', ctx.workspaceId)
          .or(`name.ilike.${term},owner_name.ilike.${term},primary_contact_name.ilike.${term}`)
          .order('created_at', { ascending: false })
          .limit(lim);
        if (stage) q = q.eq('stage', stage);
        const { data, error } = await q;
        if (error) throw error;

        // Company-name matches: find companies by name, then their deals
        const { data: cos, error: coErr } = await sb.from('companies')
          .select('id, name, deals(id, name, stage, deal_value, priority, close_date, deal_type, owner_name, primary_contact_name, notes)')
          .eq('workspace_id', ctx.workspaceId).ilike('name', term).limit(20);
        if (coErr) throw coErr;

        const byId = new Map();
        (data || []).forEach(d => byId.set(String(d.id), d));
        (cos || []).forEach(co => {
          (co.deals || []).forEach(d => {
            if (!byId.has(String(d.id)) && (!stage || d.stage === stage)) byId.set(String(d.id), { ...d, companies: { name: co.name } });
          });
        });

        const rowsAll = [...byId.values()].slice(0, lim);
        if (!rowsAll.length) return { content: [{ type: 'text', text: `No deals matching "${query}" in this workspace.` }] };
        const currency = await workspaceCurrency();
        const rows = rowsAll.map(({ companies, ...d }) => ({
          ...d,
          deal_value: formatMoney(d.deal_value, currency),
          company: companies?.name || null,
        }));
        return { content: [{ type: 'text', text: JSON.stringify({ query, results: rows.length, deals: rows }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'merge_deals',
    'Merge two deals into one. The primary deal keeps its identity; the secondary deal\'s touchpoints and notes are moved over, then it is deleted. Requires confirm: true.',
    {
      primary_deal_id: z.union([z.string(), z.number()]).describe('Deal to keep'),
      secondary_deal_id: z.union([z.string(), z.number()]).describe('Deal to merge into primary and delete'),
      confirm: z.boolean().optional().describe('Must be true to execute'),
    },
    async ({ primary_deal_id, secondary_deal_id, confirm }) => {
      try {
        if (String(primary_deal_id) === String(secondary_deal_id)) return { content: [{ type: 'text', text: 'Cannot merge a deal into itself.' }], isError: true };
        const { data: primary, error: pErr } = await sb.from('deals').select('id, name, stage').eq('id', primary_deal_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
        if (pErr) throw pErr;
        if (!primary) return { content: [{ type: 'text', text: `Primary deal ${primary_deal_id} not found in this workspace.` }], isError: true };
        const { data: secondary, error: sErr } = await sb.from('deals').select('id, name, stage').eq('id', secondary_deal_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
        if (sErr) throw sErr;
        if (!secondary) return { content: [{ type: 'text', text: `Secondary deal ${secondary_deal_id} not found in this workspace.` }], isError: true };
        if (!confirm) {
          return { content: [{ type: 'text', text: `About to merge "${secondary.name}" (id ${secondary.id}, stage ${secondary.stage}) into "${primary.name}" (id ${primary.id}, stage ${primary.stage}). The secondary deal will be deleted. Call again with confirm: true to execute.` }] };
        }
        const { data: moved, error: moveErr } = await sb.from('touchpoints').update({ deal_id: primary_deal_id }).eq('deal_id', secondary_deal_id);
        if (moveErr && !moveErr.message.includes('column') && !moveErr.message.includes('deal_id')) throw moveErr;
        await sb.from('deals').delete().eq('id', secondary_deal_id).eq('workspace_id', ctx.workspaceId);
        mcpLog({
          action: 'merged', entityType: 'deal', entityId: primary.id, entityName: primary.name,
          summary: `merged deal "${secondary.name}" (id ${secondary.id}) into "${primary.name}"`,
          metadata: { primary_id: primary.id, secondary_id: secondary.id },
        });
        return { content: [{ type: 'text', text: `Merged "${secondary.name}" into "${primary.name}". Touchpoints moved: ${moved?.length ?? 'unknown'}.` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'bulk_update_stage',
    'Move multiple prospects or deals to a new stage in one call. At least one of prospect_ids or deal_ids must be provided.',
    {
      prospect_ids: z.array(z.union([z.string(), z.number()])).optional().describe('Prospect IDs to move'),
      deal_ids: z.array(z.union([z.string(), z.number()])).optional().describe('Deal IDs to move'),
      stage: z.string().describe('Target stage'),
    },
    async ({ prospect_ids, deal_ids, stage }) => {
      try {
        const bad = await validateStage(stage);
        if (bad) return bad;
        const normalizedStage = await normalizeStage(stage);
        if (!prospect_ids?.length && !deal_ids?.length) return { content: [{ type: 'text', text: 'Provide prospect_ids and/or deal_ids.' }], isError: true };
        const results = { stage: normalizedStage, prospects_moved: 0, deals_moved: 0, prospect_errors: [], deal_errors: [] };
        if (prospect_ids?.length) {
          const { data, error } = await sb.from('prospects').update({ stage: normalizedStage }).in('id', prospect_ids).eq('workspace_id', ctx.workspaceId).select('id, name');
          if (error) results.prospect_errors.push(error.message);
          else results.prospects_moved = (data || []).length;
        }
        if (deal_ids?.length) {
          const { data, error } = await sb.from('deals').update({ stage: normalizedStage, stage_entered_at: new Date().toISOString() }).in('id', deal_ids).eq('workspace_id', ctx.workspaceId).select('id, name');
          if (error) results.deal_errors.push(error.message);
          else results.deals_moved = (data || []).length;
        }
        mcpLog({
          action: 'updated', entityType: 'pipeline', summary: `bulk moved ${results.prospects_moved} prospects and ${results.deals_moved} deals to ${stage}`,
          metadata: results,
        });
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_deal_timeline',
    'Full chronological history for one deal: touchpoints, stage changes (via stage_entered_at), notes, and meetings, ordered by date descending.',
    { deal_id: z.union([z.string(), z.number()]) },
    async ({ deal_id }) => {
      try {
        const { data: deal, error } = await sb.from('deals')
          .select('id, name, stage, deal_value, created_at, close_date, companies(name)').eq('id', deal_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
        if (error) throw error;
        if (!deal) return { content: [{ type: 'text', text: 'Deal not found in this workspace' }] };
        const [tpsR, dealFull] = await Promise.all([
          sb.from('touchpoints').select('id, channel, outcome, note, date').eq('deal_id', deal_id).order('date', { ascending: false }).limit(50).then(r => r, () => ({ data: [] })),
          sb.from('deals').select('stage_entered_at, notes').eq('id', deal_id).maybeSingle(),
        ]);
        const tps = tpsR.data || [];
        const events = [
          ...(tps.data || []).map(t => ({ type: 'touchpoint', date: t.date, channel: t.channel, outcome: t.outcome, detail: t.note })),
          { type: 'created', date: deal.created_at, detail: `Deal created${deal.companies?.name ? ` for ${deal.companies.name}` : ''}` },
          deal.close_date ? { type: 'milestone', date: deal.close_date, detail: `Expected close date` } : null,
          dealFull?.stage_entered_at ? { type: 'stage_change', date: dealFull.stage_entered_at, detail: `Entered current stage` } : null,
        ].filter(Boolean).sort((a, b) => new Date(b.date) - new Date(a.date));
        const currency = await workspaceCurrency();
        return { content: [{ type: 'text', text: JSON.stringify({
          deal: { id: deal.id, name: deal.name, stage: deal.stage, value: formatMoney(deal.deal_value, currency), company: deal.companies?.name || null },
          event_count: events.length,
          timeline: events,
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'duplicate_check',
    'Check for duplicate companies or prospects before creating them. Pass a name (and optionally email/domain) and get a list of potential matches in the active workspace.',
    {
      entity: z.enum(['company', 'prospect']).describe('Which entity type to check'),
      name: z.string().min(1).describe('Name to check for duplicates'),
      email: z.string().optional().describe('Email to check (prospects only)'),
      domain: z.string().optional().describe('Domain to check (companies only)'),
    },
    async ({ entity, name, email, domain }) => {
      try {
        if (entity === 'company') {
          const term = `%${name}%`;
          let q = sb.from('companies').select('id, name, domain').eq('workspace_id', ctx.workspaceId).ilike('name', term).limit(10);
          if (domain) q = q.or(`domain.ilike.%${domain}%`);
          const { data, error } = await q;
          if (error) throw error;
          return { content: [{ type: 'text', text: JSON.stringify({
            entity, queried_name: name, domain: domain || null,
            duplicates_found: (data || []).length,
            is_likely_duplicate: (data || []).length > 0,
            matches: data || [],
          }, null, 2) }] };
        }
        const term = `%${name}%`;
        let q = sb.from('prospects').select('id, name, email, company').eq('workspace_id', ctx.workspaceId).ilike('name', term).limit(10);
        const emailMatches = email
          ? await sb.from('prospects').select('id, name, email, company').eq('workspace_id', ctx.workspaceId).eq('email', email).limit(5)
          : { data: [] };
        const { data, error } = await q;
        if (error) throw error;
        const byName = data || [];
        const byEmail = emailMatches.data || [];
        const all = [...byName, ...byEmail.filter(e => !byName.some(n => String(n.id) === String(e.id)))];
        return { content: [{ type: 'text', text: JSON.stringify({
          entity, queried_name: name, email: email || null,
          duplicates_found: all.length,
          is_likely_duplicate: all.length > 0,
          matches: all,
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_deal',
    'Full detail for one deal including its recent touchpoints.',
    { deal_id: z.union([z.string(), z.number()]) },
    async ({ deal_id }) => {
      try {
        const { data, error } = await sb.from('deals')
          .select('*, companies(name)').eq('id', deal_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Deal not found in this workspace' }] };
        const { company } = data;
        const { data: tps } = await sb.from('touchpoints')
          .select('*').eq('deal_id', deal_id).order('date', { ascending: false }).limit(25);
        return { content: [{ type: 'text', text: JSON.stringify({ ...data, company: company?.name || null, touchpoints: tps || [] }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'create_deal',
    'Create a company deal in the pipeline. company_name must be an existing company (create it first with create_company if missing). primary_contact_name should be an existing contact at that company.',
    {
      name: z.string().min(1).describe('Deal name, e.g. "Acme — Enterprise plan"'),
      company_name: z.string().optional().describe('Company this deal belongs to'),
      stage: z.string().optional().describe('Pipeline stage (defaults to workspace first/lead stage)'),
      deal_value: z.number().min(0).optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      close_date: z.string().optional().describe('Expected close date YYYY-MM-DD'),
      deal_type: z.string().optional().describe('e.g. New Business, Renewal, Upsell'),
      owner_name: z.string().optional(),
      primary_contact_name: z.string().optional().describe('Existing contact name to link'),
      notes: z.string().optional(),
    },
    async (args) => {
      try {
        const { ids: valid } = await workspaceStages();
        const stage = await normalizeStage(args.stage) || (valid.includes('lead') ? 'lead' : valid[0]);
        if (args.stage) { const bad = await validateStage(args.stage); if (bad) return bad; }
        const companyId = await resolveCompanyId(args.company_name);
        if (args.company_name && !companyId) {
          return { content: [{ type: 'text', text: `No company named "${args.company_name}" in this workspace — create it with create_company first or pick an existing one via search_companies.` }], isError: true };
        }
        const contactId = await resolveContactId(args.primary_contact_name);
        const { data, error } = await sb.from('deals').insert({
          workspace_id: ctx.workspaceId,
          company_id: companyId,
          name: args.name,
          stage,
          deal_value: args.deal_value || 0,
          priority: args.priority || 'medium',
          close_date: args.close_date || null,
          deal_type: args.deal_type || '',
          owner_name: args.owner_name || '',
          primary_contact_id: contactId,
          primary_contact_name: args.primary_contact_name || '',
          notes: args.notes || '',
        }).select('id, name, stage, deal_value').single();
        if (error) throw error;
        mcpLog({
          action: 'added', entityType: 'deal', entityId: data.id, entityName: data.name,
          summary: `created deal "${data.name}"${args.company_name ? ` for ${args.company_name}` : ''}`,
          metadata: { stage, deal_value: data.deal_value, company: args.company_name || null },
        });
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        if (/deals|schema cache|Could not find the table/i.test(err.message)) {
          return { content: [{ type: 'text', text: `Error: ${err.message} — if the deals table is missing, run backend/deals-migration.sql in Supabase.` }], isError: true };
        }
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'update_deal',
    'Update any field on a deal: stage, value, priority, close date, type, owner, primary contact, notes, and won/lost outcome reasons.',
    {
      deal_id: z.union([z.string(), z.number()]),
      name: z.string().min(1).optional(),
      stage: z.string().optional(),
      deal_value: z.number().min(0).optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      close_date: z.string().optional(),
      deal_type: z.string().optional(),
      owner_name: z.string().optional(),
      primary_contact_name: z.string().optional().describe('Existing contact name to link (re-resolves the id)'),
      notes: z.string().optional(),
      closed_won_reason: z.string().optional(),
      closed_lost_reason: z.string().optional(),
      associated_call: z.string().optional(),
    },
    async (args) => {
      try {
        const { deal_id, ...fields } = args;
        if (Object.keys(fields).length === 0) return { content: [{ type: 'text', text: 'Nothing to update — provide at least one field' }] };
        if (fields.stage !== undefined) {
          const bad = await validateStage(fields.stage);
          if (bad) return bad;
          fields.stage = await normalizeStage(fields.stage);
        }
        const mapped = { ...fields, updated_at: new Date().toISOString() };
        if (mapped.primary_contact_name !== undefined) {
          mapped.primary_contact_id = await resolveContactId(mapped.primary_contact_name);
        }
        if (mapped.close_date === '') mapped.close_date = null;
        if (mapped.stage !== undefined) mapped.stage_entered_at = new Date().toISOString();
        const { data, error } = await sb.from('deals')
          .update(mapped).eq('id', deal_id).eq('workspace_id', ctx.workspaceId)
          .select('id, name, stage, deal_value').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Deal not found in this workspace' }] };
        mcpLog({
          action: 'updated', entityType: 'deal', entityId: data.id, entityName: data.name,
          summary: `updated deal "${data.name}"`,
          metadata: { fields: Object.keys(fields) },
        });
        return { content: [{ type: 'text', text: `Updated "${data.name}": ` + Object.keys(fields).join(', ') }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'delete_deal',
    'Permanently delete a deal and its touchpoints. Requires confirm: true.',
    {
      deal_id: z.union([z.string(), z.number()]),
      confirm: z.boolean(),
    },
    async ({ deal_id, confirm }) => {
      try {
        if (!confirm) return { content: [{ type: 'text', text: 'Deletion cancelled — set confirm: true to proceed' }] };
        await sb.from('touchpoints').delete().eq('deal_id', deal_id);
        const { data, error } = await sb.from('deals')
          .delete().eq('id', deal_id).eq('workspace_id', ctx.workspaceId)
          .select('id, name').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Deal not found in this workspace' }] };
        mcpLog({
          action: 'deleted', entityType: 'deal', entityId: data.id, entityName: data.name,
          summary: `deleted deal "${data.name}"`,
        });
        return { content: [{ type: 'text', text: `Deleted deal: ${data.name}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ─── Touchpoints & activity ───
  server.tool(
    'list_touchpoints',
    'List touchpoints for a prospect, optionally filtered by channel or outcome.',
    {
      prospect_id: z.union([z.string(), z.number()]),
      channel: z.string().optional(),
      outcome: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
    },
    async ({ prospect_id, channel, outcome, limit }) => {
      try {
        let q = sb.from('touchpoints').select('*')
          .eq('prospect_id', prospect_id).order('date', { ascending: false }).limit(Math.min(limit || 50, 100));
        if (channel) q = q.eq('channel', channel);
        if (outcome) q = q.eq('outcome', outcome);
        const { data, error } = await q;
        if (error) throw error;
        return { content: [{ type: 'text', text: JSON.stringify(data || [], null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'activity_summary',
    'Count of touchpoints by channel, outcome, and day for the workspace over a date range.',
    {
      days: z.number().min(1).max(90).optional().describe('Lookback window in days (default 30)'),
    },
    async ({ days }) => {
      try {
        const since = new Date(Date.now() - (days || 30) * 86400000).toISOString().slice(0, 10);
        const { data, error } = await sb.from('touchpoints')
          .select('date, channel, outcome').eq('date', since).gte('date', since);
        if (error) throw error;
        const byChannel = {}, byOutcome = {}, byDay = {};
        (data || []).forEach(tp => {
          byChannel[tp.channel] = (byChannel[tp.channel] || 0) + 1;
          byOutcome[tp.outcome] = (byOutcome[tp.outcome] || 0) + 1;
          byDay[tp.date] = (byDay[tp.date] || 0) + 1;
        });
        return { content: [{ type: 'text', text: JSON.stringify({ total: (data || []).length, by_channel: byChannel, by_outcome: byOutcome, by_day: byDay }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ─── Templates ───
  server.tool(
    'list_templates',
    'List email templates in the workspace.',
    { category: z.string().optional() },
    async ({ category }) => {
      try {
        let q = sb.from('templates').select('id, name, subject, category, use_count, created_at')
          .eq('workspace_id', ctx.workspaceId).order('created_at', { ascending: false }).limit(100);
        if (category) q = q.eq('category', category);
        const { data, error } = await q;
        if (error) throw error;
        return { content: [{ type: 'text', text: JSON.stringify(data || [], null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'create_template',
    'Create a reusable email template.',
    {
      name: z.string().min(1),
      subject: z.string().describe('Email subject line'),
      body: z.string().describe('Email body'),
      category: z.string().optional(),
    },
    async (args) => {
      try {
        const { data, error } = await sb.from('templates').insert({
          workspace_id: ctx.workspaceId,
          name: args.name,
          subject: args.subject,
          body: args.body,
          category: args.category || 'Cold Email',
          use_count: 0,
          created_by: ctx.userId,
        }).select('id, name, subject').single();
        if (error) throw error;
        return { content: [{ type: 'text', text: `Created template "${data.name}"` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'update_template',
    'Update an existing email template (name, subject, body, or category).',
    {
      template_id: z.union([z.string(), z.number()]),
      name: z.string().min(1).optional(),
      subject: z.string().optional(),
      body: z.string().optional(),
      category: z.string().optional(),
    },
    async (args) => {
      try {
        const { template_id, ...fields } = args;
        if (Object.keys(fields).length === 0) return { content: [{ type: 'text', text: 'Nothing to update' }] };
        const { data, error } = await sb.from('templates')
          .update(fields).eq('id', template_id).eq('workspace_id', ctx.workspaceId)
          .select('id, name').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Template not found in this workspace' }] };
        return { content: [{ type: 'text', text: `Updated template: ${data.name}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'delete_template',
    'Permanently delete a template. Requires confirm: true.',
    {
      template_id: z.union([z.string(), z.number()]),
      confirm: z.boolean(),
    },
    async ({ template_id, confirm }) => {
      try {
        if (!confirm) return { content: [{ type: 'text', text: 'Deletion cancelled — set confirm: true to proceed' }] };
        const { data, error } = await sb.from('templates')
          .delete().eq('id', template_id).eq('workspace_id', ctx.workspaceId)
          .select('id, name').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Template not found in this workspace' }] };
        return { content: [{ type: 'text', text: `Deleted template: ${data.name}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ─── Sequences ───
  server.tool(
    'get_sequence',
    'Full detail for one outreach sequence including its steps.',
    { sequence_id: z.union([z.string(), z.number()]) },
    async ({ sequence_id }) => {
      try {
        const { data, error } = await sb.from('sequences')
          .select('*').eq('id', sequence_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Sequence not found in this workspace' }] };
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'create_sequence',
    'Create an outreach sequence with ordered steps.',
    {
      name: z.string().min(1),
      steps: z.array(z.object({
        day: z.number().int().min(0).describe('Send on day N of the sequence'),
        channel: z.enum(['Email', 'LinkedIn', 'Call', 'SMS']),
        action: z.string().describe('What the step does (e.g. "Send intro email")'),
      })).optional(),
    },
    async (args) => {
      try {
        const { data, error } = await sb.from('sequences').insert({
          workspace_id: ctx.workspaceId,
          name: args.name,
          steps: args.steps || [],
          created_by: ctx.userId,
        }).select('id, name, steps').single();
        if (error) throw error;
        return { content: [{ type: 'text', text: `Created sequence "${data.name}" with ${(data.steps || []).length} steps` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'update_sequence',
    'Rename a sequence or replace its steps.',
    {
      sequence_id: z.union([z.string(), z.number()]),
      name: z.string().min(1).optional(),
      steps: z.array(z.object({
        day: z.number().int().min(0),
        channel: z.enum(['Email', 'LinkedIn', 'Call', 'SMS']),
        action: z.string(),
      })).optional(),
    },
    async (args) => {
      try {
        const { sequence_id, ...fields } = args;
        if (Object.keys(fields).length === 0) return { content: [{ type: 'text', text: 'Nothing to update' }] };
        const { data, error } = await sb.from('sequences')
          .update(fields).eq('id', sequence_id).eq('workspace_id', ctx.workspaceId)
          .select('id, name').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Sequence not found in this workspace' }] };
        return { content: [{ type: 'text', text: `Updated sequence: ${data.name}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'delete_sequence',
    'Permanently delete a sequence. Requires confirm: true.',
    {
      sequence_id: z.union([z.string(), z.number()]),
      confirm: z.boolean(),
    },
    async ({ sequence_id, confirm }) => {
      try {
        if (!confirm) return { content: [{ type: 'text', text: 'Deletion cancelled — set confirm: true to proceed' }] };
        const { data, error } = await sb.from('sequences')
          .delete().eq('id', sequence_id).eq('workspace_id', ctx.workspaceId)
          .select('id, name').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Sequence not found in this workspace' }] };
        return { content: [{ type: 'text', text: `Deleted sequence: ${data.name}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ─── Notes ───
  server.tool(
    'list_notes',
    'List secure notes in the workspace.',
    { limit: z.number().min(1).max(100).optional() },
    async ({ limit }) => {
      try {
        const { data, error } = await sb.from('notes')
          .select('id, title, created_at, updated_at')
          .eq('workspace_id', ctx.workspaceId).order('created_at', { ascending: false }).limit(Math.min(limit || 50, 100));
        if (error) throw error;
        return { content: [{ type: 'text', text: JSON.stringify(data || [], null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_note',
    'Full content of one secure note.',
    { note_id: z.union([z.string(), z.number()]) },
    async ({ note_id }) => {
      try {
        const { data, error } = await sb.from('notes')
          .select('*').eq('id', note_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Note not found in this workspace' }] };
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'create_note',
    'Create a secure note in the workspace.',
    { title: z.string().min(1), content: z.string().describe('Note body') },
    async (args) => {
      try {
        const { data, error } = await sb.from('notes').insert({
          workspace_id: ctx.workspaceId,
          title: args.title,
          content: args.content,
          created_by: ctx.userId,
        }).select('id, title').single();
        if (error) throw error;
        return { content: [{ type: 'text', text: `Created note "${data.title}"` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'update_note',
    'Update the title or content of a secure note.',
    {
      note_id: z.union([z.string(), z.number()]),
      title: z.string().min(1).optional(),
      content: z.string().optional(),
    },
    async (args) => {
      try {
        const { note_id, ...fields } = args;
        if (Object.keys(fields).length === 0) return { content: [{ type: 'text', text: 'Nothing to update' }] };
        const { data, error } = await sb.from('notes')
          .update(fields).eq('id', note_id).eq('workspace_id', ctx.workspaceId)
          .select('id, title').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Note not found in this workspace' }] };
        return { content: [{ type: 'text', text: `Updated note: ${data.title}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'delete_note',
    'Permanently delete a secure note. Requires confirm: true.',
    {
      note_id: z.union([z.string(), z.number()]),
      confirm: z.boolean(),
    },
    async ({ note_id, confirm }) => {
      try {
        if (!confirm) return { content: [{ type: 'text', text: 'Deletion cancelled — set confirm: true to proceed' }] };
        const { data, error } = await sb.from('notes')
          .delete().eq('id', note_id).eq('workspace_id', ctx.workspaceId)
          .select('id, title').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Note not found in this workspace' }] };
        return { content: [{ type: 'text', text: `Deleted note: ${data.title}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ─── Meetings ───
  server.tool(
    'get_meeting_availability',
    'Open booking slots for the workspace over the next N days.',
    { days: z.number().min(1).max(30).optional() },
    async ({ days }) => {
      try {
        const { data: ws, error } = await sb.from('workspaces')
          .select('id, booking_availability, booking_enabled').eq('id', ctx.workspaceId).maybeSingle();
        if (error) throw error;
        if (!ws) return { content: [{ type: 'text', text: 'Workspace not found' }] };
        if (!ws.booking_enabled) return { content: [{ type: 'text', text: 'Booking is disabled for this workspace' }] };
        const open = await computeOpenSlots(ws, Math.min(days || 14, 30));
        return { content: [{ type: 'text', text: JSON.stringify(open, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'create_meeting',
    'Book a meeting with a guest: validates the slot, stores it, and creates a Google Calendar event with a Meet link.',
    {
      start: z.string().describe('Start time as ISO 8601 (e.g. 2026-08-20T14:00:00Z)'),
      end: z.string().describe('End time as ISO 8601'),
      guest_name: z.string().min(1),
      guest_email: z.string().describe('Guest email'),
      guest_company: z.string().optional(),
      guest_notes: z.string().optional(),
      guest_timezone: z.string().optional(),
    },
    async (args) => {
      try {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.guest_email)) {
          return { content: [{ type: 'text', text: 'Invalid guest email address' }], isError: true };
        }
        const { data: ws } = await sb.from('workspaces')
          .select('id, name, booking_name, booking_enabled, booking_availability').eq('id', ctx.workspaceId).maybeSingle();
        if (!ws) return { content: [{ type: 'text', text: 'Workspace not found' }], isError: true };
        if (!ws.booking_enabled) return { content: [{ type: 'text', text: 'Booking is disabled for this workspace — enable it in Settings' }], isError: true };

        const open = await computeOpenSlots(ws, 14);
        const target = new Date(args.start).getTime();
        const available = open.some(day => day.slots.some(s => new Date(s.start).getTime() === target));
        if (!available) return { content: [{ type: 'text', text: 'That time slot is not available. Call get_meeting_availability first.' }], isError: true };

        const { access_token, email, calendar_id } = await getAccessToken(ctx.workspaceId);
        const title = `${ws.booking_name || ws.name} x ${args.guest_company || args.guest_name} Discovery Meeting`;
        const event = {
          summary: title,
          description: 'Booked via MCP' + (args.guest_notes ? `\n\nNotes: ${args.guest_notes}` : ''),
          start: { dateTime: args.start, timeZone: 'UTC' },
          end: { dateTime: args.end, timeZone: 'UTC' },
          attendees: [
            { email, displayName: ws.booking_name || ws.name, responseStatus: 'accepted' },
            { email: args.guest_email, displayName: args.guest_name, responseStatus: 'accepted' },
          ],
          reminders: { useDefault: true },
          conferenceData: {
            createRequest: {
              requestId: `sentery-mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        };
        const created = await googleFetch(`/calendars/${calendar_id || 'primary'}/events`, {
          method: 'POST', accessToken: access_token, body: event, params: { conferenceDataVersion: 1 },
        });
        let meetLink = created.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null;
        if (!meetLink && created.id) {
          for (let i = 0; i < 20 && !meetLink; i++) {
            await new Promise(r => setTimeout(r, 1500));
            try {
              const ev = await googleFetch(`/calendars/${calendar_id || 'primary'}/events/${created.id}`, { accessToken: access_token });
              meetLink = ev.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null;
            } catch {}
          }
        }
        const { data: meeting, error: insErr } = await sb.from('meetings').insert({
          workspace_id: ctx.workspaceId,
          guest_name: args.guest_name,
          guest_email: args.guest_email,
          guest_company: args.guest_company || null,
          guest_notes: args.guest_notes || null,
          guest_timezone: args.guest_timezone || null,
          starts_at: args.start,
          ends_at: args.end,
          status: 'scheduled',
          google_event_id: created.id || null,
          location: meetLink || 'google_meet',
        }).select('id, guest_name, starts_at, status, location').single();
        if (insErr) throw insErr;
        mcpLog({
          action: 'booked', entityType: 'meeting', entityId: meeting.id, entityName: args.guest_name,
          summary: `booked a meeting with ${args.guest_name}${args.guest_company ? ` (${args.guest_company})` : ''} for ${new Date(args.start).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
          metadata: { guest_email: args.guest_email, starts_at: args.start },
        });
        return { content: [{ type: 'text', text: JSON.stringify({ meeting, meet_link: meetLink || null }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'cancel_meeting',
    'Cancel a scheduled meeting (and remove its Google Calendar event).',
    {
      meeting_id: z.union([z.string(), z.number()]),
      reason: z.string().optional(),
    },
    async ({ meeting_id, reason }) => {
      try {
        const { data: meeting } = await sb.from('meetings')
          .select('*').eq('id', meeting_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
        if (!meeting) return { content: [{ type: 'text', text: 'Meeting not found in this workspace' }] };
        if (meeting.status === 'cancelled') return { content: [{ type: 'text', text: 'Meeting is already cancelled' }] };
        if (meeting.google_event_id) {
          try {
            const { access_token, calendar_id } = await getAccessToken(ctx.workspaceId);
            await googleFetch(`/calendars/${calendar_id || 'primary'}/events/${meeting.google_event_id}`, {
              method: 'DELETE', accessToken: access_token,
            });
          } catch (calErr) {
            console.warn('[MCP] cancel_meeting: calendar delete failed:', calErr.message);
          }
        }
        const { data, error } = await sb.from('meetings')
          .update({ status: 'cancelled' })
          .eq('id', meeting_id).eq('workspace_id', ctx.workspaceId)
          .select('id, guest_name, status').single();
        if (error) throw error;
        mcpLog({
          action: 'cancelled', entityType: 'meeting', entityId: data.id, entityName: data.guest_name,
          summary: `cancelled the meeting with ${data.guest_name}`,
          metadata: { reason: reason || null },
        });
        return { content: [{ type: 'text', text: `Cancelled meeting with ${data.guest_name}` + (reason ? ` (${reason})` : '') }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ─── Calendar events (manual events, not booked meetings) ───
  server.tool(
    'list_calendar_events',
    'Upcoming calendar events in the active workspace: title, time, description, and linked contact. This includes manual events only (meetings are covered by list_meetings).',
    {
      days: z.number().min(1).max(90).optional().describe('Look ahead window in days (default 30)'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 25)'),
    },
    async ({ days, limit }) => {
      try {
        const now = new Date().toISOString();
        const horizon = new Date(Date.now() + (days || 30) * 86400000).toISOString();
        const { data, error } = await sb.from('calendar_events')
          .select('id, title, description, starts_at, ends_at, all_day, color, linked_prospect_id, created_at')
          .eq('workspace_id', ctx.workspaceId)
          .gte('starts_at', now).lte('starts_at', horizon)
          .order('starts_at', { ascending: true })
          .limit(Math.min(limit || 25, 100));
        if (error) throw error;
        return { content: [{ type: 'text', text: JSON.stringify(data || [], null, 2) }] };
      } catch (err) {
        if (/schema cache|Could not find the table/i.test(err.message)) {
          return { content: [{ type: 'text', text: 'calendar_events table is missing — run backend/calendar-migration.sql in the Supabase SQL editor.' }], isError: true };
        }
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'create_calendar_event',
    'Add a manual calendar event in the active workspace.',
    {
      title: z.string().min(1),
      starts_at: z.string().describe('ISO 8601, e.g. 2026-09-12T14:00:00Z'),
      ends_at: z.string().describe('ISO 8601'),
      description: z.string().optional(),
      all_day: z.boolean().optional(),
      color: z.string().optional().describe('Hex color, e.g. #4B7B5B'),
      prospect_name: z.string().optional().describe('Optional CRM contact to link'),
    },
    async (args) => {
      try {
        let linked_prospect_id = null;
        if (args.prospect_name) {
          const { data } = await sb.from('prospects').select('id')
            .eq('workspace_id', ctx.workspaceId).ilike('name', String(args.prospect_name).trim()).limit(1);
          linked_prospect_id = data?.[0]?.id || null;
        }
        const { data, error } = await sb.from('calendar_events').insert({
          workspace_id: ctx.workspaceId,
          title: args.title,
          description: args.description || '',
          starts_at: args.starts_at,
          ends_at: args.ends_at,
          all_day: args.all_day || false,
          color: args.color || '#4B7B5B',
          linked_prospect_id,
          created_by: ctx.userId,
        }).select('id, title, starts_at').single();
        if (error) throw error;
        mcpLog({
          action: 'added', entityType: 'calendar_event', entityId: data.id, entityName: args.title,
          summary: `added calendar event "${args.title}"`,
          metadata: { starts_at: args.starts_at },
        });
        return { content: [{ type: 'text', text: JSON.stringify({ id: data.id, title: data.title, starts_at: data.starts_at }, null, 2) }] };
      } catch (err) {
        if (/schema cache|Could not find the table/i.test(err.message)) {
          return { content: [{ type: 'text', text: 'calendar_events table is missing — run backend/calendar-migration.sql in the Supabase SQL editor.' }], isError: true };
        }
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ─── Insights ───
  server.tool(
    'win_loss_summary',
    'Won/lost analysis across BOTH contacts (prospects) and company deals for the active workspace.',
    {},
    async () => {
      try {
        const [pRows, dRows, currency] = await Promise.all([
          fetchAll(() => sb.from('prospects')
            .select('name, stage, deal_value, outcome_reason, outcome_notes, won_against_competitor, lost_to_competitor')
            .eq('workspace_id', ctx.workspaceId).in('stage', ['won', 'lost'])),
          fetchAll(() => sb.from('deals')
            .select('name, stage, deal_value, closed_won_reason, closed_lost_reason, companies(name)')
            .eq('workspace_id', ctx.workspaceId).in('stage', ['won', 'lost'])).catch(() => []),
          workspaceCurrency(),
        ]);
        const mapDeal = (d) => ({
          name: d.name, stage: d.stage, deal_value: formatMoney(d.deal_value, currency),
          reason: d.stage === 'won' ? d.closed_won_reason : d.closed_lost_reason,
          company: d.companies?.name || null,
          source: 'deal',
        });
        const mapProspect = (p) => ({
          name: p.name, stage: p.stage, deal_value: formatMoney(p.deal_value, currency),
          reason: p.outcome_reason || p.outcome_notes, company: null, source: 'contact',
          competitor: p.stage === 'won' ? p.won_against_competitor : p.lost_to_competitor,
        });
        const allWon = [...pRows.filter(r => r.stage === 'won').map(mapProspect), ...dRows.filter(r => r.stage === 'won').map(mapDeal)];
        const allLost = [...pRows.filter(r => r.stage === 'lost').map(mapProspect), ...dRows.filter(r => r.stage === 'lost').map(mapDeal)];
        const reasonCounts = (list) => {
          const m = {};
          list.forEach(r => { const k = (r.reason || 'No reason').trim(); m[k] = (m[k] || 0) + 1; });
          return m;
        };
        const wonValue = allWon.reduce((s, r) => s + (Number(String(r.deal_value).replace(/[^0-9.-]/g, '')) || 0), 0);
        const lostValue = allLost.reduce((s, r) => s + (Number(String(r.deal_value).replace(/[^0-9.-]/g, '')) || 0), 0);
        return { content: [{ type: 'text', text: JSON.stringify({
          currency,
          won_count: allWon.length,
          lost_count: allLost.length,
          win_rate: (allWon.length + allLost.length) ? Math.round(allWon.length / (allWon.length + allLost.length) * 100) : 0,
          won_value: formatMoney(wonValue, currency),
          lost_value: formatMoney(lostValue, currency),
          top_win_reasons: reasonCounts(allWon),
          top_lost_reasons: reasonCounts(allLost),
          recent_won: allWon.slice(0, 5),
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'daily_digest',
    'Today\'s summary: prospects added, meetings today, pending follow-ups, recent activity.',
    {},
    async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
        const [added, meetings, tps] = await Promise.all([
          sb.from('prospects').select('id, name').eq('workspace_id', ctx.workspaceId).gte('created_at', today),
          sb.from('meetings').select('id, guest_name, starts_at, status, location')
            .eq('workspace_id', ctx.workspaceId).eq('status', 'scheduled')
            .gte('starts_at', startOfDay).lte('starts_at', endOfDay),
          sb.from('touchpoints').select('id, channel, prospect_id, date')
            .eq('date', today).limit(50),
        ]);
        const errors = [added, meetings, tps].find(r => r.error);
        if (errors) throw errors.error;
        return { content: [{ type: 'text', text: JSON.stringify({
          date: today,
          prospects_added_today: added.data.length,
          new_prospects: added.data.slice(0, 10).map(p => p.name),
          meetings_today: meetings.data.map(m => ({ guest: m.guest_name, at: m.starts_at, location: m.location })),
          touchpoints_logged_today: tps.data.length,
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'activity_goals_status',
    'Actual outreach activity for today and this week, grouped by channel, for goal tracking.',
    {},
    async () => {
      try {
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const weekStart = monday.toISOString().slice(0, 10);
        const { data, error } = await sb.from('touchpoints')
          .select('date, channel, outcome').gte('date', weekStart).limit(500);
        if (error) throw error;
        const channels = ['Email', 'LinkedIn', 'Call', 'SMS', 'Calendar', 'Other'];
        const count = (from, to, key) => (data || []).filter(t => t.date >= from && t.date <= to).length;
        const byChannel = (from, to) => Object.fromEntries(channels.map(c => [
          c, (data || []).filter(t => t.date >= from && t.date <= to && t.channel === c).length,
        ]));
        return { content: [{ type: 'text', text: JSON.stringify({
          today: { total: count(today, today), by_channel: byChannel(today, today) },
          this_week: { total: count(weekStart, today), by_channel: byChannel(weekStart, today) },
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ─── Workspace & team ───
  server.tool(
    'workspace_info',
    'Workspace profile: name, company details, and booking page config.',
    {},
    async () => {
      try {
        const { data, error } = await sb.from('workspaces')
          .select('id, name, slug, company_profile, booking_slug, booking_name, booking_enabled, booking_message')
          .eq('id', ctx.workspaceId).maybeSingle();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Workspace not found' }] };
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'list_members',
    'List members of the workspace with their roles.',
    {},
    async () => {
      try {
        const { data, error } = await sb.from('workspace_members')
          .select('user_id, role, is_default, created_at')
          .eq('workspace_id', ctx.workspaceId);
        if (error) throw error;
        const userIds = (data || []).map(m => m.user_id);
        const { data: profiles } = userIds.length
          ? await sb.from('profiles').select('id, display_name, avatar_url').in('id', userIds)
          : { data: [] };
        const byId = Object.fromEntries((profiles || []).map(p => [p.id, p]));
        const members = (data || []).map(m => ({
          user_id: m.user_id,
          name: byId[m.user_id]?.display_name || 'Unknown',
          role: m.role,
          is_default: m.is_default,
        }));
        return { content: [{ type: 'text', text: JSON.stringify(members, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'list_workspaces',
    'Every workspace the authenticated user belongs to. Shows which one tools currently operate on — it follows the active workspace in the Sentery app.',
    {},
    async () => {
      try {
        const { data: members, error: mErr } = await sb.from('workspace_members')
          .select('workspace_id, role').eq('user_id', ctx.userId);
        if (mErr) throw mErr;
        const ids = (members || []).map(m => m.workspace_id);
        if (!ids.length) return { content: [{ type: 'text', text: '[]' }] };
        const { data: ws } = await sb.from('workspaces').select('id, name, slug').in('id', ids);
        const byId = Object.fromEntries((ws || []).map(w => [w.id, w]));
        const rows = (members || []).map(m => ({
          workspace_id: m.workspace_id,
          name: byId[m.workspace_id]?.name || null,
          slug: byId[m.workspace_id]?.slug || null,
          role: m.role,
          active_for_mcp: m.workspace_id === ctx.workspaceId,
        }));
        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'add_member',
    'Add a user to the workspace by email with a role.',
    {
      email: z.string().describe('User email — they must already have an account'),
      role: z.enum(['owner', 'admin', 'member']).optional(),
    },
    async ({ email, role }) => {
      try {
        const { data: caller } = await sb.from('workspace_members')
          .select('role').eq('workspace_id', ctx.workspaceId).eq('user_id', ctx.userId).maybeSingle();
        if (!caller || caller.role !== 'admin') {
          return { content: [{ type: 'text', text: 'Only workspace admins can add members' }], isError: true };
        }
        const { data: user } = await sb.auth.admin.listUsers().then(({ data }) =>
          data.users.find(u => u.email === email) || null).catch(() => null);
        if (!user) return { content: [{ type: 'text', text: `No account found for ${email} — they need to sign up first` }] };
        const { data: existing } = await sb.from('workspace_members')
          .select('id').eq('workspace_id', ctx.workspaceId).eq('user_id', user.id).maybeSingle();
        if (existing) return { content: [{ type: 'text', text: `${email} is already a member` }] };
        const { data, error } = await sb.from('workspace_members').insert({
          workspace_id: ctx.workspaceId,
          user_id: user.id,
          role: role || 'member',
          invited_by: ctx.userId,
        }).select('user_id, role').single();
        if (error) throw error;
        mcpLog({
          action: 'invited', entityType: 'member', entityId: user.id, entityName: email,
          summary: `invited ${email} to the workspace as ${data.role}`,
          metadata: { email, role: data.role },
        });
        return { content: [{ type: 'text', text: `Added ${email} as ${data.role}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'remove_member',
    'Remove a member from the workspace by email. Requires confirm: true.',
    {
      email: z.string(),
      confirm: z.boolean(),
    },
    async ({ email, confirm }) => {
      try {
        if (!confirm) return { content: [{ type: 'text', text: 'Removal cancelled — set confirm: true to proceed' }] };
        const { data: user } = await sb.auth.admin.listUsers().then(({ data }) =>
          data.users.find(u => u.email === email) || null).catch(() => null);
        if (!user) return { content: [{ type: 'text', text: `No account found for ${email}` }] };
        const { data: member } = await sb.from('workspace_members')
          .select('user_id, role').eq('workspace_id', ctx.workspaceId).eq('user_id', user.id).maybeSingle();
        if (!member) return { content: [{ type: 'text', text: `${email} is not a member of this workspace` }] };
        if (member.role === 'owner') return { content: [{ type: 'text', text: 'Cannot remove the workspace owner' }] };
        const { error } = await sb.from('workspace_members')
          .delete().eq('workspace_id', ctx.workspaceId).eq('user_id', user.id);
        if (error) throw error;
        mcpLog({
          action: 'removed', entityType: 'member', entityId: user.id, entityName: email,
          summary: `removed ${email} from the workspace`,
          metadata: { email },
        });
        return { content: [{ type: 'text', text: `Removed ${email} from the workspace` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ─── Apollo ───
  async function apolloKeyFor() {
    const { data } = await sb.from('profiles').select('apollo_api_key').eq('id', ctx.userId).maybeSingle();
    return data?.apollo_api_key || null;
  }

  async function apolloCall(apolloKey, path, body, timeoutMs = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${APOLLO_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-api-key': apolloKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await resp.text();
      let data; try { data = JSON.parse(text); } catch { data = {}; }
      if (!resp.ok) throw new Error(data.error || data.message || `Apollo API error ${resp.status}`);
      return data;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('Apollo API request timed out');
      throw err;
    }
  }

  async function requireApolloKey() {
    const key = await apolloKeyFor();
    if (!key) return { key: null, error: 'No Apollo API key found — add one in Settings → Apollo first' };
    return { key, error: null };
  }

  server.tool(
    'apollo_search_people',
    'Search Apollo.io for people matching keywords, titles, locations, or company domains.',
    {
      q_keywords: z.string().describe('Keywords (e.g. "CTO fintech")'),
      person_titles: z.array(z.string()).optional(),
      person_locations: z.array(z.string()).optional(),
      q_organization_domains: z.array(z.string()).optional(),
      per_page: z.number().min(1).max(100).optional(),
    },
    async (filters) => {
      try {
        const { key, error } = await requireApolloKey();
        if (error) return { content: [{ type: 'text', text: error }], isError: true };
        const data = await apolloCall(key, '/v1/mixed_people/api_search', {
          page: 1,
          per_page: Math.min(filters.per_page || 25, 100),
          q_keywords: filters.q_keywords,
          person_titles: filters.person_titles || undefined,
          person_locations: filters.person_locations || undefined,
          q_organization_domains: filters.q_organization_domains || undefined,
          reveal_personal_emails: true,
        });
        const people = (data.people || []).map(p => ({
          id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' '),
          title: p.title, email: p.email,
          phone: p.phone_numbers?.[0]?.sanitized_number || null,
          linkedin: p.linkedin_url,
          company: p.organization?.name || null,
          company_domain: p.organization?.primary_domain || null,
          industry: p.organization?.industry || null,
          city: p.city, country: p.country,
        }));
        return { content: [{ type: 'text', text: JSON.stringify({ total: data.pagination?.total_entries || people.length, people }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'apollo_search_companies',
    'Search Apollo.io for companies by name, keywords, industry, or size.',
    {
      q_organization_name: z.string().optional(),
      q_keywords: z.string().optional(),
      organization_num_employees_ranges: z.array(z.string()).optional().describe('e.g. ["1,10","11,50"]'),
      per_page: z.number().min(1).max(100).optional(),
    },
    async (filters) => {
      try {
        const { key, error } = await requireApolloKey();
        if (error) return { content: [{ type: 'text', text: error }], isError: true };
        const data = await apolloCall(key, '/v1/mixed_companies/search', {
          page: 1,
          per_page: Math.min(filters.per_page || 25, 100),
          q_organization_name: filters.q_organization_name || undefined,
          q_keywords: filters.q_keywords || undefined,
          organization_num_employees_ranges: filters.organization_num_employees_ranges || undefined,
        });
        const orgs = (data.organizations || []).map(o => ({
          id: o.id, name: o.name, domain: o.primary_domain,
          industry: o.industry, employee_count: o.estimated_num_employees,
          annual_revenue: o.annual_revenue_printed, city: o.city, country: o.country,
          linkedin: o.linkedin_url, description: o.short_description || o.description,
        }));
        return { content: [{ type: 'text', text: JSON.stringify({ total: data.pagination?.total_entries || orgs.length, organizations: orgs }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'apollo_enrich_person',
    'Enrich a person by email or LinkedIn URL — returns contact details, job title, and company info.',
    {
      email: z.string().optional(),
      linkedin_url: z.string().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      organization_name: z.string().optional(),
      title: z.string().optional(),
    },
    async (args) => {
      try {
        const { key, error } = await requireApolloKey();
        if (error) return { content: [{ type: 'text', text: error }], isError: true };
        if (!args.email && !args.linkedin_url && !args.first_name && !args.organization_name) {
          return { content: [{ type: 'text', text: 'Provide at least email, linkedin_url, or first_name' }], isError: true };
        }
        const params = new URLSearchParams();
        if (args.email) params.set('email', args.email);
        if (args.first_name) params.set('first_name', args.first_name);
        if (args.last_name) params.set('last_name', args.last_name);
        if (args.linkedin_url) params.set('linkedin_url', args.linkedin_url);
        if (args.organization_name) params.set('organization_name', args.organization_name);
        if (args.title) params.set('title', args.title);
        params.set('reveal_personal_emails', 'true');
        const data = await apolloCall(key, `/v1/people/match?${params.toString()}`, {});
        const person = data.person || {};
        const org = person.organization || {};
        return { content: [{ type: 'text', text: JSON.stringify({
          apollo_id: person.id || null,
          name: [person.first_name, person.last_name].filter(Boolean).join(' ') || null,
          title: person.title || null,
          email: person.email || null,
          phone: person.phone_numbers?.[0]?.sanitized_number || null,
          linkedin: person.linkedin_url || null,
          company: org.name || null,
          company_domain: org.primary_domain || null,
          industry: org.industry || null,
          company_size: org.estimated_num_employees || null,
          city: person.city || null,
          state: person.state || null,
          country: person.country || null,
          avatar: person.avatar_url || null,
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'apollo_enrich_company',
    'Enrich a company by domain or name — returns industry, size, revenue, and description.',
    {
      domain: z.string().optional(),
      name: z.string().optional(),
    },
    async ({ domain, name }) => {
      try {
        const { key, error } = await requireApolloKey();
        if (error) return { content: [{ type: 'text', text: error }], isError: true };
        if (!domain && !name) return { content: [{ type: 'text', text: 'Provide a company domain or name' }], isError: true };
        const params = new URLSearchParams();
        if (domain) params.set('domain', domain);
        if (name) params.set('name', name);
        const data = await apolloCall(key, `/v1/organizations/match?${params.toString()}`, {});
        const o = data.organization || {};
        return { content: [{ type: 'text', text: JSON.stringify({
          name: o.name, domain: o.primary_domain,
          industry: o.industry, employee_count: o.estimated_num_employees,
          annual_revenue: o.annual_revenue_printed, founded_year: o.founded_year,
          city: o.city, country: o.country, linkedin: o.linkedin_url,
          description: o.short_description || o.description,
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'apollo_send_email',
    'Send an email to one or more recipients via Apollo.',
    {
      to: z.array(z.string()).describe('Recipient emails'),
      subject: z.string(),
      body: z.string().describe('Email body'),
      from_name: z.string().optional().describe('Sender display name'),
      sender_email: z.string().optional().describe('Verified sender email (must be verified in Apollo)'),
    },
    async (args) => {
      try {
        const { key, error } = await requireApolloKey();
        if (error) return { content: [{ type: 'text', text: error }], isError: true };
        const data = await apolloCall(key, '/v1/emailer/send', {
          sender: { name: args.from_name || 'Sentery', email: args.sender_email },
          recipients: args.to.map(email => ({ email })),
          subject: args.subject,
          body: args.body,
        });
        const messages = (data.messages || []).map(m => ({ email: m.email, status: m.status, message: m.message }));
        return { content: [{ type: 'text', text: JSON.stringify(messages.length ? messages : data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ─── Email (Resend) ───
  server.tool(
    'send_email',
    'Fallback email sender via Resend. Only use when Gmail is not connected (send_gmail_email fails). Requires RESEND_API_KEY and uses your Resend credits.',
    {
      to: z.string().describe('Recipient email'),
      subject: z.string(),
      body: z.string().describe('Email body (plain text)'),
      from: z.string().optional().describe('Sender address'),
    },
    async ({ to, subject, body, from }) => {
      try {
        if (!resend) return { content: [{ type: 'text', text: 'Resend is not configured on the server (RESEND_API_KEY missing)' }], isError: true };
        const { data, error } = await resend.emails.send({
          from: from || process.env.RESEND_FROM || 'Sentery <notifications@sentery.it.com>',
          to,
          subject,
          text: body,
        });
        if (error) throw new Error(error.message);
        mcpLog({
          action: 'sent', entityType: 'email', entityId: data?.id || null, entityName: null,
          summary: `sent "${subject}" to ${to}`,
          metadata: { to, subject },
        });
        return { content: [{ type: 'text', text: `Email sent to ${to} (id ${data?.id})` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ─── Segments (reuses the server-side segment engine) ───
  const rulesSchema = z.object({
    logic: z.enum(['ALL', 'ANY', 'NOT']),
    conditions: z.array(z.any()).describe('Conditions or nested {logic, conditions} groups'),
  });

  server.tool(
    'list_segments',
    'List saved contact segments for the workspace, each with its live match count.',
    {},
    async () => {
      try {
        const { data, error } = await sb.from('segments')
          .select('*').eq('workspace_id', ctx.workspaceId).is('archived_at', null)
          .order('is_favorite', { ascending: false }).order('updated_at', { ascending: false });
        if (error) throw error;
        const out = [];
        for (const s of data || []) {
          const isCompany = s.entity === 'company';
          try {
            const { count } = isCompany
              ? await segmentCompanies(ctx.workspaceId, s.rules, 1, 1)
              : { count: await segmentCount(ctx.workspaceId, s.rules) };
            out.push({ id: s.id, name: s.name, description: s.description, entity: isCompany ? 'company' : 'contact', is_preset: s.is_preset, is_favorite: s.is_favorite, match_count: count, rules: s.rules });
          } catch { out.push({ id: s.id, name: s.name, description: s.description, entity: isCompany ? 'company' : 'contact', is_preset: s.is_preset, is_favorite: s.is_favorite, match_count: null, rules: s.rules }); }
        }
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'create_segment',
    'Create a saved segment from rules JSON. entity: "contact" (default) segments contacts; "company" segments companies (fields: name, domain, industry, company_size, company_type, city, region, country, annual_revenue, tags, created_at, updated_at, open_deals, total_deal_value, has_open_deal, last_deal_activity).',
    {
      name: z.string().describe('Segment name'),
      description: z.string().optional(),
      entity: z.enum(['contact', 'company']).optional().describe('contact (default) or company'),
      rules: rulesSchema,
    },
    async ({ name, description, entity, rules }) => {
      try {
        const ent = entity === 'company' ? 'company' : 'contact';
        const { data, error } = await sb.from('segments').insert({
          workspace_id: ctx.workspaceId, name, description: description || '', rules, created_by: ctx.userId, entity: ent,
        }).select().single();
        if (error) throw error;
        const count = ent === 'company'
          ? (await segmentCompanies(ctx.workspaceId, rules, 1, 1)).count
          : await segmentCount(ctx.workspaceId, rules);
        mcpLog({
          action: 'created', entityType: 'segment', entityId: data.id, entityName: name,
          summary: `created the segment "${name}" (${count} prospect${count === 1 ? '' : 's'} matched)`,
          metadata: { match_count: count },
        });
        return { content: [{ type: 'text', text: JSON.stringify({ segment: data, match_count: count }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_segment',
    'Fetch one saved segment by id, with its live match count.',
    { segment_id: z.number().int().positive() },
    async ({ segment_id }) => {
      try {
        const { data, error } = await sb.from('segments').select('*').eq('id', segment_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Segment not found' }], isError: true };
        const count = await segmentCount(ctx.workspaceId, data.rules);
        return { content: [{ type: 'text', text: JSON.stringify({ ...data, match_count: count }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'run_segment',
    'Evaluate rules (or a saved segment by id) and return matching contacts. Use for "show me X" requests.',
    {
      segment_id: z.number().int().positive().optional().describe('Saved segment id (optional if rules given)'),
      rules: rulesSchema.optional(),
      limit: z.number().int().min(1).max(100).optional().describe('Max contacts (default 20)'),
    },
    async ({ segment_id, rules, limit }) => {
      try {
        let r = rules;
        if (!r && segment_id) {
          const { data } = await sb.from('segments').select('rules, entity').eq('id', segment_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
          if (!data) return { content: [{ type: 'text', text: 'Segment not found' }], isError: true };
          if (data.entity === 'company') return { content: [{ type: 'text', text: 'That segment is a company segment — use run_company_segment instead.' }], isError: true };
          r = data.rules;
        }
        if (!r) return { content: [{ type: 'text', text: 'Provide either rules or a segment_id' }], isError: true };
        const { count, contacts: rows } = await segmentContacts(ctx.workspaceId, r, 1, Math.min(limit || 20, 100));
        const contacts = (rows || []).map(c => ({
          id: c.id, name: c.name, email: c.email, company: c.company, title: c.title,
          stage: c.stage, tier: c.tier, deal_value: c.deal_value, tags: c.tags,
          owner_name: c.owner_name, last_activity: c.last_activity,
        }));
        return { content: [{ type: 'text', text: JSON.stringify({ match_count: count, contacts }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'run_company_segment',
    'Evaluate company rules and return matching companies, with all contacts under those companies when include_contacts is true. Company fields: name, domain, industry, company_size, company_type, city, region, country, annual_revenue (number), tags (multienum), created_at, updated_at, open_deals (number), total_deal_value (number), has_open_deal (bool), last_deal_activity (date).',
    {
      rules: rulesSchema,
      segment_id: z.union([z.string(), z.number()]).optional().describe('Saved company segment id (rules are loaded from it)'),
      limit: z.number().min(1).max(50).optional().describe('Max companies (default 10)'),
      include_contacts: z.boolean().optional().describe('Include every contact under the matched companies (default true)'),
    },
    async ({ rules, segment_id, limit, include_contacts }) => {
      try {
        let r = rules;
        if (!r && segment_id) {
          const { data } = await sb.from('segments').select('rules, entity').eq('id', segment_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
          if (!data) return { content: [{ type: 'text', text: 'Segment not found' }], isError: true };
          if (data.entity !== 'company') return { content: [{ type: 'text', text: 'That segment is a contact segment — use run_segment instead.' }], isError: true };
          r = data.rules;
        }
        if (!r) return { content: [{ type: 'text', text: 'Provide either rules or a segment_id' }], isError: true };
        const { count, companies, contactCount, contacts } = await segmentCompanies(
          ctx.workspaceId, r, 1, Math.min(limit || 10, 50), include_contacts !== false
        );
        const currency = await workspaceCurrency();
        const cos = (companies || []).map(c => ({ ...c, total_deal_value: formatMoney(c.total_deal_value, currency) }));
        return { content: [{ type: 'text', text: JSON.stringify({
          match_count: count,
          companies: cos,
          ...(include_contacts !== false ? { contact_count: contactCount, contacts: contacts || [] } : {}),
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'segment_count',
    'Count how many contacts match rules (or a saved segment) — no contact data returned.',
    {
      segment_id: z.number().int().positive().optional(),
      rules: rulesSchema.optional(),
    },
    async ({ segment_id, rules }) => {
      try {
        let r = rules;
        if (!r && segment_id) {
          const { data } = await sb.from('segments').select('rules, entity').eq('id', segment_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
          if (!data) return { content: [{ type: 'text', text: 'Segment not found' }], isError: true };
          if (data.entity === 'company') return { content: [{ type: 'text', text: 'That segment is a company segment — use run_company_segment instead.' }], isError: true };
          r = data.rules;
        }
        if (!r) return { content: [{ type: 'text', text: 'Provide either rules or a segment_id' }], isError: true };
        const count = await segmentCount(ctx.workspaceId, r);
        return { content: [{ type: 'text', text: JSON.stringify({ match_count: count }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'update_segment',
    'Update a saved segment\'s name, description, rules, or entity (contact/company). Only pass fields you want to change.',
    {
      segment_id: z.number().int().positive(),
      name: z.string().optional(),
      description: z.string().optional(),
      entity: z.enum(['contact', 'company']).optional(),
      rules: z.object({}).optional().describe('Rules JSON object (same shape as create_segment)'),
    },
    async ({ segment_id, ...fields }) => {
      try {
        if (Object.keys(fields).length === 0) return { content: [{ type: 'text', text: 'Provide at least one field to update' }], isError: true };
        const updates = { ...fields, updated_at: new Date().toISOString() };
        if (updates.rules) updates.rules = JSON.parse(JSON.stringify(updates.rules));
        const { data, error } = await sb.from('segments').update(updates)
          .eq('id', segment_id).eq('workspace_id', ctx.workspaceId).select('id, name, entity').single();
        if (error) throw error;
        if (!data) return { content: [{ type: 'text', text: 'Segment not found' }], isError: true };
        mcpLog({
          action: 'updated', entityType: 'segment', entityId: data.id, entityName: data.name,
          summary: `updated segment "${data.name}"`,
          metadata: { fields: Object.keys(fields) },
        });
        return { content: [{ type: 'text', text: `Updated segment ${data.id}: ${Object.keys(fields).join(', ')}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'delete_segment',
    'Permanently delete a saved segment.',
    { segment_id: z.number().int().positive(), confirm: z.boolean().describe('Must be true to delete') },
    async ({ segment_id, confirm }) => {
      try {
        if (!confirm) return { content: [{ type: 'text', text: 'Deletion requires confirm: true' }], isError: true };
        const { data: seg } = await sb.from('segments').select('name').eq('id', segment_id).eq('workspace_id', ctx.workspaceId).maybeSingle();
        const { data, error } = await sb.from('segments').delete().eq('id', segment_id).eq('workspace_id', ctx.workspaceId).select('id');
        if (error) throw error;
        if (!data || data.length === 0) return { content: [{ type: 'text', text: 'Segment not found' }], isError: true };
        mcpLog({
          action: 'deleted', entityType: 'segment', entityId: segment_id, entityName: seg?.name || null,
          summary: `deleted the segment "${seg?.name || segment_id}"`,
        });
        return { content: [{ type: 'text', text: `Deleted segment ${segment_id}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'search_emails',
    'Search synced email conversations matched to CRM contacts. Returns subject, direction, sender, recipients, date. Filter by contact_id, company name, sender email, subject, direction, or date range. Use before reading a thread.',
    {
      contact_id: z.union([z.string(), z.number()]).optional().describe('CRM contact id'),
      company: z.string().optional().describe('Company name from the CRM'),
      from: z.string().optional().describe('Sender email address'),
      subject: z.string().optional().describe('Subject keyword'),
      direction: z.enum(['sent', 'received']).optional(),
      date_from: z.string().optional().describe('ISO date, e.g. 2026-05-01'),
      date_to: z.string().optional().describe('ISO date, e.g. 2026-08-19'),
      limit: z.number().min(1).max(50).optional().describe('Max results (default 20)'),
    },
    async ({ contact_id, company, from, subject, direction, date_from, date_to, limit }) => {
      try {
        const messages = await searchMessages(ctx.workspaceId, ctx.userId, {
          contact_id: contact_id !== undefined ? Number(contact_id) : undefined,
          company, from, subject, direction, date_from, date_to, limit,
        });
        const slim = messages.map(m => ({
          id: m.id, direction: m.direction, subject: m.subject, snippet: m.snippet,
          from_email: m.from_email, from_name: m.from_name, to_emails: m.to_emails,
          sent_at: m.sent_at, thread_id: m.thread_id,
        }));
        return { content: [{ type: 'text', text: JSON.stringify({ count: slim.length, emails: slim }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_email_thread',
    'Full email thread: subject, sender, recipients, body and every message in the conversation. Use an email id from search_emails.',
    { message_id: z.union([z.string(), z.number()]).describe('Email message id from search_emails') },
    async ({ message_id }) => {
      try {
        const detail = await getMessageDetail(ctx.workspaceId, ctx.userId, Number(message_id));
        if (!detail) return { content: [{ type: 'text', text: 'Email not found in this workspace' }], isError: true };
        const thread = [detail, ...(detail.thread_messages || [])].sort((a, b) => (a.sent_at || '').localeCompare(b.sent_at || ''));
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              thread_id: detail.thread_id,
              contacts: (detail.touchpoints || []).map(t => t.prospect),
              messages: thread.map(m => ({
                id: m.id, direction: m.direction, subject: m.subject, from_email: m.from_email,
                from_name: m.from_name, to_emails: m.to_emails, cc_emails: m.cc_emails,
                sent_at: m.sent_at, body: m.body_text || m.snippet,
              })),
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_contact_emails',
    'Recent emails exchanged with one CRM contact (by prospect id).',
    {
      contact_id: z.union([z.string(), z.number()]).describe('CRM contact id'),
      limit: z.number().min(1).max(50).optional(),
    },
    async ({ contact_id, limit }) => {
      try {
        const messages = await searchMessages(ctx.workspaceId, ctx.userId, { contact_id: Number(contact_id), limit });
        return { content: [{ type: 'text', text: JSON.stringify({ count: messages.length, emails: messages }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_company_emails',
    'Recent emails exchanged with contacts at a company (by CRM company name). Use with search_prospects to resolve company names.',
    {
      company: z.string().describe('Company name in the CRM'),
      limit: z.number().min(1).max(50).optional(),
    },
    async ({ company, limit }) => {
      try {
        const messages = await searchMessages(ctx.workspaceId, ctx.userId, { company, limit });
        return { content: [{ type: 'text', text: JSON.stringify({ count: messages.length, emails: messages }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_recent_emails',
    'Most recent synced emails matched to CRM contacts, optionally filtered to a time window.',
    {
      days: z.number().min(1).max(365).optional().describe('Look back window in days (default 30)'),
      limit: z.number().min(1).max(50).optional().describe('Max results (default 20)'),
    },
    async ({ days, limit }) => {
      try {
        const from = new Date(Date.now() - (days || 30) * 86400000).toISOString();
        const messages = await searchMessages(ctx.workspaceId, ctx.userId, { date_from: from, limit });
        return { content: [{ type: 'text', text: JSON.stringify({ count: messages.length, emails: messages }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  server.tool(
    'send_gmail_email',
    'PREFERRED WAY to send emails. Sends from your connected Gmail account — free, no credit limits, better deliverability. Recipients should be CRM contacts. Requires confirm: true. After sending, the email is logged automatically.',
    {
      to: z.string().describe('Recipient email address'),
      cc: z.string().optional(),
      bcc: z.string().optional(),
      subject: z.string(),
      body: z.string(),
      confirm: z.boolean().describe('Must be true to send'),
    },
    async ({ to, cc, bcc, subject, body, confirm }) => {
      try {
        if (!confirm) return { content: [{ type: 'text', text: 'Sending requires confirm: true' }], isError: true };
        const result = await sendEmailViaGmail(ctx.workspaceId, ctx.userId, { to, cc, bcc, subject, body });
        mcpLog({
          action: 'sent', entityType: 'email', entityId: result.emailMessageId || null, entityName: null,
          summary: `sent "${subject}" to ${to} via Gmail`,
          metadata: { to, cc: cc || null, bcc: bcc || null, subject },
        });
        return { content: [{ type: 'text', text: `Email sent to ${to}${result.emailMessageId ? ' and logged to the CRM' : ''}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}. Make sure Gmail is connected in Settings → Email Integrations.` }], isError: true };
      }
    },
  );

  server.tool(
    'sync_emails',
    'Trigger an immediate email sync (initial sync looks back the configured window, e.g. 30 days). Use after connecting Gmail or when the user asks to refresh email data.',
    {},
    async () => {
      try {
        const result = await syncEmail(ctx.workspaceId, ctx.userId, { force: true });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  return server;
}

// ─── Streamable HTTP transport with per-session state ───
const sessions = new Map(); // sessionId -> { transport, server }

async function handleMcp(req, res) {
  try {
    const sessionId = req.headers['mcp-session-id'];
    let session = sessionId ? sessions.get(sessionId) : null;
    let transport = null;
    if (!session) {
      transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true,
        sessionIdGenerator: () => crypto.randomUUID(),
      });
      const ctx = { ...req.mcpAuth };
      const server = createSenteryServer(ctx);
      session = { transport, server, ctx };
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
      await server.connect(transport);
    } else {
      transport = session.transport;
      // Keep the live session in sync with the user's active workspace (they may have switched in the app).
      session.ctx.workspaceId = req.mcpAuth.workspaceId;
    }
    console.log(`[mcp] ${req.method} session=${sessionId || '(new)'} ws=${req.mcpAuth.workspaceId}`);
    await transport.handleRequest(req, res, req.body);
    if (transport.sessionId && !sessions.has(transport.sessionId)) {
      sessions.set(transport.sessionId, session);
    }
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    console.error('[mcp] error:', err.stack || err.message);
  }
}

router.post('/mcp', mcpAuth, handleMcp);
router.get('/mcp', mcpAuth, handleMcp);

export { router as mcpRouter, METADATA_URL };
