import { supabase } from '../lib/supabase';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export async function api(path, { method = 'GET', body, auth } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    let token = auth;
    if (auth === true) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
    }
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const resp = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {}; }
  if (!resp.ok) throw new Error(data.error || text || `Request failed (${resp.status})`);
  return data;
}

export function downloadICS({ title, start, end, description, name, email }) {
  const fmt = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',     'PRODID:-//Sentery//Meetings//EN',
    'BEGIN:VEVENT',
    `UID:${start}@sentery`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(new Date(start))}`,
    `DTEND:${fmt(new Date(end))}`,
    'SUMMARY:' + (title || 'Meeting').replace(/[\\;,]/g, ''),
    'DESCRIPTION:' + (description || '').replace(/[\\;,]/g, ''),
    'STATUS:CONFIRMED',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'booking.ics';
  a.click();
}