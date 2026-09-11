import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { logActivity, userNameOf } from './activity.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const GOOGLE_REDIRECT_URI = (process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google/callback').trim();
const APP_URL = (process.env.APP_URL || 'http://localhost:5173').trim();

const EMAIL_SCOPES = 'openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

const router = Router();

function googleConfigured() {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && !GOOGLE_CLIENT_ID.startsWith('your-'));
}

async function requireMember(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' });
    const ws = req.query.workspace_id || req.body?.workspace_id;
    if (!ws) return res.status(400).json({ error: 'workspace_id required' });
    const { data: membership } = await sb.from('workspace_members').select('workspace_id').eq('workspace_id', ws).eq('user_id', user.id).maybeSingle();
    if (!membership) return res.status(403).json({ error: 'Not a member of this workspace' });
    req.workspaceId = Number(ws);
    req.userId = user.id;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

async function getAccount(workspaceId, userId) {
  const { data } = await sb.from('email_accounts').select('*').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  return data || null;
}

async function refreshAccessToken(account) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: account.refresh_token,
    grant_type: 'refresh_token',
  });
  const resp = await fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
  const json = await resp.json();
  if (!resp.ok) throw new Error('Token refresh failed: ' + (json.error_description || json.error || resp.status));
  await sb.from('email_accounts').update({
    access_token: json.access_token,
    expires_at: new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('workspace_id', account.workspace_id).eq('user_id', account.user_id);
  return json.access_token;
}

export async function getEmailToken(workspaceId, userId) {
  const account = await getAccount(workspaceId, userId);
  if (!account) throw new Error('No email account connected');
  if (account.expires_at && new Date(account.expires_at).getTime() > Date.now() + 60000) {
    return { access_token: account.access_token, email: account.email, account };
  }
  const accessToken = await refreshAccessToken(account);
  return { access_token: accessToken, email: account.email, account: { ...account, access_token: accessToken } };
}

async function gmailFetch(path, accessToken, opts = {}) {
  const resp = await fetch(`${GMAIL}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${accessToken}`, ...(opts.headers || {}) },
  });
  if (resp.status === 401) throw new Error('Gmail access expired');
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gmail API error ${resp.status}`);
  }
  return resp.json();
}

// ─── Matching ───
function normEmail(e) { return String(e || '').trim().toLowerCase(); }

function extractAddresses(raw) {
  const out = [];
  String(raw || '').split(',').forEach(part => {
    const m = part.match(/<([^<>]+)>/);
    out.push(normEmail(m ? m[1] : part));
  });
  return out.filter(Boolean);
}

export async function matchContacts(workspaceId, addresses) {
  const set = [...new Set(addresses.map(normEmail).filter(Boolean))];
  if (set.length === 0) return {};
  const { data } = await sb.from('prospects')
    .select('id, name, email, company')
    .eq('workspace_id', workspaceId)
    .in('email', set);
  const map = {};
  (data || []).forEach(p => {
    const key = normEmail(p.email);
    if (!map[key]) map[key] = [];
    map[key].push({ id: p.id, name: p.name, company: p.company || '' });
  });
  return map;
}

// ─── Message parsing ───
function header(msg, name) {
  const h = (msg.payload?.headers || []).find(x => x.name.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

function decodeHtmlEntities(str) {
  return str.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/');
}

function cleanEmailHtml(html) {
  if (!html) return '';
  let h = html;

  // Extract body content — strip everything before <body
  const bodyStart = h.search(/<body[\s>]/i);
  if (bodyStart !== -1) h = h.slice(bodyStart);
  // Remove <body...> opening tag
  h = h.replace(/^<body[^>]*>/i, '');
  // Remove closing </body> and </html> if present
  h = h.replace(/<\/body>/gi, '');
  h = h.replace(/<\/html>/gi, '');

  // Strip <style> blocks and <head> content
  h = h.replace(/<head[\s\S]*?<\/head>/gi, '');
  h = h.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Strip tracking pixels (1x1 images, spacer gifs)
  h = h.replace(/<img[^>]*(width=["']?1["']?|height=["']?1["']?|spacer|pixel|track|beacon)[^>]*>/gi, '');

  // Strip read.ai / meeting summary noise — only match at start of a line or after a tag, and only strip to next block element
  h = h.replace(/(?:^|>)(?:app\.read\.ai|cal\.read\.ai|read\.ai\/analytics)[^<]*(?:<[^>]*>[^<]*)*?<\/(?:div|table|section|footer)>/im, '');
  h = h.replace(/(?:What was discussed|Pre-Read.*?upcoming meeting)\s*(?:<[^>]*>\s*)*?(?:<\/(?:div|table|section|footer)>)/im, '');

  // Strip Google Calendar forwarding warnings and noise — only the calendar footer block
  h = h.replace(/(?:Forwarding this invitation|You are receiving this email because)[^<]*(?:<[^>]*>[^<]*)*?<\/(?:div|table|section)>/im, '');
  h = h.replace(/Learn more[^<]*(?:forwarding|calendar)[^<]*(?:<[^>]*>[^<]*)*?<\/(?:div|table)>/im, '');

  // Strip unsubscribe footers — only match within the last 20% of the email or after a horizontal rule / divider
  const footerStart = Math.floor(h.length * 0.8);
  const footerHtml = h.slice(footerStart);
  const cleanedFooter = footerHtml
    .replace(/(?:Unsubscribe|Email Preferences|Manage your preferences)[^<]*(?:<[^>]*>[^<]*)*?<\/(?:div|table|section|footer)>/im, '')
    .replace(/(?:Team at Read AI|Team at read\.ai)[^<]*(?:<[^>]*>[^<]*)*?<\/(?:div|table|section|footer)>/im, '');
  h = h.slice(0, footerStart) + cleanedFooter;

  // Strip Outlook signature blocks
  h = h.replace(/<div id="ms-outlook-mobile-signature"[\s\S]*?<\/div>/gi, '');
  h = h.replace(/Get Outlook for iOS[\s\S]*/gi, '');

  // Strip VML, conditional comments, Office namespaces
  h = h.replace(/<!--[\s\S]*?-->/g, '');
  h = h.replace(/<v:[^>]*>[\s\S]*?<\/v:[^>]*>/gi, '');
  h = h.replace(/<o:[^>]*>[\s\S]*?<\/o:[^>]*>/gi, '');

  // Strip mail-specific divs
  h = h.replace(/<div id="divRplyFwdMsg"[\s\S]*?<\/div>/gi, '');
  h = h.replace(/<div id="ms-outlook-mobile-body-separator-line"[\s\S]*?<\/div>/gi, '');

  // Decode HTML entities
  h = decodeHtmlEntities(h);

  // Shorten long URLs in display text
  h = h.replace(/<a[^>]*href="([^"]{80,})"[^>]*>([^<]{80,})<\/a>/gi, (m, url, text) => {
    try { const u = new URL(url); return `<a href="${url}" title="${url}">${u.hostname}${u.pathname.slice(0, 30)}...</a>`; } catch { return `<a href="${url}" title="${url}">${text.slice(0, 40)}...</a>`; }
  });

  // Clean up excessive whitespace
  h = h.replace(/\n{3,}/g, '\n\n');
  h = h.replace(/<br\s*\/?\s*>\s*<br\s*\/?\s*>/gi, '<br>');
  h = h.replace(/<p>\s*<\/p>/gi, '');
  h = h.replace(/<div>\s*<\/div>/gi, '');

  return h.trim();
}

function decodeBody(payload) {
  let text = '', html = '';
  const walk = (node) => {
    if (!node) return;
    if (node.mimeType === 'text/plain' && node.body?.data) {
      try { text += decodeHtmlEntities(Buffer.from(node.body.data, 'base64url').toString('utf8')); } catch {}
    } else if (node.mimeType === 'text/html' && node.body?.data) {
      try { html += Buffer.from(node.body.data, 'base64url').toString('utf8'); } catch {}
    }
    if (node.parts) node.parts.forEach(walk);
  };
  walk(payload);
  return { text, html: cleanEmailHtml(html) };
}

async function fetchFull(accessToken, id) {
  const msg = await gmailFetch(`/messages/${id}?format=full`, accessToken);
  return msg;
}

// ─── Activity creation ───
async function createEmailActivities(workspaceId, message, matched, fromEmail) {
  const created = [];
  for (const list of Object.values(matched)) {
    for (const contact of list) {
      const outcome = message.direction === 'sent' ? 'sent' : 'received';
      const { data, error } = await sb.from('touchpoints').insert({
        prospect_id: contact.id,
        channel: 'Email',
        note: `${message.subject ? '[' + message.subject + '] ' : ''}${message.direction === 'sent' ? 'To' : 'From'} ${fromEmail}`,
        outcome,
        date: message.sent_at ? message.sent_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      }).select('id').maybeSingle();
      if (!error && data) {
        await sb.from('touchpoints').update({ email_message_id: message.id }).eq('id', data.id);
        created.push(data.id);
      }
    }
  }
  return created;
}

// ─── Sync ───
export async function syncEmail(workspaceId, userId, { force = false } = {}) {
  const account = await getAccount(workspaceId, userId);
  if (!account) return { ok: false, reason: 'no_account' };
  if (!account.auto_logging && !force) return { ok: false, reason: 'logging_disabled' };
  const { access_token } = await getEmailToken(workspaceId, userId);
  const stats = { processed: 0, matched: 0, created: 0, deleted: 0, errors: 0 };

  try {
    const profile = await gmailFetch('/profile', access_token);
    const hist = force ? null : account.history_id;

    let messagesToProcess = [];
    let newHistoryId = hist;

    if (!hist) {
      const windowDays = account.sync_window_days || 30;
      const q = `newer_than:${windowDays}d -category:promotions -category:social -category:forums`;
      const list = await gmailFetch(`/messages?q=${encodeURIComponent(q)}&maxResults=500`, access_token);
      messagesToProcess = (list.messages || []).map(m => ({ id: m.id, threadId: m.threadId }));
      newHistoryId = profile.historyId;
    } else {
      try {
        const history = await gmailFetch(`/history?startHistoryId=${hist}&historyTypes=messageAdded&historyTypes=messageDeleted`, access_token);
        (history.history || []).forEach(h => {
          (h.messagesAdded || []).forEach(m => messagesToProcess.push({ id: m.message.id, threadId: m.message.threadId }));
          (h.messagesDeleted || []).forEach(m => {
            sb.from('email_messages').update({ is_deleted: true }).eq('workspace_id', workspaceId).eq('user_id', userId).eq('provider_message_id', m.message.id).then(r => {
              if (!r.error && r.count) stats.deleted++;
            });
          });
        });
        newHistoryId = history.historyId;
        if (!newHistoryId) newHistoryId = profile.historyId;
      } catch (e) {
        if (e.message.includes('404') || e.message.includes('Invalid history')) {
          return syncEmail(workspaceId, userId, { force: true });
        }
        throw e;
      }
    }

    for (const m of messagesToProcess) {
      stats.processed++;
      try {
        const { data: exists } = await sb.from('email_messages').select('id').eq('workspace_id', workspaceId).eq('user_id', userId).eq('provider_message_id', m.id).maybeSingle();
        if (exists) continue;

        const meta = await gmailFetch(`/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`, access_token);
        const fromRaw = header(meta, 'From');
        const toRaw = header(meta, 'To');
        const ccRaw = header(meta, 'Cc');
        const subject = header(meta, 'Subject');
        const dateStr = header(meta, 'Date');

        const fromEmail = extractAddresses(fromRaw)[0] || '';
        const accountEmail = normEmail(account.email);
        const direction = normEmail(fromEmail) === accountEmail ? 'sent' : 'received';

        const toEmails = extractAddresses(toRaw);
        const ccEmails = extractAddresses(ccRaw);
        const all = direction === 'sent' ? [...toEmails, ...ccEmails] : [fromEmail, ...toEmails, ...ccEmails];

        const matched = await matchContacts(workspaceId, all);
        if (Object.keys(matched).length === 0) continue;

        const full = await fetchFull(access_token, m.id);
        const { text, html } = decodeBody(full.payload);

        const sentAt = dateStr ? new Date(dateStr).toISOString() : null;
        const fromName = fromRaw.split('<')[0].trim().replace(/^"|"$/g, '') || '';

        const { data: msg, error: insErr } = await sb.from('email_messages').insert({
          workspace_id: workspaceId,
          user_id: userId,
          provider_message_id: m.id,
          thread_id: m.threadId || '',
          direction,
          subject,
          snippet: meta.snippet || '',
          body_text: text,
          body_html: html,
          from_name: fromName,
          from_email: fromEmail,
          to_emails: toEmails,
          cc_emails: ccEmails,
          sent_at: sentAt,
          labels: meta.labelIds || [],
          matched_prospect_ids: Object.values(matched).flat().map(c => c.id),
        }).select('id').maybeSingle();

        if (insErr) throw insErr;
        stats.matched++;
        await createEmailActivities(workspaceId, { ...msg, direction, subject, sent_at: sentAt }, matched, direction === 'sent' ? toEmails[0] || '' : fromEmail);
        stats.created++;
      } catch (e) {
        stats.errors++;
        console.warn('[emails] message error:', e.message);
      }
    }

    await sb.from('email_accounts').update({
      history_id: newHistoryId,
      last_sync_at: new Date().toISOString(),
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq('workspace_id', workspaceId).eq('user_id', userId);

    if (stats.created > 0) {
      logActivity({
        workspaceId, action: 'synced', entityType: 'email', entityName: 'Gmail',
        summary: `Gmail sync logged ${stats.created} new email${stats.created > 1 ? 's' : ''}`,
        metadata: { created: stats.created, processed: stats.processed },
      });
    }

    return { ok: true, stats };
  } catch (e) {
    await sb.from('email_accounts').update({ last_sync_error: e.message, last_sync_at: new Date().toISOString() }).eq('workspace_id', workspaceId).eq('user_id', userId);
    return { ok: false, error: e.message, stats };
  }
}

// ─── Send ───
function encodeHeaderValue(value) {
  if (!value) return '';
  if (/^[\x20-\x7e]+$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

// ─── Rate limiting ───
const sendTimestamps = new Map();
function checkSendRate(workspaceId) {
  const now = Date.now();
  const key = workspaceId;
  const timestamps = sendTimestamps.get(key) || [];
  const recent = timestamps.filter(t => now - t < 60000);
  if (recent.length >= 10) throw new Error('Rate limit: max 10 emails per minute. Please wait and try again.');
  recent.push(now);
  sendTimestamps.set(key, recent);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function sendEmailViaGmail(workspaceId, userId, { to, cc, subject, body, prospectId }) {
  checkSendRate(workspaceId);
  const { access_token, email } = await getEmailToken(workspaceId, userId);
  const toList = Array.isArray(to) ? to : String(to || '').split(',').map(s => s.trim()).filter(Boolean);
  if (toList.length === 0) throw new Error('No recipient');
  const ccList = Array.isArray(cc) ? cc : String(cc || '').split(',').map(s => s.trim()).filter(Boolean);

  const boundary = `boundary_${Date.now()}`;
  const encodedSubject = encodeHeaderValue(subject);
  const encodedBody = Buffer.from(body || '', 'utf8').toString('base64');
  const emailMessageId = `<${Date.now()}.${userId}@sentery.it.com>`;
  const dateStr = new Date().toUTCString();

  const headerLines = [
    `From: ${email}`,
    `To: ${toList.join(', ')}`,
    ccList.length ? `Cc: ${ccList.join(', ')}` : null,
    `Subject: ${encodedSubject}`,
    `Date: ${dateStr}`,
    `Message-ID: ${emailMessageId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    'X-Mailer: Sentery/1.0',
    'X-Priority: 3',
    'List-Unsubscribe: <mailto:unsubscribe@sentery.it.com?subject=unsubscribe>',
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
  ].filter(Boolean);

  const safeBody = (body || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  const bodyParts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodedBody,
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(`<html><body style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#333;">${safeBody}<br><br><hr style="border:none;border-top:1px solid #ddd;margin:20px 0;"><p style="font-size:11px;color:#999;">Sent from <a href="https://sentery.it.com" style="color:#999;">Sentery</a>. <a href="mailto:unsubscribe@sentery.it.com?subject=unsubscribe" style="color:#999;">Unsubscribe</a></p></body></html>`, 'utf8').toString('base64'),
    `--${boundary}--`,
  ];

  const raw = Buffer.from(headerLines.join('\r\n') + '\r\n\r\n' + bodyParts.join('\r\n')).toString('base64url');
  const sent = await gmailFetch('/messages/send?uploadType=multipart', access_token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });

  const sentAt = new Date().toISOString();
  const matched = await matchContacts(workspaceId, toList.concat(ccList));
  let messageId = null;
  if (Object.keys(matched).length > 0) {
    const { data: msg } = await sb.from('email_messages').insert({
      workspace_id: workspaceId,
      user_id: userId,
      provider_message_id: sent.id,
      thread_id: sent.threadId || '',
      direction: 'sent',
      subject: subject || '',
      snippet: (body || '').slice(0, 200),
      body_text: body || '',
      from_email: email,
      to_emails: toList,
      cc_emails: ccList,
      sent_at: sentAt,
      matched_prospect_ids: Object.values(matched).flat().map(c => c.id),
    }).select('id').maybeSingle();
    if (msg) {
      messageId = msg.id;
      await createEmailActivities(workspaceId, { ...msg, direction: 'sent', subject: subject || '', sent_at: sentAt }, matched, toList[0] || '');
    }
  }
  return { id: sent.id, threadId: sent.threadId, emailMessageId: messageId };
}

