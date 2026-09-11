import { useState, useEffect } from 'react';
import { api, downloadICS } from '../utils/meetings';

const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SPRING_SNAP = 'cubic-bezier(0.22, 1, 0.36, 1)';

const input = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-sunken)', color: 'var(--text-primary)', fontSize: 13.5,
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  transition: `border-color 200ms ${SPRING}`,
};

export default function BookingPage({ slug }) {
  const [config, setConfig] = useState(null);
  const [days, setDays] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [guest, setGuest] = useState({ name: '', email: '', company: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(null);

  const guestTz = new Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api(`/meetings/config?slug=${encodeURIComponent(slug)}`);
        setConfig(cfg.data);
        if (!cfg.data.enabled || !cfg.data.connected) { setLoading(false); return; }
        const slots = await api(`/meetings/slots?slug=${encodeURIComponent(slug)}&days=14`);
        setDays(slots.data || []);
        if (slots.data?.length) setSelectedDate(slots.data[0].date);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const selectedDay = days.find(d => d.date === selectedDate) || null;

  const submit = async () => {
    if (!selectedSlot) { setError('Pick a time first'); return; }
    if (!guest.name.trim()) { setError('Your name is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email)) { setError('Enter a valid email'); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await api('/meetings/book', {
        method: 'POST',
        body: {
          slug,
          start: selectedSlot.start,
          end: selectedSlot.end,
          guest_name: guest.name.trim(),
          guest_email: guest.email.trim(),
          guest_company: guest.company.trim(),
          guest_notes: guest.notes.trim(),
          guest_timezone: guestTz,
        },
      });
      setBooked({ ...res.data, title: `${config.name} Meeting` });
    } catch (err) {
      setError(err.message);
      if (err.message.includes('no longer available')) {
        const slots = await api(`/meetings/slots?slug=${encodeURIComponent(slug)}&days=14`);
        setDays(slots.data || []);
        setSelectedSlot(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-canvas)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', animation: `fadeUp 400ms ${SPRING_SNAP} forwards` }}>Loading…</div>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-canvas)' }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '40px 48px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>Page not found</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>This booking link doesn't exist.</div>
        </div>
      </div>
    );
  }

  if (config && (!config.enabled || !config.connected)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-canvas)' }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '40px 48px', textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>Booking isn't ready yet</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>This link isn't accepting bookings right now.</div>
        </div>
      </div>
    );
  }

  if (booked) {
    const start = new Date(booked.starts_at);
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-canvas)', padding: 24 }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '44px 48px', textAlign: 'center', maxWidth: 420, animation: `fadeUp 500ms ${SPRING_SNAP} forwards` }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 6 }}>You're booked!</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{booked.title}</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
            {start.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>A confirmation with a calendar invite was sent to {booked.guest_email}.</div>
          {booked.location && (
            <a href={booked.location} target="_blank" rel="noreferrer"
              style={{ display: 'inline-block', marginTop: 18, padding: '9px 22px', borderRadius: 8, border: 'none', background: '#1a73e8', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', fontFamily: 'inherit' }}>
              Join Google Meet
            </a>
          )}
          <button
            onClick={() => downloadICS({ title: booked.title, start: booked.starts_at, end: booked.ends_at, description: `Meeting with ${config.name}`, name: guest.name, email: guest.email })}
            style={{ marginTop: 18, padding: '9px 22px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--accent)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
          >Add to my calendar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', padding: '48px 24px' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { * { animation-duration: 0ms !important; transition-duration: 0ms !important; } }
      `}</style>
      <div style={{ maxWidth: 560, margin: '0 auto', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', animation: `fadeUp 500ms ${SPRING_SNAP} forwards` }}>
        <div style={{ padding: '32px 32px 24px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
          {config.logo_url && <img src={config.logo_url} alt="" style={{ height: 44, marginBottom: 12, objectFit: 'contain' }} />}
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{config.name}</div>
          {config.message && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>{config.message}</div>}
        </div>

        {days.length === 0 ? (
          <div style={{ padding: '40px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>No times available</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>Check back later — new slots are released regularly.</div>
          </div>
        ) : (
          <div style={{ padding: '24px 32px 32px' }}>
            <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 10 }}>Pick a day</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 22 }}>
              {days.map(d => {
                const label = new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const active = d.date === selectedDate;
                return (
                  <button key={d.date} onClick={() => { setSelectedDate(d.date); setSelectedSlot(null); setError(''); }}
                    style={{
                      flexShrink: 0, padding: '9px 14px', borderRadius: 9, border: '1px solid',
                      borderColor: active ? 'var(--accent)' : 'var(--border)',
                      background: active ? 'var(--accent-tint)' : 'var(--bg-surface)',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                      transition: `background 200ms ${SPRING}, color 200ms ${SPRING}, border-color 200ms ${SPRING}`,
                    }}>{label}</button>
                );
              })}
            </div>

            <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 10 }}>
              {selectedDay ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 24 }}>
              {selectedDay?.slots.map(s => {
                const active = selectedSlot?.start === s.start;
                return (
                  <button key={s.start} onClick={() => { setSelectedSlot(s); setError(''); }}
                    style={{
                      padding: '9px 0', borderRadius: 9, border: '1px solid',
                      borderColor: active ? 'var(--accent)' : 'var(--border)',
                      background: active ? 'var(--accent-tint)' : 'var(--bg-surface)',
                      color: active ? 'var(--accent)' : 'var(--text-primary)',
                      fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                      transition: `background 200ms ${SPRING}, color 200ms ${SPRING}, border-color 200ms ${SPRING}`,
                    }}>
                    {new Date(s.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 10 }}>Your details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input placeholder="Full name *" value={guest.name} onChange={e => setGuest({ ...guest, name: e.target.value })} style={input} />
              <input placeholder="Work email *" value={guest.email} onChange={e => setGuest({ ...guest, email: e.target.value })} style={input} />
              <input placeholder="Company (optional)" value={guest.company} onChange={e => setGuest({ ...guest, company: e.target.value })} style={input} />
              <textarea placeholder="Anything to prepare? (optional)" rows={2} value={guest.notes} onChange={e => setGuest({ ...guest, notes: e.target.value })} style={{ ...input, resize: 'vertical' }} />
              {error && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
              <button
                onClick={submit} disabled={submitting}
                style={{
                  marginTop: 4, padding: '11px 0', borderRadius: 9, border: 'none',
                  background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600,
                  cursor: submitting ? 'default' : 'pointer', fontFamily: 'inherit',
                  opacity: submitting ? 0.6 : 1,
                }}
              >{submitting ? 'Booking…' : selectedSlot ? `Confirm ${new Date(selectedSlot.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Confirm'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
