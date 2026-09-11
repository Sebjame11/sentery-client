import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { logActivity, userNameOf } from './activity.js';

const sb = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const router = Router();

if (!sb) console.warn('[Meetings] Supabase service role not configured — Meetings endpoints disabled');

function needDb(res) {
  if (sb) return true;
  res.status(503).json({ error: 'Meetings not configured — add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env' });
  return false;
}

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const GOOGLE_REDIRECT_URI = (process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google/callback').trim();
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const GOOGLE_SCOPES = 'openid email https://www.googleapis.com/auth/calendar';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_CAL = 'https://www.googleapis.com/calendar/v3';

function googleConfigured() {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && !GOOGLE_CLIENT_ID.startsWith('your-'));
}

// ─── Auth middleware: verify Supabase JWT + workspace membership ───
async function requireMember(req, res, next) {
  try {
    if (!needDb(res)) return;
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

// ─── Google token helpers ───
async function exchangeCode(code) {
  const params = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  const resp = await fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error_description || data.error || 'Google token exchange failed');
  return data;
}

async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const resp = await fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error_description || data.error || 'Google token refresh failed');
  return data;
}

async function getAccessToken(workspaceId) {
  const { data: row } = await sb.from('google_tokens').select('*').eq('workspace_id', workspaceId).maybeSingle();
  if (!row || !row.refresh_token) throw new Error('Google Calendar not connected');
  if (row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 60000) return { access_token: row.access_token, email: row.email, calendar_id: row.calendar_id };
  const fresh = await refreshAccessToken(row.refresh_token);
  await sb.from('google_tokens').update({
    access_token: fresh.access_token,
    expires_at: new Date(Date.now() + (fresh.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('workspace_id', workspaceId);
  return { access_token: fresh.access_token, email: row.email, calendar_id: row.calendar_id };
}

async function googleFetch(path, { method = 'GET', accessToken, body, params } = {}) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const resp = await fetch(`${GOOGLE_CAL}${path}${qs}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {}; }
  if (!resp.ok) throw new Error(data.error?.message || data.error || `Google API error ${resp.status}`);
  return data;
}

// ─── Timezone helpers ───
function tzOffsetMs(tz, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map(p => [p.type, p.value]));
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUTC - date.getTime();
}

function zonedTime(dateStr, time, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(guess - tzOffsetMs(tz, new Date(guess)));
}

function dayInTz(tz, offsetDays = 0) {
  const now = new Date();
  const offset = tzOffsetMs(tz, now);
  const shifted = new Date(now.getTime() + offset);
  const day = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + offsetDays));
  const local = new Date(day.getTime() - offset);
  return local.toISOString().slice(0, 10);
}

function pad(n) { return String(n).padStart(2, '0'); }

// ─── Availability / slots ───
const DEFAULT_AVAILABILITY = {
  timezone: 'America/New_York',
  days: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '17:00',
  duration: 30,
  buffer: 15,
  slot_step: 30,
};

async function blockedIntervals(workspaceId, timeMin, timeMax) {
  const blocked = [];
  const { data: meetings } = await sb.from('meetings')
    .select('starts_at, ends_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'scheduled')
    .gte('starts_at', timeMin)
    .lt('starts_at', timeMax);
  (meetings || []).forEach(m => blocked.push({ start: m.starts_at, end: m.ends_at, source: 'meeting' }));

  const { data: tokenRow } = await sb.from('google_tokens').select('refresh_token').eq('workspace_id', workspaceId).maybeSingle();
  if (!tokenRow || !tokenRow.refresh_token) throw new Error('Google Calendar not connected');

  try {
    const { access_token, calendar_id } = await getAccessToken(workspaceId);
    const data = await googleFetch('/freeBusy', {
      method: 'POST',
      accessToken: access_token,
      body: { timeMin, timeMax, items: [{ id: calendar_id || 'primary' }] },
    });
    (data.calendars?.[calendar_id || 'primary']?.busy || []).forEach(b => {
      blocked.push({ start: b.start, end: b.end, source: 'google' });
    });
  } catch (err) {
    console.warn('[Meetings] freeBusy failed:', err.message);
  }
  return blocked;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(aEnd).getTime() > new Date(bStart).getTime();
}

async function computeOpenSlots(workspace, numDays) {
  const avail = { ...DEFAULT_AVAILABILITY, ...(workspace.booking_availability || {}) };
  const tz = avail.timezone || 'America/New_York';
  const duration = avail.duration || 30;
  const buffer = avail.buffer || 15;
  const step = avail.slot_step || duration;
  const days = avail.days || [1, 2, 3, 4, 5];

  const firstDay = dayInTz(tz, 0);
  const lastDay = dayInTz(tz, numDays);
  const rangeStart = zonedTime(firstDay, '00:00', tz).toISOString();
  const rangeEnd = zonedTime(lastDay, '23:59', tz).toISOString();
  const blocked = await blockedIntervals(workspace.id, rangeStart, rangeEnd);
  const blockedPadded = blocked.map(b => ({
    start: new Date(new Date(b.start).getTime() - buffer * 60000).toISOString(),
    end: new Date(new Date(b.end).getTime() + buffer * 60000).toISOString(),
  }));
  const nowMs = Date.now() + buffer * 60000;

  const result = [];
  for (let i = 0; i <= numDays; i++) {
    const dateStr = dayInTz(tz, i);
    const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    if (!days.includes(dow)) continue;
    let t = avail.start;
    const slots = [];
    while (t < avail.end) {
      const start = zonedTime(dateStr, t, tz);
      const end = new Date(start.getTime() + duration * 60000);
      if (end.getTime() > nowMs && !blockedPadded.some(b => overlaps(start.toISOString(), end.toISOString(), b.start, b.end))) {
        slots.push({ start: start.toISOString(), end: end.toISOString() });
      }
      const [hh, mm] = t.split(':').map(Number);
      const next = new Date(Date.UTC(2000, 0, 1, hh, mm) + step * 60000);
      t = `${pad(next.getUTCHours())}:${pad(next.getUTCMinutes())}`;
    }
    if (slots.length) result.push({ date: dateStr, dow, slots });
  }
  return result;
}

function buildICS({ start, end, title, description, organizerEmail, organizerName, guestEmail, guestName, location }) {
  const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const now = fmt(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sentery//Meetings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:' + start + '@sentery',
    'DTSTAMP:' + now,
    `DTSTART:${fmt(new Date(start))}`,
    `DTEND:${fmt(new Date(end))}`,
    'SUMMARY:' + (title || 'Meeting').replace(/[\\;,]/g, ''),
    'DESCRIPTION:' + (description || '').replace(/[\\;,]/g, '').replace(/\n/g, '\\n'),
    'ORGANIZER;CN=' + (organizerName || '').replace(/[\\;,]/g, '') + ':mailto:' + organizerEmail,
    'ATTENDEE;CN=' + (guestName || '').replace(/[\\;,]/g, '') + ';RSVP=TRUE:mailto:' + guestEmail,
    'STATUS:CONFIRMED',
    location ? 'LOCATION:' + location.replace(/[\\;,]/g, '') : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n') + '\r\n';
}

// ─── Routes ───

// Public: booking page config
router.get('/meetings/config', async (req, res) => {
    if (!needDb(res)) return;
  try {
    const slug = req.query.slug;
    if (!slug) return res.status(400).json({ error: 'slug required' });
    const { data: ws } = await sb.from('workspaces')
      .select('id, name, booking_slug, booking_name, booking_logo_url, booking_message, booking_enabled, booking_availability')
      .eq('booking_slug', slug).maybeSingle();
    if (!ws) return res.status(404).json({ error: 'Booking page not found' });
    const { data: tokenRow } = await sb.from('google_tokens').select('refresh_token').eq('workspace_id', ws.id).maybeSingle();
    res.json({
      success: true,
      data: {
        slug: ws.booking_slug,
        name: ws.booking_name || ws.name,
        logo_url: ws.booking_logo_url,
        message: ws.booking_message,
        enabled: ws.booking_enabled,
        connected: !!(tokenRow?.refresh_token),
        availability: ws.booking_availability,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auth: booking settings + google connection status
router.get('/meetings/status', requireMember, async (req, res) => {
    if (!needDb(res)) return;
  try {
    const { data: ws } = await sb.from('workspaces')
      .select('id, name, booking_slug, booking_name, booking_logo_url, booking_message, booking_enabled, booking_availability')
      .eq('id', req.workspaceId).maybeSingle();
    const { data: tokens } = await sb.from('google_tokens')
      .select('email, calendar_id, connected_at').eq('workspace_id', req.workspaceId).maybeSingle();
    res.json({
      success: true,
      data: {
        workspace: ws,
        google: tokens ? { email: tokens.email, calendar_id: tokens.calendar_id, connected_at: tokens.connected_at } : null,
        google_configured: googleConfigured(),
        booking_url: ws?.booking_slug ? `${APP_URL}/book/${ws.booking_slug}` : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auth (admin): update booking settings
router.post('/meetings/config', requireMember, async (req, res) => {
    if (!needDb(res)) return;
  try {
    if (!req.isAdmin) return res.status(403).json({ error: 'Admin required' });
    const { booking_slug, booking_name, booking_logo_url, booking_message, booking_enabled, booking_availability } = req.body;
    const updates = {};
    if (booking_slug !== undefined) {
      if (!/^[a-z0-9-]+$/.test(booking_slug)) return res.status(400).json({ error: 'Slug: lowercase letters, numbers, hyphens only' });
      updates.booking_slug = booking_slug;
    }
    if (booking_name !== undefined) updates.booking_name = booking_name;
    if (booking_logo_url !== undefined) updates.booking_logo_url = booking_logo_url;
    if (booking_message !== undefined) updates.booking_message = booking_message;
    if (booking_enabled !== undefined) updates.booking_enabled = !!booking_enabled;
    if (booking_availability !== undefined) updates.booking_availability = booking_availability;
    const { data, error } = await sb.from('workspaces').update(updates).eq('id', req.workspaceId).select().maybeSingle();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'That booking link is already taken' });
      return res.status(400).json({ error: error.message });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auth: generate Google OAuth consent URL
router.get('/google/auth-url', requireMember, async (req, res) => {
    if (!needDb(res)) return;
  try {
    if (!googleConfigured()) return res.status(400).json({ error: 'Google OAuth is not configured on the server' });
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: GOOGLE_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: String(req.workspaceId),
    });
    res.json({ success: true, url: `${GOOGLE_AUTH}?${params.toString()}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public: OAuth callback (browser lands here from Google)
router.get('/google/callback', async (req, res) => {
    if (!needDb(res)) return;
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${APP_URL}/meetings?google=error&reason=${encodeURIComponent(error)}`);
    if (!code) return res.status(400).json({ error: 'Missing authorization code' });
    const tokens = await exchangeCode(code);
    const uiResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await uiResp.json();
    await sb.from('google_tokens').upsert({
      workspace_id: Number(state),
      email: userInfo.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      calendar_id: 'primary',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    res.redirect(`${APP_URL}/meetings?google=connected`);
    logActivity({
      workspaceId: Number(state), action: 'connected', entityType: 'meeting', entityName: 'Google Calendar',
      summary: `Google Calendar connected — ${userInfo.email || ''}`,
      metadata: { email: userInfo.email || null },
    });
  } catch (err) {
    console.error('[Google Callback]', err.message);
    res.redirect(`${APP_URL}/meetings?google=error&reason=${encodeURIComponent(err.message)}`);
  }
});

// Auth: disconnect Google Calendar
router.post('/google/disconnect', requireMember, async (req, res) => {
  if (!needDb(res)) return;
  try {
    await sb.from('google_tokens').delete().eq('workspace_id', req.workspaceId);
    logActivity({
      workspaceId: req.workspaceId, userId: req.userId, user_name: await userNameOf(req.userId),
      action: 'disconnected', entityType: 'meeting', entityName: 'Google Calendar',
      summary: `disconnected Google Calendar`,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public: open slots for a booking page
router.get('/meetings/slots', async (req, res) => {
    if (!needDb(res)) return;
  try {
    const slug = req.query.slug;
    const numDays = Math.min(parseInt(req.query.days) || 14, 30);
    if (!slug) return res.status(400).json({ error: 'slug required' });
    const { data: ws } = await sb.from('workspaces')
      .select('id, booking_slug, booking_enabled, booking_availability').eq('booking_slug', slug).maybeSingle();
    if (!ws) return res.status(404).json({ error: 'Booking page not found' });
    if (!ws.booking_enabled) return res.json({ success: true, data: [], disabled: true });
    const data = await computeOpenSlots(ws, numDays);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public: book a meeting
router.post('/meetings/book', async (req, res) => {
    if (!needDb(res)) return;
  try {
    const { slug, start, end, guest_name, guest_email, guest_company, guest_notes, guest_timezone } = req.body;
    if (!slug || !start || !end || !guest_name || !guest_email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest_email)) return res.status(400).json({ error: 'Invalid email address' });
    const { data: ws } = await sb.from('workspaces')
      .select('id, name, booking_slug, booking_name, booking_logo_url, booking_message, booking_enabled, booking_availability')
      .eq('booking_slug', slug).maybeSingle();
    if (!ws) return res.status(404).json({ error: 'Booking page not found' });
    if (!ws.booking_enabled) return res.status(403).json({ error: 'Booking is disabled' });

    const open = await computeOpenSlots(ws, 14);
    const target = new Date(start).getTime();
    const available = open.some(day => day.slots.some(s => new Date(s.start).getTime() === target));
    if (!available) return res.status(409).json({ error: 'That time is no longer available' });

    const { access_token, email, calendar_id } = await getAccessToken(ws.id);
    const title = `${ws.booking_name || ws.name} x ${guest_company || guest_name} Discovery Meeting`;
    const event = {
      summary: title,
      description: `Booked via ${APP_URL}/book/${ws.booking_slug}` + (guest_notes ? `\n\nNotes: ${guest_notes}` : ''),
      start: { dateTime: start, timeZone: 'UTC' },
      end: { dateTime: end, timeZone: 'UTC' },
      attendees: [
        { email, displayName: ws.booking_name || ws.name, responseStatus: 'accepted' },
        { email: guest_email, displayName: guest_name, responseStatus: 'accepted' },
      ],
      guestsCanModify: false,
      reminders: { useDefault: true },
      conferenceData: {
        createRequest: {
          requestId: `sentery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };
    const created = await googleFetch(`/calendars/${calendar_id || 'primary'}/events`, {
      method: 'POST', accessToken: access_token, body: event, params: { conferenceDataVersion: 1 },
    });
    console.log('[Meetings] created event', created.id, 'conferenceData:', JSON.stringify(created.conferenceData || {}).slice(0, 400));

    // Google creates the Meet conference asynchronously — poll until the link appears
    let meetLink = created.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null;
    if (!meetLink && created.id) {
      for (let i = 0; i < 20 && !meetLink; i++) {
        await new Promise(r => setTimeout(r, 1500));
        try {
          const ev = await googleFetch(`/calendars/${calendar_id || 'primary'}/events/${created.id}`, {
            accessToken: access_token,
          });
          meetLink = ev.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null;
          if (ev.conferenceData?.createRequest?.status) {
            console.log('[Meetings] poll', i, 'status:', ev.conferenceData.createRequest.status);
          }
        } catch (pollErr) {
          console.warn('[Meetings] poll event failed:', pollErr.message);
        }
      }
    }
    if (!meetLink) console.warn('[Meetings] Meet link not ready after polling. conferenceData:', JSON.stringify(created.conferenceData || {}).slice(0, 400));

    const prospectMatch = await sb.from('prospects')
      .select('id, name').eq('workspace_id', ws.id).ilike('email', guest_email).maybeSingle();

    const { data: meeting, error: insertErr } = await sb.from('meetings').insert({
      workspace_id: ws.id,
      prospect_id: prospectMatch?.id || null,
      guest_name, guest_email, guest_company, guest_notes, guest_timezone,
      starts_at: start, ends_at: end,
      google_event_id: created.id,
      location: meetLink,
    }).select().single();
    if (insertErr) throw insertErr;

    if (prospectMatch?.id) {
      await sb.from('prospects').update({ stage: 'meeting', stage_entered_at: new Date().toISOString().slice(0, 10) })
        .eq('id', prospectMatch.id);
      await sb.from('touchpoints').insert({
        prospect_id: prospectMatch.id,
        channel: 'Calendar',
        note: `Booked ${new Date(start).toLocaleString()} via booking link`,
        outcome: 'completed',
        date: new Date().toISOString().slice(0, 10),
      });
    }

    const ics = buildICS({
      start, end, title,
      description: (meetLink ? `Join: ${meetLink}` + (ws.booking_message ? '\n\n' : '') : '') + (ws.booking_message || `Booked via ${APP_URL}/book/${ws.booking_slug}`),
      organizerEmail: email, organizerName: ws.booking_name || ws.name,
      guestEmail: guest_email, guestName: guest_name,
      location: meetLink,
    });

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const from = process.env.RESEND_FROM || 'Sentery <notifications@sentery.it.com>';
      const fmtGuest = d => new Date(d).toLocaleString('en-US', { timeZone: guest_timezone || 'UTC', dateStyle: 'full', timeStyle: 'short' });
      await resend.emails.send({
        from, to: guest_email,
        subject: `You're booked: ${title}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto"><h2 style="margin-bottom:4px">${title}</h2><p style="color:#666">${fmtGuest(start)}${guest_company ? ' · ' + guest_company : ''}</p>${meetLink ? `<p><a href="${meetLink}" style="display:inline-block;margin:8px 0;padding:10px 20px;background:#1a73e8;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Join Google Meet</a></p>` : ''}<p>See you there! The calendar invite is attached. Need to reschedule? Just reply to this email.</p></div>`,
        attachments: [{ filename: 'booking.ics', content: Buffer.from(ics).toString('base64') }],
      });
    } catch (emailErr) {
      console.warn('[Meetings] confirmation email failed:', emailErr.message);
    }

    res.json({ success: true, data: meeting });
    logActivity({
      workspaceId: ws.id, action: 'booked', entityType: 'meeting', entityId: meeting.id,
      entityName: guest_name,
      summary: `${guest_name}${guest_company ? ` (${guest_company})` : ''} booked a meeting for ${new Date(start).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
      metadata: { guest_email, guest_company, starts_at: start },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auth: cancel a meeting
router.post('/meetings/cancel', requireMember, async (req, res) => {
    if (!needDb(res)) return;
  try {
    const { id } = req.body;
    const { data: meeting } = await sb.from('meetings').select('*').eq('id', id).eq('workspace_id', req.workspaceId).maybeSingle();
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.google_event_id) {
      try {
        const { access_token, calendar_id } = await getAccessToken(req.workspaceId);
        await googleFetch(`/calendars/${calendar_id || 'primary'}/events/${meeting.google_event_id}`, {
          method: 'DELETE', accessToken: access_token,
        });
      } catch (err) {
        console.warn('[Meetings] delete google event failed:', err.message);
      }
    }
    await sb.from('meetings').update({ status: 'cancelled' }).eq('id', id);
    logActivity({
      workspaceId: req.workspaceId, userId: req.userId, user_name: await userNameOf(req.userId),
      action: 'cancelled', entityType: 'meeting', entityId: id, entityName: meeting.guest_name,
      summary: `cancelled the meeting with ${meeting.guest_name}`,
      metadata: { guest_email: meeting.guest_email },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
export { getAccessToken, googleFetch, computeOpenSlots, blockedIntervals };