// ─── Query helpers (used by MCP) ───
export async function searchMessages(workspaceId, userId, filters = {}) {
  let q = sb.from('email_messages').select('id, provider_message_id, thread_id, direction, subject, snippet, body_text, body_html, from_name, from_email, to_emails, cc_emails, sent_at, matched_prospect_ids')
    .eq('workspace_id', workspaceId).eq('user_id', userId).eq('is_deleted', false);
  if (filters.direction) q = q.eq('direction', filters.direction);
  if (filters.thread_id) q = q.eq('thread_id', filters.thread_id);
  if (filters.from) q = q.eq('from_email', normEmail(filters.from));
  if (filters.subject) q = q.ilike('subject', `%${filters.subject}%`);
  if (filters.date_from) q = q.gte('sent_at', filters.date_from);
  if (filters.date_to) q = q.lte('sent_at', filters.date_to);
  if (filters.contact_id) q = q.filter('matched_prospect_ids', 'cs', `[${Number(filters.contact_id)}]`);
  if (filters.company) {
    const { data: prospects } = await sb.from('prospects').select('id').eq('workspace_id', workspaceId).eq('company', filters.company);
    const ids = (prospects || []).map(p => p.id);
    if (ids.length === 0) return [];
    q = q.filter('matched_prospect_ids', 'cs', JSON.stringify(ids));
  }
  if (filters.contact_ids && filters.contact_ids.length) {
    q = q.filter('matched_prospect_ids', 'cs', JSON.stringify(filters.contact_ids));
  }
  const { data, error } = await q.order('sent_at', { ascending: false }).limit(Math.min(filters.limit || 20, 50));
  if (error) throw error;
  return data || [];
}

