import { useState, useEffect } from 'react';
import useStore from '../store/useStore';
import { supabase } from '../lib/supabase';
import { api } from '../utils/meetings';
import { showToast } from '../components/Toast';

const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SPRING_SNAP = 'cubic-bezier(0.22, 1, 0.36, 1)';
const TIMEZONES = ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Toronto','America/Sao_Paulo','Europe/London','Europe/Berlin','Europe/Paris','Africa/Lagos','Asia/Dubai','Asia/Kolkata','Asia/Singapore','Asia/Tokyo','Australia/Sydney','Pacific/Auckland','UTC'];
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DURATIONS = [15, 30, 45, 60, 90];

const card = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14,
  overflow: 'hidden', marginBottom: 16,
};
const cardHead = {
  padding: '14px 20px', borderBottom: '1px solid var(--border)',
  fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em',
};
const label = {
  fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em',
  color: 'var(--text-tertiary)', marginBottom: 5,
};
const input = {
  width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-sunken)', color: 'var(--text-primary)', fontSize: 13,
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  transition: `border-color 200ms ${SPRING}`,
};

function Section({ title, children }) {
  return (
    <div style={card}>
      <div style={cardHead}>{title}</div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

export default function Meetings() {
  const workspace = useStore(s => s.workspace);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!workspace) return;
    (async () => {
      try {
        const res = await api(`/meetings/status?workspace_id=${workspace.id}`, { auth: true });
        setStatus(res.data);
        const av = res.data?.workspace?.booking_availability || {};
        setForm({
          booking_slug: res.data?.workspace?.booking_slug || '',
          booking_name: res.data?.workspace?.booking_name || '',
          booking_logo_url: res.data?.workspace?.booking_logo_url || '',
          booking_message: res.data?.workspace?.booking_message || '',
          booking_enabled: !!res.data?.workspace?.booking_enabled,
          timezone: av.timezone || 'America/New_York',
          days: av.days || [1,2,3,4,5],
          start: av.start || '09:00',
          end: av.end || '17:00',
          duration: av.duration || 30,
          buffer: av.buffer || 15,
        });
        const { data } = await supabase
          .from('meetings')
          .select('id, guest_name, guest_email, guest_company, starts_at, ends_at, status, guest_timezone, location')
          .eq('workspace_id', workspace.id)
          .eq('status', 'scheduled')
          .order('starts_at', { ascending: true });
        setBookings(data || []);
      } catch (err) {
        showToast(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [workspace?.id]);

  const connectGoogle = async () => {
    try {
      const res = await api(`/google/auth-url?workspace_id=${workspace.id}`, { auth: true });
      window.open(res.url, '_blank');
    } catch (err) {
      showToast(err.message);
    }
  };

  const saveConfig = async () => {
    if (!form.booking_slug.trim()) { showToast('Booking link required'); return; }
    setSaving(true);
    try {
      const { booking_slug, booking_name, booking_logo_url, booking_message, booking_enabled, timezone, days, start, end, duration, buffer } = form;
      const res = await api('/meetings/config', {
        method: 'POST',
        auth: true,
        body: {
          workspace_id: workspace.id,
          booking_slug: booking_slug.trim().replace(/\s+/g, '-').toLowerCase(),
          booking_name,
          booking_logo_url,
          booking_message,
          booking_enabled,
          booking_availability: { timezone, days, start, end, duration, buffer },
        },
      });
      const refreshed = await api(`/meetings/status?workspace_id=${workspace.id}`, { auth: true });
      setStatus(refreshed.data);
      showToast('Meeting settings saved');
    } catch (err) {
      showToast(err.message);
    } finally {
      setSaving(false);
    }
  };

  const cancelBooking = async (id) => {
    try {
      await api('/meetings/cancel', { method: 'POST', auth: true, body: { workspace_id: workspace.id, id } });
      setBookings(b => b.filter(x => x.id !== id));
      showToast('Meeting cancelled');
    } catch (err) {
      showToast(err.message);
    }
  };

  if (loading || !form) {
    return <div style={{ padding: '32px 24px', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading meetings…</div>;
  }

  const bookingUrl = status?.booking_url || '';

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Meetings</h1>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>One booking link per workspace, synced to Google Calendar.</p>
      </div>

      <Section title="Google Calendar">
        {status?.google ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{status.google.email}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Connected · bookings create events on this calendar</div>
            </div>
            <button
              onClick={async () => {
                if (!confirm('Disconnect Google Calendar? Bookings will stop creating events until you reconnect.')) return;
                try {
                  await api('/google/disconnect', { method: 'POST', auth: true, body: { workspace_id: workspace.id } });
                  setStatus(prev => ({ ...prev, google: null }));
                  showToast('Google Calendar disconnected');
                } catch (err) { showToast(err.message); }
              }}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
            >Disconnect</button>
          </div>
        ) : status?.google_configured ? (
          <button
            onClick={connectGoogle}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Connect Google Calendar
          </button>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Google OAuth isn't configured on the server yet. Add <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>GOOGLE_CLIENT_ID</span> and <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>GOOGLE_CLIENT_SECRET</span> to <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>backend/.env</span>.
          </div>
        )}
      </Section>

      <Section title="Booking Link">
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={label}>Your link</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>/book/</span>
              <input value={form.booking_slug} onChange={e => setForm({ ...form, booking_slug: e.target.value })}
                placeholder="your-company" style={input} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '9px 0', fontSize: 13, color: 'var(--text-secondary)', userSelect: 'none' }}>
            <input type="checkbox" checked={form.booking_enabled} onChange={e => setForm({ ...form, booking_enabled: e.target.checked })} />
            Accept bookings
          </label>
          <button
            onClick={saveConfig} disabled={saving}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
        {bookingUrl && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-sunken)', borderRadius: 8, padding: '10px 14px' }}>
            <a href={bookingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bookingUrl}</a>
            <button onClick={() => { navigator.clipboard.writeText(bookingUrl); showToast('Link copied'); }}
              style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Copy</button>
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <div style={label}>Embed button (paste into any site)</div>
          <textarea readOnly rows={3} value={`<a href="${bookingUrl || 'https://your-app.com/book/your-company'}" style="display:inline-block;padding:10px 22px;background:#d97757;color:#fff;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif;font-size:14px;font-weight:600">Book a meeting</a>`}
            style={{ ...input, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11 }} />
        </div>
      </Section>

      <Section title="Branding">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={label}>Page name</div>
            <input value={form.booking_name} onChange={e => setForm({ ...form, booking_name: e.target.value })} placeholder="Your Company" style={input} />
          </div>
          <div>
            <div style={label}>Logo URL</div>
            <input value={form.booking_logo_url} onChange={e => setForm({ ...form, booking_logo_url: e.target.value })} placeholder="https://…/logo.png" style={input} />
          </div>
        </div>
        <div>
          <div style={label}>Welcome message</div>
          <textarea rows={2} value={form.booking_message} onChange={e => setForm({ ...form, booking_message: e.target.value })} placeholder="Pick a time that works for you…" style={{ ...input, resize: 'vertical' }} />
        </div>
      </Section>

      <Section title="Availability">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={label}>Timezone</div>
            <select value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} style={{ ...input, cursor: 'pointer' }}>
              {TIMEZONES.map(tz => <option key={tz}>{tz}</option>)}
            </select>
          </div>
          <div>
            <div style={label}>Slot length</div>
            <select value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) })} style={{ ...input, cursor: 'pointer' }}>
              {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
          <div>
            <div style={label}>Buffer between meetings</div>
            <select value={form.buffer} onChange={e => setForm({ ...form, buffer: Number(e.target.value) })} style={{ ...input, cursor: 'pointer' }}>
              {[0, 5, 15, 30, 60].map(d => <option key={d} value={d}>{d ? d + ' min' : 'None'}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={label}>Start</div>
            <input type="time" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} style={{ ...input, cursor: 'pointer' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={label}>End</div>
            <input type="time" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} style={{ ...input, cursor: 'pointer' }} />
          </div>
        </div>
        <div>
          <div style={{ ...label, marginBottom: 8 }}>Working days</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {DAY_LABELS.map((d, i) => (
              <button key={d} onClick={() => setForm({ ...form, days: form.days.includes(i) ? form.days.filter(x => x !== i) : [...form.days, i] })}
                style={{
                  padding: '7px 0', width: 44, borderRadius: 8, border: '1px solid',
                  borderColor: form.days.includes(i) ? 'var(--accent)' : 'var(--border)',
                  background: form.days.includes(i) ? 'var(--accent-tint)' : 'var(--bg-surface)',
                  color: form.days.includes(i) ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  transition: `background 200ms ${SPRING}, color 200ms ${SPRING}, border-color 200ms ${SPRING}`,
                }}>{d}</button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Upcoming Bookings">
        {bookings.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No upcoming bookings yet. Share your link and they'll appear here.</div>
        ) : (
          bookings.map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.guest_name}{b.guest_company ? ` · ${b.guest_company}` : ''}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                  {new Date(b.starts_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} · {b.guest_email}
                </div>
                {b.location && (
                  <a href={b.location} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>Google Meet link</a>
                )}
              </div>
              <button onClick={() => cancelBooking(b.id)}
                style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--danger)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}
