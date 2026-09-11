import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Resend } from 'resend';
import meetingsRouter from './meetings.js';
import emailsRouter, { syncEmail } from './emails.js';
import { mcpRouter } from './mcp.js';
import { segmentsRouter } from './segments.js';
import { pruneActivity } from './activity.js';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const app = express();
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', emailsRouter);
app.use('/api', meetingsRouter);
app.use('/api', segmentsRouter());
app.use(mcpRouter);

// ─── Brand assets — served so MCP clients (Claude, ChatGPT, Cursor) and browsers
// pick up the Sentery logo when connecting via the OAuth issuer URL.
// Loads the symbol SVG once at startup; the fill is forced to dark so it reads
// correctly on browser tab backgrounds regardless of theme.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname_backend = dirname(fileURLToPath(import.meta.url));
let FAVICON_SVG = '';
try {
  const raw = readFileSync(resolve(__dirname_backend, 'favicon.svg'), 'utf8');
  FAVICON_SVG = raw.replace(/fill="[^"]*"/, 'fill="#1F1E1D"');
} catch (err) {
  console.warn('[favicon] could not read favicon.svg:', err.message);
}
app.get(['/favicon.svg', '/favicon.ico'], (_req, res) => {
  if (!FAVICON_SVG) return res.status(404).end();
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(FAVICON_SVG);
});

// ─── Email auto-sync (every 5 min, staggered, no overlap) ───
const syncing = new Set();
setInterval(async () => {
  try {
    const { data: accounts } = await sb.from('email_accounts').select('workspace_id, user_id').eq('auto_logging', true);
    for (const a of (accounts || [])) {
      const key = `${a.workspace_id}:${a.user_id}`;
      if (syncing.has(key)) continue;
      syncing.add(key);
      syncEmail(a.workspace_id, a.user_id).catch(err => console.warn('[auto-sync]', key, err.message)).finally(() => syncing.delete(key));
    }
  } catch (err) {
    console.warn('[auto-sync] poll failed:', err.message);
  }
}, 5 * 60 * 1000);

// ─── Activity log prune (daily, 90-day retention) ───
let lastPrune = 0;
setInterval(async () => {
  if (Date.now() - lastPrune < 12 * 60 * 60 * 1000) return;
  lastPrune = Date.now();
  try { await pruneActivity(90); } catch (err) { console.warn('[prune]', err.message); }
}, 15 * 60 * 1000);

// ─── Auth diagnostic trail (temporary) ───
const authDiagLog = [];
app.post('/api/auth-diag', (req, res) => {
  const entry = { ...(req.body || {}), receivedAt: new Date().toISOString() };
  authDiagLog.push(entry);
  if (authDiagLog.length > 200) authDiagLog.shift();
  console.log('[auth-diag]', JSON.stringify(entry));
  res.json({ ok: true });
});
app.get('/api/auth-diag', (req, res) => {
  res.json(authDiagLog.slice(-60));
});

// ─── Resend Email ───
const API_KEY = process.env.RESEND_API_KEY;
const IS_PLACEHOLDER = !API_KEY || API_KEY.startsWith('re_xxxx');
const resend = IS_PLACEHOLDER ? null : new Resend(API_KEY);