export async function getMessageDetail(workspaceId, userId, messageId) {
  const { data: msg, error } = await sb.from('email_messages')
    .select('*, touchpoints!inner(prospect_id, prospect:prospects(id, name, email, company))')
    .eq('workspace_id', workspaceId).eq('user_id', userId).eq('id', messageId).maybeSingle();
  if (error || !msg) return null;
  const thread = await sb.from('email_messages')
    .select('id, provider_message_id, thread_id, direction, subject, snippet, body_text, body_html, from_email, to_email, sent_at')
    .eq('workspace_id', workspaceId).eq('user_id', userId).eq('thread_id', msg.thread_id).order('sent_at', { ascending: true });
  return { ...msg, thread_messages: (thread.data || []).filter(m => m.id !== msg.id) };
}

// ─── Routes ───
router.get('/emails/status', requireMember, async (req, res) => {
  let account = null;
  try { account = await getAccount(req.workspaceId, req.userId); } catch { /* table missing — not connected */ }
  let needsAttention = false;
  if (account && account.access_token) {
    try { await getEmailToken(req.workspaceId, req.userId); } catch { needsAttention = true; }
  }
  res.json({
    success: true,
    google_configured: googleConfigured(),
    connected: !!account,
    data: account ? {
      email: account.email,
      provider: account.provider,
      scopes: account.scopes,
      auto_logging: account.auto_logging,
      sync_window_days: account.sync_window_days,
      last_sync_at: account.last_sync_at,
      last_sync_error: account.last_sync_error,
      needs_attention: needsAttention,
      connected_at: account.connected_at,
    } : null,
  });
});

