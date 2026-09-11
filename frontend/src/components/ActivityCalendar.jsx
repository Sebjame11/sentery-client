import { useMemo } from 'react';
import useStore from '../store/useStore';

function MiniActivityStrip() {
  const { prospects } = useStore();

  const weeks = useMemo(() => {
    const today = new Date();
    const data = [];
    for (let w = 11; w >= 0; w--) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() - w * 7);
      const days = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + d);
        const ds = date.toISOString().slice(0, 10);
        let count = 0;
        prospects.forEach(p => {
          p.touchpoints.forEach(t => { if (t.date === ds) count++; });
        });
        const isToday = ds === today.toISOString().slice(0, 10);
        days.push({ date: ds, count, isToday });
      }
      data.push(days);
    }
    return data;
  }, [prospects]);

  const maxCount = Math.max(...weeks.flat().map(d => d.count), 1);
  const total = weeks.flat().reduce((a, d) => a + d.count, 0);

  const getColor = (count) => {
    if (count === 0) return 'var(--border)';
    const i = count / maxCount;
    if (i > 0.6) return 'var(--accent)';
    if (i > 0.3) return 'color-mix(in srgb, var(--accent) 70%, var(--bg-surface))';
    return 'color-mix(in srgb, var(--accent) 25%, var(--bg-surface))';
  };

  return (
    <div style={{padding:'4px 0'}}>
      <div style={{display:'flex',gap:3,alignItems:'flex-end'}}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{display:'flex',flexDirection:'column',gap:2}}>
            {week.map((day, di) => (
              <div key={di} style={{
                width:12,height:12,borderRadius:3,
                background:getColor(day.count),
                border: day.isToday ? '1.5px solid var(--accent)' : '1px solid transparent',
                cursor:'default',
              }} title={`${day.date}: ${day.count} activities`} />
            ))}
          </div>
        ))}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
        <div style={{fontSize:12,color:'var(--text-primary)',fontWeight:500}}>{total} activities in last 12 weeks</div>
        <div style={{display:'flex',gap:3,alignItems:'center'}}>
          <span style={{fontSize:10,color:'var(--text-tertiary)'}}>Less</span>
          {[0,0.25,0.5,0.75,1].map(v => (
            <div key={v} style={{
              width:10,height:10,borderRadius:2,
              background: v === 0 ? 'var(--border)' : `color-mix(in srgb, var(--accent) ${v * 100}%, var(--bg-surface))`,
            }} />
          ))}
          <span style={{fontSize:10,color:'var(--text-tertiary)'}}>More</span>
        </div>
      </div>
    </div>
  );
}

export default MiniActivityStrip;