app.post('/api/send-email', async (req, res) => {
  try {
    const { to, subject, html, from } = req.body;
    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, html' });
    }
    if (IS_PLACEHOLDER) {
      return res.status(400).json({ error: 'Resend API key not configured. Go to https://resend.com, sign up free, then paste your key into backend/.env' });
    }
    const { data, error } = await resend.emails.send({
      from: from || process.env.RESEND_FROM || 'Sentery <notifications@sentery.it.com>',
      to,
      subject,
      html,
    });
    if (error) return res.status(400).json({ error });
    res.json({ success: true, id: data?.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Apollo.io Proxy (BYOK) ───
const APOLLO_BASE = 'https://api.apollo.io';

async function apolloProxy(apolloKey, path, body, timeoutMs = 15000) {
  console.log('[Apollo Proxy]', path, 'key_len=' + (apolloKey||'').length, 'key_start=' + (apolloKey||'').slice(0,6));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${APOLLO_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': apolloKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (!resp.ok) throw new Error(text || `Apollo API error ${resp.status}`);
      throw new Error('Invalid response from Apollo: ' + text.slice(0, 200));
    }
    if (!resp.ok) throw new Error(data.error || data.message || `Apollo API error ${resp.status}`);
    return data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Apollo API request timed out');
    throw err;
  }
}

// Enrich a person by email
app.post('/api/apollo/enrich/person', async (req, res) => {
  try {
    const { apolloKey, email, first_name, last_name, linkedin_url, organization_name, title, apollo_id } = req.body;
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    if (!email && !linkedin_url && !first_name && !apollo_id) {
      return res.status(400).json({ error: 'Provide at least email, linkedin_url, apollo_id, or first_name' });
    }
    const params = new URLSearchParams();
    if (apollo_id) params.set('id', apollo_id);
    if (email) params.set('email', email);
    if (first_name) params.set('first_name', first_name);
    if (last_name) params.set('last_name', last_name);
    if (linkedin_url) params.set('linkedin_url', linkedin_url);
    if (organization_name) params.set('organization_name', organization_name);
    params.set('reveal_personal_emails', 'true');
    console.log('[Enrich] Input:', { apollo_id, email, first_name, last_name, linkedin_url });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(`${APOLLO_BASE}/v1/people/match?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': apolloKey,
      },
      body: '{}',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = {}; }
    if (!resp.ok) throw new Error(data.error || `Apollo API error ${resp.status}: ${text.slice(0, 200)}`);

    console.log('[Enrich] Apollo found:', !!data.person, 'email:', data.person?.email, 'phone:', data.person?.phone_numbers?.length, 'apollo_id:', data.person?.id);
    const person = data.person || {};
    const org = person.organization || {};
    res.json({
      success: true,
      data: {
        apollo_id: person.id || null,
        name: [person.first_name, person.last_name].filter(Boolean).join(' ') || null,
        first_name: person.first_name || null,
        last_name: person.last_name || null,
        title: person.title || null,
        email: person.email || null,
        phone: person.phone_numbers?.[0]?.sanitized_number || null,
        linkedin: person.linkedin_url || null,
        company: org.name || null,
        company_domain: org.primary_domain || null,
        industry: org.industry || null,
        company_size: org.estimated_num_employees || null,
        annual_revenue: org.annual_revenue_printed || null,
        city: person.city || null,
        state: person.state || null,
        country: person.country || null,
        avatar: person.avatar_url || null,
        description: org.short_description || org.description || null,
        founded_year: org.founded_year || null,
        technologies: org.technologies || [],
        keywords: person.keywords || [],
        raw: person,
      },
    });
  } catch (err) {
    console.error('[Enrich] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Enrich a company by domain
app.post('/api/apollo/enrich/company', async (req, res) => {
  try {
    const { apolloKey, domain, organization_name } = req.body;
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    if (!domain && !organization_name) {
      return res.status(400).json({ error: 'Provide domain or organization_name' });
    }
    const data = await apolloProxy(apolloKey, '/v1/organizations/match', {
      domain, organization_name,
      reveal_personal_emails: false,
    });
    const org = data.organization || {};
    res.json({
      success: true,
      data: {
        name: org.name || null,
        domain: org.primary_domain || domain || null,
        industry: org.industry || null,
        company_size: org.estimated_num_employees || null,
        annual_revenue: org.annual_revenue_printed || null,
        phone: org.phone || null,
        address: org.street_address || null,
        city: org.city || null,
        state: org.state || null,
        country: org.country || null,
        linkedin: org.linkedin_url || null,
        logo: org.logo_url || null,
        description: org.short_description || org.description || null,
        founded_year: org.founded_year || null,
        raw: org,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search people
app.post('/api/apollo/search/people', async (req, res) => {
  try {
    const { apolloKey, ...filters } = req.body;
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    const data = await apolloProxy(apolloKey, '/v1/mixed_people/api_search', {
      page: filters.page || 1,
      per_page: Math.min(filters.per_page || 25, 100),
      q_keywords: filters.q_keywords || undefined,
      person_titles: filters.person_titles || undefined,
      person_locations: filters.person_locations || undefined,
      organization_industry_tag_ids: filters.organization_industry_tag_ids || undefined,
      organization_num_employees_ranges: filters.organization_num_employees_ranges || undefined,
      q_organization_domains: filters.q_organization_domains || undefined,
      contact_email_status: filters.contact_email_status || undefined,
      reveal_personal_emails: true,
    });
    const people = (data.people || []).map(p => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' '),
      first_name: p.first_name,
      last_name: p.last_name,
      title: p.title,
      email: p.email,
      phone: p.phone_numbers?.[0]?.sanitized_number || null,
      linkedin: p.linkedin_url,
      company: p.organization?.name || null,
      company_domain: p.organization?.primary_domain || null,
      industry: p.organization?.industry || null,
      company_size: p.organization?.estimated_num_employees || null,
      city: p.city,
      state: p.state,
      country: p.country,
      avatar: p.avatar_url,
    }));
    res.json({
      success: true,
      data: people,
      pagination: {
        page: data.pagination?.page || 1,
        per_page: data.pagination?.per_page || 25,
        total_entries: data.pagination?.total_entries || 0,
        total_pages: data.pagination?.total_pages || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search companies
app.post('/api/apollo/search/companies', async (req, res) => {
  try {
    const { apolloKey, ...filters } = req.body;
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    const data = await apolloProxy(apolloKey, '/v1/mixed_companies/search', {
      page: filters.page || 1,
      per_page: Math.min(filters.per_page || 25, 100),
      q_keywords: filters.q_keywords || undefined,
      organization_industry_tag_ids: filters.organization_industry_tag_ids || undefined,
      organization_num_employees_ranges: filters.organization_num_employees_ranges || undefined,
      q_organization_domain_keywords: filters.q_organization_domain_keywords || undefined,
    });
    const companies = (data.organizations || []).map(o => ({
      id: o.id,
      name: o.name,
      domain: o.primary_domain,
      industry: o.industry,
      company_size: o.estimated_num_employees,
      annual_revenue: o.annual_revenue_printed,
      phone: o.phone,
      city: o.city,
      state: o.state,
      country: o.country,
      linkedin: o.linkedin_url,
      logo: o.logo_url,
      description: o.short_description || o.description,
    }));
    res.json({
      success: true,
      data: companies,
      pagination: {
        page: data.pagination?.page || 1,
        per_page: data.pagination?.per_page || 25,
        total_entries: data.pagination?.total_entries || 0,
        total_pages: data.pagination?.total_pages || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Apollo Lists ───

// Get all Apollo lists (labels)
app.get('/api/apollo/lists', async (req, res) => {
  try {
    const apolloKey = req.headers['x-apollo-key'];
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    const modality = req.query.modality || 'contacts';
    const resp = await fetch(`https://api.apollo.io/api/v1/labels?modality=${modality}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apolloKey,
      },
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = []; }
    if (!resp.ok) throw new Error(data.error || `Apollo API error ${resp.status}`);
    const lists = (Array.isArray(data) ? data : []).map(l => ({
      id: l.id,
      name: l.name,
      count: l.cached_count || 0,
      created: l.created_at,
      updated: l.updated_at,
      modality: l.modality,
    }));
    res.json({ success: true, data: lists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get contacts from an Apollo list (using contacts/search with label_ids)
app.get('/api/apollo/lists/:id/contacts', async (req, res) => {
  try {
    const apolloKey = req.headers['x-apollo-key'];
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    const data = await apolloProxy(apolloKey, '/v1/contacts/search', {
      contact_label_ids: [req.params.id],
      page: parseInt(req.query.page) || 1,
      per_page: Math.min(parseInt(req.query.per_page) || 100, 100),
    });
    const contacts = (data.contacts || []).map(c => ({
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(' '),
      first_name: c.first_name,
      last_name: c.last_name,
      title: c.title,
      email: c.email,
      phone: c.sanitized_phone || c.phone_numbers?.[0]?.sanitized_number || null,
      linkedin: c.linkedin_url,
      company: c.organization_name || c.account?.name || null,
      company_domain: c.organization?.primary_domain || null,
      industry: c.organization?.industry || null,
      city: c.city,
      state: c.state,
      country: c.country,
      avatar: c.photo_url,
      stage: c.contact_stage_id || null,
      labels: c.label_ids || [],
    }));
    res.json({
      success: true,
      data: contacts,
      pagination: {
        page: data.pagination?.page || 1,
        per_page: data.pagination?.per_page || 100,
        total_entries: data.pagination?.total_entries || 0,
        total_pages: data.pagination?.total_pages || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Apollo Email ───

// Get email accounts connected in Apollo (requires Master API key)
app.get('/api/apollo/email/accounts', async (req, res) => {
  try {
    const apolloKey = req.headers['x-apollo-key'];
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    const resp = await fetch('https://api.apollo.io/api/v1/email_accounts', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apolloKey,
      },
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = {}; }
    if (!resp.ok) {
      // 403 = not a master key, 404 = no accounts or endpoint inaccessible
      if (resp.status === 403 || resp.status === 404) {
        return res.json({ success: true, data: [], warning: 'Email accounts require a Master API key. Upgrade in Apollo Settings → API.' });
      }
      throw new Error(data.error || `Apollo API error ${resp.status}`);
    }
    res.json({ success: true, data: data.email_accounts || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send email now (create draft then send)
app.post('/api/apollo/email/send', async (req, res) => {
  try {
    const { apolloKey, ...body } = req.body;
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    if (!body.to_email) return res.status(400).json({ error: 'Provide to_email' });
    if (!body.subject || !body.body) return res.status(400).json({ error: 'Provide subject and body' });

    // If no Apollo contact_id, create the contact in Apollo first
    let contactId = body.contact_id;
    if (!contactId && body.to_email) {
      try {
        const createResp = await apolloProxy(apolloKey, '/v1/contacts', {
          email: body.to_email,
          first_name: body.first_name || body.to_name || '',
          last_name: body.last_name || '',
          organization_name: body.company || '',
          title: body.title || '',
        });
        contactId = createResp.contact?.id;
      } catch (e) {
        // Contact might already exist, try to find it
        const searchResp = await apolloProxy(apolloKey, '/v1/mixed_people/api_search', {
          q_email: body.to_email,
          page: 1,
          per_page: 1,
        });
        contactId = searchResp.people?.[0]?.id;
      }
    }

    if (!contactId) throw new Error('Could not find or create contact in Apollo');

    // Step 1: Create draft
    const draftBody = {
      contact_id: contactId,
      subject: body.subject,
      body_html: body.body,
      enable_tracking: true,
    };
    if (body.email_account_id) draftBody.email_account_id = body.email_account_id;

    const draftData = await apolloProxy(apolloKey, '/v1/emailer_messages', draftBody);
    const messageId = draftData.emailer_message?.id;
    if (!messageId) throw new Error('Failed to create email draft');

    // Step 2: Send immediately
    const sendData = await apolloProxy(apolloKey, `/v1/emailer_messages/${messageId}/send_now`, {
      surface: 'emails',
    });
    res.json({ success: true, data: sendData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create email draft
app.post('/api/apollo/email/draft', async (req, res) => {
  try {
    const { apolloKey, ...body } = req.body;
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    const params = {
      contact_id: body.contact_id,
      subject: body.subject,
      body_html: body.body,
      recipients: body.to_email ? [{
        email: body.to_email,
        contact_id: body.contact_id,
        recipient_type_cd: 'to',
      }] : undefined,
      enable_tracking: true,
    };
    if (body.email_account_id) params.email_account_id = body.email_account_id;
    const data = await apolloProxy(apolloKey, '/v1/emailer_messages', params);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Apollo Sequences ───

// Search sequences
app.post('/api/apollo/sequences/search', async (req, res) => {
  try {
    const { apolloKey, ...body } = req.body;
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    const data = await apolloProxy(apolloKey, '/v1/emailer_campaigns/search', {
      q_name: body.q_name || undefined,
      page: body.page || 1,
      per_page: body.per_page || 25,
    });
    const sequences = (data.emailer_campaigns || []).map(s => ({
      id: s.id,
      name: s.name,
      active: s.active,
      archived: s.archived,
      num_steps: s.num_steps,
      created: s.created_at,
      permissions: s.permissions,
      stats: {
        scheduled: s.unique_scheduled || 0,
        delivered: s.unique_delivered || 0,
        opened: s.unique_opened || 0,
        clicked: s.unique_clicked || 0,
        replied: s.unique_replied || 0,
        bounced: s.unique_bounced || 0,
        unsubscribed: s.unique_unsubscribed || 0,
        open_rate: s.open_rate || 0,
        click_rate: s.click_rate || 0,
        reply_rate: s.reply_rate || 0,
        bounce_rate: s.bounce_rate || 0,
      },
      contact_statuses: s.contact_statuses || {},
    }));
    res.json({
      success: true,
      data: sequences,
      pagination: {
        page: data.pagination?.page || 1,
        total_entries: data.pagination?.total_entries || 0,
        total_pages: data.pagination?.total_pages || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create sequence
app.post('/api/apollo/sequences/create', async (req, res) => {
  try {
    const { apolloKey, ...body } = req.body;
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    const steps = (body.steps || []).map((step, i) => ({
      type: step.type || 'auto_email',
      wait_time: step.wait_time || 0,
      wait_mode: step.wait_mode || 'day',
      note: step.note || '',
      emailer_touches: [{
        type: i === 0 ? 'new_thread' : 'reply_to_thread',
        status: 'approved',
        include_signature: true,
        emailer_template: {
          subject: step.subject || '',
          body_html: step.body || '',
        },
      }],
    }));
    const data = await apolloProxy(apolloKey, '/v1/sequences', {
      name: body.name,
      permissions: body.permissions || 'team_can_use',
      active: body.active !== false,
      mark_finished_if_reply: true,
      mark_finished_if_click: true,
      mark_paused_if_ooo: true,
      emailer_steps: steps,
    });
    const seq = data.emailer_campaign;
    res.json({
      success: true,
      data: {
        id: seq?.id,
        name: seq?.name,
        active: seq?.active,
        num_steps: seq?.num_steps,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activate sequence
app.post('/api/apollo/sequences/:id/activate', async (req, res) => {
  try {
    const apolloKey = req.headers['x-apollo-key'];
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    const data = await apolloProxy(apolloKey, `/v1/sequences/${req.params.id}/activate`, {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deactivate sequence
app.post('/api/apollo/sequences/:id/deactivate', async (req, res) => {
  try {
    const apolloKey = req.headers['x-apollo-key'];
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    const data = await apolloProxy(apolloKey, `/v1/sequences/${req.params.id}/deactivate`, {});
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add contacts to sequence
app.post('/api/apollo/sequences/:id/contacts', async (req, res) => {
  try {
    const { apolloKey, ...body } = req.body;
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    const params = {
      emailer_campaign_id: req.params.id,
      contact_ids: body.contact_ids || [],
      sequence_no_email: true,
      sequence_unverified_email: true,
      sequence_active_in_other_campaigns: true,
      sequence_finished_in_other_campaigns: true,
      sequence_same_company_in_same_campaign: true,
    };
    if (body.email_account_id) {
      params.send_email_from_email_account_id = body.email_account_id;
    }
    const data = await apolloProxy(apolloKey, `/v1/emailer_campaigns/${req.params.id}/add_contact_ids`, params);
    const skipped = data.skipped_contact_ids || {};
    const skippedReasons = {};
    Object.entries(skipped).forEach(([id, reason]) => {
      skippedReasons[id] = typeof reason === 'string' ? reason : JSON.stringify(reason);
    });
    res.json({
      success: true,
      data: {
        added: (data.contacts || []).length,
        skipped: skippedReasons,
        skipped_raw: skipped,
        campaign: data.emailer_campaign,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get email schedules
app.get('/api/apollo/email/schedules', async (req, res) => {
  try {
    const apolloKey = req.headers['x-apollo-key'];
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    const data = await apolloProxy(apolloKey, '/v1/email_schedules', {});
    res.json({ success: true, data: data.email_schedules || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test Apollo key with a real search
app.post('/api/apollo/test-key', async (req, res) => {
  try {
    const { apolloKey } = req.body;
    if (!apolloKey) return res.status(400).json({ error: 'Apollo API key required' });
    
    // Clean the key
    const cleanKey = apolloKey.trim().replace(/[\r\n\t]/g, '');
    console.log('[Test] Original length:', apolloKey.length, 'Clean length:', cleanKey.length);
    console.log('[Test] First 12:', JSON.stringify(cleanKey.slice(0, 12)));
    console.log('[Test] Last 6:', JSON.stringify(cleanKey.slice(-6)));
    console.log('[Test] Contains space:', cleanKey.includes(' '));
    console.log('[Test] Char codes at start:', [...cleanKey.slice(0,20)].map(c => c.charCodeAt(0)));
    
    const resp = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': cleanKey,
      },
      body: JSON.stringify({ q_keywords: 'test', page: 1, per_page: 1 }),
    });
    const text = await resp.text();
    console.log('[Test] Apollo status:', resp.status);
    console.log('[Test] Apollo response:', text.slice(0, 300));
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    
    if (resp.ok && data.people) {
      res.json({ success: true, message: 'Connected! Found ' + (data.pagination?.total_entries || 0) + ' people' });
    } else {
      const errMsg = data.error || data.message || data.raw || JSON.stringify(data);
      res.json({ success: false, error: errMsg, status: resp.status });
    }
  } catch (err) {
    console.log('[Test] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Health ───
app.get('/api/health', (_req, res) => res.json({ ok: true, configured: !IS_PLACEHOLDER }));

// ─── Serve frontend (Docker / single-container mode) ───
import { fileURLToPath as _fileURLToPath } from 'url';
import { dirname as _dirname, join as _join } from 'path';
const __fileDir = _dirname(_fileURLToPath(import.meta.url));
const _staticDir = _join(__fileDir, 'public', 'static');
import { existsSync as _existsSync } from 'fs';
if (_existsSync(_staticDir)) {
  app.use(express.static(_staticDir, { maxAge: '1d', index: false }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/mcp')) return;
    res.sendFile(_join(_staticDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API running on :${PORT}`));