router.get('/emails/connect', requireMember, async (req, res) => {
  if (!googleConfigured()) return res.status(400).json({ error: 'Gmail integration not configured on the server yet' });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: EMAIL_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: `email:${req.workspaceId}:${req.userId}`,
    include_granted_scopes: 'true',
  });
  res.json({ success: true, url: `${GOOGLE_AUTH}?${params.toString()}` });
    logActivity({
      workspaceId: req.workspaceId, userId: req.userId, user_name: await userNameOf(req.userId),
      action: 'connecting', entityType: 'email', entityName: 'Gmail',
      summary: `started connecting Gmail to the workspace`,
    });
});

router.get('/google/callback', async (req, res, next) => {
  const { code, error, state } = req.query;
  const wsMatch = String(state || '').match(/^email:(\d+):([0-9a-f-]{36})$/);
  if (!wsMatch) return next();
  const redirect = (reason) => res.redirect(`${APP_URL}/settings?email=${reason}`);
  if (error) return redirect('error&reason=' + encodeURIComponent(error));
  const workspaceId = Number(wsMatch[1]);
  const userId = wsMatch[2];
  try {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      code: String(code),
      grant_type: 'authorization_code',
    });
    const resp = await fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.error_description || json.error || 'Token exchange failed');

    const accessToken = json.access_token;
    const profile = await gmailFetch('/profile', accessToken);
    await sb.from('email_accounts').upsert({
      workspace_id: workspaceId,
      user_id: userId,
      provider: 'gmail',
      email: profile.emailAddress,
      access_token: accessToken,
      refresh_token: json.refresh_token || '',
      expires_at: new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString(),
      scopes: EMAIL_SCOPES,
      auto_logging: true,
      sync_window_days: 30,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,user_id' });
    logActivity({
      workspaceId, action: 'connected', entityType: 'email', entityName: 'Gmail',
      summary: `Gmail connected — ${profile.emailAddress}`,
      metadata: { email: profile.emailAddress },
    });
    res.redirect(`${APP_URL}/settings?email=connected`);
  } catch (e) {
    res.redirect(`${APP_URL}/settings?email=error&reason=${encodeURIComponent(e.message)}`);
  }
});

router.post('/emails/disconnect', requireMember, async (req, res) => {
  await sb.from('email_accounts').delete().eq('workspace_id', req.workspaceId).eq('user_id', req.userId);
  await sb.from('email_messages').delete().eq('workspace_id', req.workspaceId).eq('user_id', req.userId);
  logActivity({
    workspaceId: req.workspaceId, userId: req.userId, user_name: await userNameOf(req.userId),
    action: 'disconnected', entityType: 'email', entityName: 'Gmail',
    summary: `disconnected Gmail from the workspace`,
  });
  res.json({ success: true });
});

router.post('/emails/config', requireMember, async (req, res) => {
  const account = await getAccount(req.workspaceId, req.userId);
  if (!account) return res.status(400).json({ error: 'No email account connected' });
  const updates = {};
  if (typeof req.body.auto_logging === 'boolean') updates.auto_logging = req.body.auto_logging;
  if (req.body.sync_window_days) updates.sync_window_days = Math.min(Math.max(Number(req.body.sync_window_days), 7), 365);
  updates.updated_at = new Date().toISOString();
  await sb.from('email_accounts').update(updates).eq('workspace_id', req.workspaceId).eq('user_id', req.userId);
  res.json({ success: true });
});

router.post('/emails/sync', requireMember, async (req, res) => {
  try {
    const result = await syncEmail(req.workspaceId, req.userId, { force: true });
    res.json({ success: result.ok, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/emails/send', requireMember, async (req, res) => {
  try {
    const { to, cc, subject, body, prospect_id } = req.body;
    if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject and body are required' });
    const result = await sendEmailViaGmail(req.workspaceId, req.userId, { to, cc, subject, body, prospectId: prospect_id });
    (async () => {
      let summary = `emailed ${to}`;
      if (prospect_id) {
        const { data: p } = await sb.from('prospects').select('name, company').eq('id', prospect_id).maybeSingle();
        if (p) summary = `emailed ${p.name}${p.company ? ` from ${p.company}` : ''}`;
      }
      logActivity({
        workspaceId: req.workspaceId, userId: req.userId, user_name: await userNameOf(req.userId),
        action: 'sent', entityType: 'email', entityId: result.emailMessageId, entityName: to,
        summary, metadata: { to, subject },
      });
    })();
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/emails/search', requireMember, async (req, res) => {
  try {
    const filters = {
      direction: req.query.direction,
      thread_id: req.query.thread_id,
      from: req.query.from,
      subject: req.query.subject,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      contact_id: req.query.contact_id ? Number(req.query.contact_id) : undefined,
      company: req.query.company,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    };
    const messages = await searchMessages(req.workspaceId, req.userId, filters);
    res.json({ success: true, data: messages });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/emails/messages/:id', requireMember, async (req, res) => {
  const msg = await getMessageDetail(req.workspaceId, req.userId, Number(req.params.id));
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  res.json({ success: true, data: msg });
});

router.post('/emails/sync-all', async (req, res) => {
  if (req.headers['x-sync-secret'] !== process.env.SYNC_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const { data: accounts } = await sb.from('email_accounts').select('workspace_id, user_id').eq('auto_logging', true);
  const results = [];
  for (const a of (accounts || [])) results.push({ workspace_id: a.workspace_id, user_id: a.user_id, result: await syncEmail(a.workspace_id, a.user_id) });
  res.json({ success: true, results });
});

router.post('/emails/clean', requireMember, async (req, res) => {
  try {
    const ws = req.workspace_id;
    const { data: messages } = await sb.from('email_messages').select('id, body_html').eq('workspace_id', ws).not('body_html', 'eq', '');
    let cleaned = 0;
    for (const m of (messages || [])) {
      if (!m.body_html) continue;
      const cleanedHtml = cleanEmailHtml(m.body_html);
      if (cleanedHtml !== m.body_html) {
        await sb.from('email_messages').update({ body_html: cleanedHtml }).eq('id', m.id);
        cleaned++;
      }
    }
    res.json({ success: true, cleaned, total: messages?.length || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
export { requireMember };