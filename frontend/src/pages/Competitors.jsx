import { useState, useRef, useCallback } from 'react';
import NumberFlow from '@number-flow/react';
import useStore from '../store/useStore';
import { formatMoney, esc } from '../utils/helpers';
import { showToast } from '../components/Toast';
import AIButton, { AIResultModal } from '../components/AIButton';
import { enrichCompetitor, generateCompetitorBattleCard, generateCompetitiveLandscape } from '../utils/ai';

const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SPRING_SNAP = 'cubic-bezier(0.22, 1, 0.36, 1)';
const MONEY_FMT = { style:'currency', currency:'USD', notation:'compact', maximumFractionDigits:1 };

function AnimatedNumber({ value, ...props }) {
  return (
    <NumberFlow
      value={value}
      opacityTiming={{ duration: 400, easing: SPRING_SNAP }}
      transformTiming={{ duration: 500, easing: SPRING_SNAP }}
      {...props}
    />
  );
}

const THREAT_LEVELS = ['low','medium','high','critical'];
const THREAT_CONFIG = {
  low:     { label:'Low',     dot:'var(--text-tertiary)', bg:'var(--bg-sunken)' },
  medium:  { label:'Medium',  dot:'var(--accent)',        bg:'var(--accent-tint)' },
  high:    { label:'High',    dot:'var(--warning)',       bg:'var(--warning-tint)' },
  critical:{ label:'Critical',dot:'var(--danger)',        bg:'var(--danger-tint)' },
};
const CATEGORIES = ['CRM','Prospecting','Data','Automation','Analytics','Communication','Other'];

function useFluidPress(ref) {
  const pos = useRef({ x: 0, y: 0 });
  const onPointerDown = useCallback((e) => {
    if (!ref?.current) return;
    pos.current = { x: e.clientX, y: e.clientY };
    ref.current.style.transition = 'transform 100ms ease-out';
    ref.current.style.transform = 'scale(0.97)';
  }, [ref]);
  const onPointerUp = useCallback(() => {
    if (!ref?.current) return;
    ref.current.style.transition = `transform 400ms ${SPRING}`;
    ref.current.style.transform = '';
  }, [ref]);
  const onPointerLeave = useCallback(() => {
    if (!ref?.current) return;
    ref.current.style.transition = `transform 300ms ${SPRING}`;
    ref.current.style.transform = '';
  }, [ref]);
  return { onPointerDown, onPointerUp, onPointerLeave };
}

function FluidButton({ onClick, children, active, danger, size = 'sm', style: s }) {
  const ref = useRef(null);
  const fluid = useFluidPress(ref);
  const isSmall = size === 'sm';
  return (
    <button
      ref={ref}
      onClick={onClick}
      {...fluid}
      style={{
        padding: isSmall ? '5px 12px' : '8px 20px',
        borderRadius: 8,
        border: '1px solid',
        borderColor: active ? 'var(--accent)' : danger ? 'var(--danger)' : 'var(--border)',
        background: active ? 'var(--accent-tint)' : 'var(--bg-surface)',
        color: active ? 'var(--accent)' : danger ? 'var(--danger)' : 'var(--text-secondary)',
        fontSize: isSmall ? 11 : 13,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transformOrigin: 'center',
        touchAction: 'manipulation',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        ...s,
      }}
    >{children}</button>
  );
}

function IconButton({ onClick, children, danger }) {
  const ref = useRef(null);
  const fluid = useFluidPress(ref);
  return (
    <button
      ref={ref}
      onClick={onClick}
      {...fluid}
      style={{
        width: 28, height: 28, borderRadius: 7,
        border: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        color: 'var(--text-tertiary)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transformOrigin: 'center',
        touchAction: 'manipulation',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        transition: `border-color 200ms ${SPRING}, color 200ms ${SPRING}`,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = danger ? 'var(--danger)' : 'var(--border-strong)';
        e.currentTarget.style.color = danger ? 'var(--danger)' : 'var(--text-primary)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.color = 'var(--text-tertiary)';
      }}
    >{children}</button>
  );
}

function WinRateRing({ pct, size = 36 }) {
  if (pct === null || pct === undefined) return null;
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 50 ? 'var(--success)' : 'var(--danger)';
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth="2.5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{transform:'rotate(-90deg)',transformOrigin:'50% 50%',transition:`stroke-dashoffset 500ms ${SPRING_SNAP}`}} />
      </svg>
      <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
        <AnimatedNumber value={pct} suffix="%" style={{fontSize:size*0.28,fontWeight:600,color,letterSpacing:'-0.02em'}} />
      </div>
    </div>
  );
}

function StatBlock({ value, label, color, money }) {
  return (
    <div style={{textAlign:'center',padding:'12px 8px'}}>
      <div style={{fontSize:22,fontWeight:300,letterSpacing:'-0.03em',color:color||'var(--text-primary)',lineHeight:1.1}}>
        {money ? <AnimatedNumber value={value} format={MONEY_FMT} /> : <AnimatedNumber value={value} />}
      </div>
      <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:4,letterSpacing:'0.01em'}}>{label}</div>
    </div>
  );
}

function CompetitorCard({ comp, prospects, onEdit, onDelete, onAiResult, index }) {
  const ref = useRef(null);
  const lost = prospects.filter(p => p.stage === 'lost' && p.lostToCompetitor === comp.name);
  const won = prospects.filter(p => p.stage === 'won' && p.wonAgainstCompetitor === comp.name);
  const total = lost.length + won.length;
  const winRate = total ? Math.round((won.length / total) * 100) : null;
  const lostValue = lost.reduce((s, p) => s + (p.dealValue || 0), 0);
  const wonValue = won.reduce((s, p) => s + (p.dealValue || 0), 0);
  const tc = THREAT_CONFIG[comp.threat] || THREAT_CONFIG.low;

  const onPointerDown = (e) => {
    const el = ref.current;
    if (!el) return;
    el._grabY = e.clientY - el.getBoundingClientRect().top;
    el.style.transition = 'transform 120ms ease-out, box-shadow 120ms ease-out';
    el.style.transform = 'scale(0.98) translateY(0)';
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
  };
  const onPointerUp = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = `transform 400ms ${SPRING}, box-shadow 400ms ${SPRING}`;
    el.style.transform = '';
    el.style.boxShadow = '';
  };
  const onPointerLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = `transform 350ms ${SPRING}, box-shadow 350ms ${SPRING}`;
    el.style.transform = '';
    el.style.boxShadow = '';
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      style={{
        background:'var(--bg-surface)',
        border:'1px solid var(--border)',
        borderRadius:14,
        overflow:'hidden',
        transformOrigin:'center',
        touchAction:'manipulation',
        opacity:0,
        animation:`cardIn 500ms ${SPRING_SNAP} ${index * 50}ms forwards`,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      <div style={{padding:'18px 20px 14px',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
        <div style={{minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
            <span style={{fontSize:15,fontWeight:600,color:'var(--text-primary)',lineHeight:1.2,letterSpacing:'-0.01em'}}>{esc(comp.name)}</span>
            <span style={{fontSize:10,fontWeight:500,padding:'2px 8px',borderRadius:4,background:tc.bg,color:tc.dot,letterSpacing:'0.02em'}}>{tc.label}</span>
          </div>
          <div style={{fontSize:12,color:'var(--text-tertiary)',letterSpacing:'0.01em'}}>{esc(comp.category)}</div>
        </div>
        <div style={{display:'flex',gap:4,flexShrink:0}}>
          <AIButton label="AI" size="small" onResult={onAiResult} options={[{ label:'Generate Battle Card', fn:() => generateCompetitorBattleCard(comp, prospects) }]} />
          <IconButton onClick={() => onEdit(comp)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </IconButton>
          <IconButton onClick={() => onDelete(comp.name)} danger>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </IconButton>
        </div>
      </div>

      <div style={{padding:'0 20px 16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div style={{background:'var(--bg-sunken)',borderRadius:8,padding:'10px 12px'}}>
          <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--success)',marginBottom:4}}>Strength</div>
          <div style={{fontSize:12.5,lineHeight:1.55,color:'var(--text-secondary)'}}>{esc(comp.strength || '—')}</div>
        </div>
        <div style={{background:'var(--bg-sunken)',borderRadius:8,padding:'10px 12px'}}>
          <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--danger)',marginBottom:4}}>Weakness</div>
          <div style={{fontSize:12.5,lineHeight:1.55,color:'var(--text-secondary)'}}>{esc(comp.weakness || '—')}</div>
        </div>
      </div>

      {total > 0 && (
        <div style={{padding:'0 20px 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:16,padding:'12px 16px',background:'var(--bg-sunken)',borderRadius:8}}>
            <WinRateRing pct={winRate} />
            <div style={{display:'flex',gap:20,flex:1}}>
              <div>
                <div style={{fontSize:18,fontWeight:300,color:'var(--danger)',lineHeight:1,letterSpacing:'-0.02em'}}><AnimatedNumber value={lost.length} /></div>
                <div style={{fontSize:10,color:'var(--text-tertiary)',marginTop:2}}>Lost</div>
                <div style={{fontSize:10,color:'var(--text-muted)'}}><AnimatedNumber value={lostValue} format={MONEY_FMT} /></div>
              </div>
              <div>
                <div style={{fontSize:18,fontWeight:300,color:'var(--success)',lineHeight:1,letterSpacing:'-0.02em'}}><AnimatedNumber value={won.length} /></div>
                <div style={{fontSize:10,color:'var(--text-tertiary)',marginTop:2}}>Won</div>
                <div style={{fontSize:10,color:'var(--text-muted)'}}><AnimatedNumber value={wonValue} format={MONEY_FMT} /></div>
              </div>
              <div>
                <div style={{fontSize:18,fontWeight:300,lineHeight:1,letterSpacing:'-0.02em'}}><AnimatedNumber value={total} /></div>
                <div style={{fontSize:10,color:'var(--text-tertiary)',marginTop:2}}>Total</div>
                <div style={{fontSize:10,color:'var(--text-muted)'}}><AnimatedNumber value={lostValue + wonValue} format={MONEY_FMT} /></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {(comp.talkingPoints || comp.objectionResponses) && (
        <div style={{padding:'0 20px 16px',display:'flex',flexDirection:'column',gap:8}}>
          {comp.talkingPoints && (
            <div style={{background:'var(--bg-sunken)',borderRadius:8,padding:'10px 12px'}}>
              <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--accent)',marginBottom:4}}>Talking Points</div>
              <div style={{fontSize:12.5,lineHeight:1.55,color:'var(--text-secondary)',whiteSpace:'pre-wrap'}}>{esc(comp.talkingPoints)}</div>
            </div>
          )}
          {comp.objectionResponses && (
            <div style={{background:'var(--bg-sunken)',borderRadius:8,padding:'10px 12px'}}>
              <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--warning)',marginBottom:4}}>Objection Responses</div>
              <div style={{fontSize:12.5,lineHeight:1.55,color:'var(--text-secondary)',whiteSpace:'pre-wrap'}}>{esc(comp.objectionResponses)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BattleView({ competitors, selectedForBattle, setSelectedForBattle, prospects, onAiResult }) {
  const comp = competitors.find(c => c.name === selectedForBattle);
  const lost = comp ? prospects.filter(p => p.stage === 'lost' && p.lostToCompetitor === comp.name) : [];
  const won = comp ? prospects.filter(p => p.stage === 'won' && p.wonAgainstCompetitor === comp.name) : [];
  const total = lost.length + won.length;
  const winRate = total ? Math.round((won.length / total) * 100) : null;
  const lostValue = lost.reduce((s, p) => s + (p.dealValue || 0), 0);
  const wonValue = won.reduce((s, p) => s + (p.dealValue || 0), 0);
  const tc = comp ? (THREAT_CONFIG[comp.threat] || THREAT_CONFIG.low) : null;

  return (
    <div style={{animation:`fadeUp 450ms ${SPRING_SNAP} forwards`}}>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:500,color:'var(--text-tertiary)',marginBottom:6,letterSpacing:'0.03em'}}>Select Competitor</div>
        <select
          value={selectedForBattle || ''}
          onChange={e => setSelectedForBattle(e.target.value)}
            style={{width:'100%',maxWidth:360,padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-primary)',fontSize:13,fontFamily:'inherit',outline:'none',cursor:'pointer',transition:`border-color 200ms ${SPRING}`}}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        >
          <option value="">Choose a competitor...</option>
          {competitors.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      </div>

      {comp ? (
        <div key={comp.name} style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden',animation:`fadeUp 500ms ${SPRING_SNAP} forwards`}}>
          <div style={{padding:'20px 24px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                <span style={{fontSize:17,fontWeight:600,letterSpacing:'-0.01em'}}>{esc(comp.name)}</span>
                <span style={{fontSize:10,fontWeight:500,padding:'2px 8px',borderRadius:4,background:tc.bg,color:tc.dot}}>{tc.label}</span>
              </div>
              <div style={{fontSize:12,color:'var(--text-tertiary)'}}>{esc(comp.category)}</div>
            </div>
            <AIButton label="Generate Battle Card" size="small" onResult={onAiResult} options={[{ label:'Generate Battle Card', fn:() => generateCompetitorBattleCard(comp, prospects) }]} />
          </div>

          <div style={{padding:'20px 24px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{background:'var(--bg-sunken)',borderRadius:8,padding:'12px 16px'}}>
              <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--success)',marginBottom:4}}>Strengths</div>
              <div style={{fontSize:13,lineHeight:1.6,color:'var(--text-secondary)'}}>{esc(comp.strength || 'None listed')}</div>
            </div>
            <div style={{background:'var(--bg-sunken)',borderRadius:8,padding:'12px 16px'}}>
              <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--danger)',marginBottom:4}}>Weaknesses</div>
              <div style={{fontSize:13,lineHeight:1.6,color:'var(--text-secondary)'}}>{esc(comp.weakness || 'None listed')}</div>
            </div>
          </div>

          {total > 0 && (
            <div style={{padding:'0 24px 24px'}}>
              <div style={{display:'flex',alignItems:'center',gap:24,padding:'16px 20px',background:'var(--bg-sunken)',borderRadius:8}}>
                <WinRateRing pct={winRate} size={48} />
                <div style={{display:'flex',gap:32,flex:1}}>
                  <StatBlock value={lost.length} label="Lost To" color="var(--danger)" />
                  <StatBlock value={won.length} label="Won Against" color="var(--success)" />
                  <StatBlock value={total} label="Total Battles" />
                  <StatBlock value={lostValue} label="Lost Value" color="var(--danger)" money />
                  <StatBlock value={wonValue} label="Won Value" color="var(--success)" money />
                </div>
              </div>
            </div>
          )}

          {comp.talkingPoints && (
            <div style={{padding:'0 24px 16px'}}>
              <div style={{background:'var(--bg-sunken)',borderRadius:8,padding:'12px 16px'}}>
                <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--accent)',marginBottom:4}}>Our Talking Points</div>
                <div style={{fontSize:13,lineHeight:1.6,color:'var(--text-secondary)',whiteSpace:'pre-wrap'}}>{esc(comp.talkingPoints)}</div>
              </div>
            </div>
          )}

          {comp.objectionResponses && (
            <div style={{padding:'0 24px 24px'}}>
              <div style={{background:'var(--bg-sunken)',borderRadius:8,padding:'12px 16px'}}>
                <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--warning)',marginBottom:4}}>Objection Responses</div>
                <div style={{fontSize:13,lineHeight:1.6,color:'var(--text-secondary)',whiteSpace:'pre-wrap'}}>{esc(comp.objectionResponses)}</div>
              </div>
            </div>
          )}

          {lost.length > 0 && (
            <div style={{padding:'0 24px 24px'}}>
              <div style={{fontSize:11,fontWeight:500,color:'var(--text-tertiary)',marginBottom:8,letterSpacing:'0.03em'}}>Recent Lost Deals</div>
              {lost.slice(0, 4).map((p, i) => (
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:i===0?'none':'1px solid var(--border)',fontSize:12.5}}>
                  <span style={{color:'var(--text-secondary)'}}>{esc(p.company)}</span>
                  <span style={{color:'var(--text-tertiary)',fontWeight:500}}>{formatMoney(p.dealValue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:14,padding:'48px 24px',textAlign:'center'}}>
          <div style={{fontSize:13,color:'var(--text-tertiary)'}}>Select a competitor to view the battle card</div>
        </div>
      )}
    </div>
  );
}

function MatrixView({ competitors, prospects }) {
  return (
    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden',animation:`fadeUp 450ms ${SPRING_SNAP} forwards`}}>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
          <thead>
            <tr style={{borderBottom:'1px solid var(--border)'}}>
              {['Competitor','Category','Threat','Lost','Won','Win Rate','Lost $','Won $','Net'].map(h => (
                <th key={h} style={{padding:'10px 16px',textAlign:'left',fontWeight:500,color:'var(--text-tertiary)',fontSize:11,whiteSpace:'nowrap',letterSpacing:'0.03em'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {competitors.map((comp, i) => {
              const lost = prospects.filter(p => p.stage === 'lost' && p.lostToCompetitor === comp.name);
              const won = prospects.filter(p => p.stage === 'won' && p.wonAgainstCompetitor === comp.name);
              const total = lost.length + won.length;
              const wr = total ? Math.round((won.length / total) * 100) : null;
              const lv = lost.reduce((s, p) => s + (p.dealValue || 0), 0);
              const wv = won.reduce((s, p) => s + (p.dealValue || 0), 0);
              const net = wv - lv;
              const tc = THREAT_CONFIG[comp.threat] || THREAT_CONFIG.low;
              return (
                <tr key={comp.name} style={{borderBottom:'1px solid var(--border)',opacity:0,animation:`fadeUp 350ms ${SPRING_SNAP} ${i * 30}ms forwards`,transition:'background 150ms ease'}}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-sunken)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{padding:'10px 16px',fontWeight:500,letterSpacing:'-0.01em'}}>{esc(comp.name)}</td>
                  <td style={{padding:'10px 16px',color:'var(--text-secondary)'}}>{esc(comp.category)}</td>
                  <td style={{padding:'10px 16px'}}><span style={{fontSize:10,fontWeight:500,padding:'2px 8px',borderRadius:4,background:tc.bg,color:tc.dot}}>{tc.label}</span></td>
                  <td style={{padding:'10px 16px',color:lost.length ? 'var(--danger)' : 'var(--text-muted)'}}>{lost.length ? <AnimatedNumber value={lost.length} /> : '—'}</td>
                  <td style={{padding:'10px 16px',color:won.length ? 'var(--success)' : 'var(--text-muted)'}}>{won.length ? <AnimatedNumber value={won.length} /> : '—'}</td>
                  <td style={{padding:'10px 16px'}}>
                    {wr !== null ? (
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div style={{width:40,height:4,borderRadius:2,background:'var(--border)',overflow:'hidden'}}>
                          <div style={{width:`${wr}%`,height:'100%',borderRadius:2,background:wr>=50?'var(--success)':'var(--danger)'}} />
                        </div>
                        <span style={{fontWeight:600,fontSize:11,color:wr>=50?'var(--success)':'var(--danger)',letterSpacing:'-0.01em'}}><AnimatedNumber value={wr} suffix="%" /></span>
                      </div>
                    ) : <span style={{color:'var(--text-muted)'}}>—</span>}
                  </td>
                  <td style={{padding:'10px 16px',color:'var(--text-tertiary)'}}><AnimatedNumber value={lv} format={MONEY_FMT} /></td>
                  <td style={{padding:'10px 16px',color:'var(--text-tertiary)'}}><AnimatedNumber value={wv} format={MONEY_FMT} /></td>
                  <td style={{padding:'10px 16px',fontWeight:600,color:net>=0?'var(--success)':'var(--danger)',letterSpacing:'-0.01em'}}><AnimatedNumber value={net} prefix={net>=0?'+':''} format={MONEY_FMT} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InsightsView({ competitors, prospects, onAiResult }) {
  const highThreats = competitors.filter(c => c.threat === 'high' || c.threat === 'critical');
  const withBattles = competitors.filter(c => {
    const l = prospects.filter(p => p.stage === 'lost' && p.lostToCompetitor === c.name).length;
    const w = prospects.filter(p => p.stage === 'won' && p.wonAgainstCompetitor === c.name).length;
    return l + w > 0;
  });

  return (
    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden',animation:`fadeUp 450ms ${SPRING_SNAP} forwards`}}>
      <div style={{padding:'20px 24px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:15,fontWeight:600,color:'var(--text-primary)',marginBottom:2,letterSpacing:'-0.01em'}}>Competitive Landscape</div>
          <div style={{fontSize:12,color:'var(--text-tertiary)'}}>AI-powered analysis based on tracked competitors and deal data.</div>
        </div>
        {competitors.length > 0 && (
          <AIButton label="Generate Insights" size="small" onResult={onAiResult} options={[{ label:'Full Landscape Analysis', fn:() => generateCompetitiveLandscape(competitors, prospects) }]} />
        )}
      </div>

      {competitors.length > 0 ? (
        <div style={{padding:'20px 24px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div style={{background:'var(--bg-sunken)',borderRadius:8,padding:'16px'}}>
            <div style={{fontSize:11,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--text-tertiary)',marginBottom:10}}>Top Threats</div>
            {highThreats.length > 0 ? highThreats.slice(0, 5).map((c, i) => {
              const tc = THREAT_CONFIG[c.threat];
              return (
                <div key={c.name} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',opacity:0,animation:`fadeUp 300ms ${SPRING_SNAP} ${i * 40}ms forwards`}}>
                  <span style={{fontSize:13,fontWeight:500,letterSpacing:'-0.01em'}}>{esc(c.name)}</span>
                  <span style={{fontSize:10,fontWeight:500,padding:'2px 8px',borderRadius:4,background:tc.bg,color:tc.dot}}>{tc.label}</span>
                </div>
              );
            }) : (
              <div style={{fontSize:12.5,color:'var(--text-muted)',padding:'8px 0'}}>No high-threat competitors</div>
            )}
          </div>

          <div style={{background:'var(--bg-sunken)',borderRadius:8,padding:'16px'}}>
            <div style={{fontSize:11,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--text-tertiary)',marginBottom:10}}>Head-to-Head</div>
            {withBattles.length > 0 ? withBattles.slice(0, 5).map((c, i) => {
              const lost = prospects.filter(p => p.stage === 'lost' && p.lostToCompetitor === c.name).length;
              const won = prospects.filter(p => p.stage === 'won' && p.wonAgainstCompetitor === c.name).length;
              const total = lost + won;
              const wr = Math.round((won / total) * 100);
              return (
                <div key={c.name} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',opacity:0,animation:`fadeUp 300ms ${SPRING_SNAP} ${i * 40}ms forwards`}}>
                  <span style={{fontSize:13,fontWeight:500,letterSpacing:'-0.01em'}}>{esc(c.name)}</span>
                  <span style={{fontSize:12,fontWeight:600,color:wr>=50?'var(--success)':'var(--danger)',letterSpacing:'-0.01em'}}><AnimatedNumber value={won} suffix="W" /> / <AnimatedNumber value={lost} suffix="L" /> (<AnimatedNumber value={wr} suffix="%" />)</span>
                </div>
              );
            }) : (
              <div style={{fontSize:12.5,color:'var(--text-muted)',padding:'8px 0'}}>No head-to-head data yet</div>
            )}
          </div>
        </div>
      ) : (
        <div style={{padding:'32px 24px',textAlign:'center'}}>
          <div style={{fontSize:13,color:'var(--text-tertiary)'}}>Add competitors to see insights</div>
        </div>
      )}
    </div>
  );
}

function CompetitorForm({ editing, form, setForm, onSave, onCancel, onEnrich, loadingEnrich }) {
  const inputStyle = {
    width:'100%',padding:'8px 12px',borderRadius:8,
    border:'1px solid var(--border)',
    background:'var(--bg-sunken)',color:'var(--text-primary)',
    fontSize:13,fontFamily:'inherit',outline:'none',boxSizing:'border-box',
    transition:`border-color 200ms ${SPRING}, box-shadow 200ms ${SPRING}`,
  };
  const focusStyle = { borderColor:'var(--accent)', boxShadow:'0 0 0 3px rgba(217,119,87,0.08)' };
  const blurStyle = { borderColor:'var(--border)', boxShadow:'none' };

  const saveRef = useRef(null);
  const saveFluid = useFluidPress(saveRef);

  return (
    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden'}}>
      <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{fontSize:15,fontWeight:600,letterSpacing:'-0.01em'}}>{editing ? 'Edit Competitor' : 'Add Competitor'}</div>
        <div style={{display:'flex',gap:6}}>
          <FluidButton onClick={onEnrich} active={false} style={{opacity:(!form.name.trim() || loadingEnrich) ? 0.5 : 1,cursor:loadingEnrich ? 'default' : 'pointer',display:'flex',alignItems:'center',gap:4}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="10" height="10"><path d="M12 2a5 5 0 0 1 5 5c0 1.5-.7 2.8-1.8 3.7L12 12l-3.2-1.3A5 5 0 0 1 12 2z"/><circle cx="12" cy="7" r="1"/><path d="M8 21l1-4m6 4l-1-4m-5 0h8"/></svg>
            {loadingEnrich ? 'Thinking...' : 'Enrich'}
          </FluidButton>
          {editing && <FluidButton onClick={onCancel}>Cancel</FluidButton>}
        </div>
      </div>

      <div style={{padding:'20px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
          <div>
            <div style={{fontSize:11,fontWeight:500,color:'var(--text-tertiary)',marginBottom:4,letterSpacing:'0.03em'}}>Name</div>
            <input value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder="Competitor name"
              style={inputStyle}
              onFocus={e => Object.assign(e.target.style, focusStyle)}
              onBlur={e => Object.assign(e.target.style, blurStyle)} />
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:500,color:'var(--text-tertiary)',marginBottom:4,letterSpacing:'0.03em'}}>Category</div>
            <select value={form.category} onChange={e => setForm({...form, category:e.target.value})}
              style={{...inputStyle, cursor:'pointer'}}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:500,color:'var(--text-tertiary)',marginBottom:4,letterSpacing:'0.03em'}}>Threat Level</div>
            <select value={form.threat} onChange={e => setForm({...form, threat:e.target.value})}
              style={{...inputStyle, cursor:'pointer'}}>
              {THREAT_LEVELS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
          <div>
            <div style={{fontSize:11,fontWeight:500,color:'var(--text-tertiary)',marginBottom:4,letterSpacing:'0.03em'}}>Strengths</div>
            <input value={form.strength} onChange={e => setForm({...form, strength:e.target.value})} placeholder="What they do well"
              style={inputStyle}
              onFocus={e => Object.assign(e.target.style, focusStyle)}
              onBlur={e => Object.assign(e.target.style, blurStyle)} />
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:500,color:'var(--text-tertiary)',marginBottom:4,letterSpacing:'0.03em'}}>Weaknesses</div>
            <input value={form.weakness} onChange={e => setForm({...form, weakness:e.target.value})} placeholder="Where they fall short"
              style={inputStyle}
              onFocus={e => Object.assign(e.target.style, focusStyle)}
              onBlur={e => Object.assign(e.target.style, blurStyle)} />
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:500,color:'var(--text-tertiary)',marginBottom:4,letterSpacing:'0.03em'}}>Notes</div>
            <input value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} placeholder="Additional intel"
              style={inputStyle}
              onFocus={e => Object.assign(e.target.style, focusStyle)}
              onBlur={e => Object.assign(e.target.style, blurStyle)} />
          </div>
        </div>

        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:500,color:'var(--text-tertiary)',marginBottom:4,letterSpacing:'0.03em'}}>Our Talking Points vs Them</div>
          <textarea value={form.talkingPoints} onChange={e => setForm({...form, talkingPoints:e.target.value})} placeholder="How we position against this competitor" rows={2}
            style={{...inputStyle, resize:'vertical'}}
            onFocus={e => Object.assign(e.target.style, focusStyle)}
            onBlur={e => Object.assign(e.target.style, blurStyle)} />
        </div>

        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:500,color:'var(--text-tertiary)',marginBottom:4,letterSpacing:'0.03em'}}>Objection Responses</div>
          <textarea value={form.objectionResponses} onChange={e => setForm({...form, objectionResponses:e.target.value})} placeholder="How to respond when prospect says this competitor is better" rows={2}
            style={{...inputStyle, resize:'vertical'}}
            onFocus={e => Object.assign(e.target.style, focusStyle)}
            onBlur={e => Object.assign(e.target.style, blurStyle)} />
        </div>

        <button
          ref={saveRef}
          onClick={onSave}
          {...saveFluid}
          style={{
            padding:'8px 20px',borderRadius:8,border:'none',
            background:'var(--accent)',color:'#fff',
            fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'inherit',
            transformOrigin:'center',
            touchAction:'manipulation',
            userSelect:'none',
            WebkitTapHighlightColor:'transparent',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-hover)'}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)'; }}
        >{editing ? 'Update' : 'Add'} Competitor</button>
      </div>
    </div>
  );
}

export default function Competitors() {
  const prospects = useStore(s => s.prospects);
  const updateProspect = useStore(s => s.updateProspect);
  const [competitors, setCompetitors] = useState(() => { try { return JSON.parse(localStorage.getItem('vn_competitors'))||[]; } catch { return []; } });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:'', category:'CRM', threat:'medium', strength:'', weakness:'', notes:'', talkingPoints:'', objectionResponses:'' });
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('cards');
  const [selectedForBattle, setSelectedForBattle] = useState(null);
  const [loadingEnrich, setLoadingEnrich] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiTitle, setAiTitle] = useState('');

  const save = (list) => { setCompetitors(list); localStorage.setItem('vn_competitors', JSON.stringify(list)); };
  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editing) {
      save(competitors.map(c => c.name === editing ? {...form} : c));
      showToast('Competitor updated');
    } else {
      save([...competitors, {...form}]);
      showToast('Competitor added');
    }
    setForm({ name:'', category:'CRM', threat:'medium', strength:'', weakness:'', notes:'', talkingPoints:'', objectionResponses:'' });
    setEditing(null);
  };
  const handleDelete = (name) => { save(competitors.filter(c => c.name !== name)); showToast('Competitor removed'); };
  const handleEdit = (comp) => { setEditing(comp.name); setForm({...comp}); };
  const handleAiResult = (result, title) => { setAiResult(result); setAiTitle(title); };

  const handleEnrich = async () => {
    if (!form.name.trim()) return;
    setLoadingEnrich(true);
    try {
      const r = await enrichCompetitor(form.name);
      try {
        const data = JSON.parse(r);
        setForm(prev => ({
          ...prev,
          category: CATEGORIES.includes(data.category) ? data.category : prev.category,
          threat: THREAT_LEVELS.includes(data.threat) ? data.threat : prev.threat,
          strength: data.strength || prev.strength,
          weakness: data.weakness || prev.weakness,
          notes: data.notes || prev.notes,
        }));
        showToast('Competitor enriched');
      } catch {
        setAiResult(r);
        setAiTitle('Enrichment Results');
      }
    } catch (err) {
      showToast(err.message);
    } finally {
      setLoadingEnrich(false);
    }
  };

  const categories = ['all', ...new Set(competitors.map(c => c.category))];
  const filtered = filter === 'all' ? competitors : competitors.filter(c => c.category === filter);
  const lostDeals = {};
  prospects.filter(p => p.stage === 'lost' && p.lostToCompetitor).forEach(p => { lostDeals[p.lostToCompetitor] = (lostDeals[p.lostToCompetitor]||0)+1; });
  const wonDeals = {};
  prospects.filter(p => p.stage === 'won' && p.wonAgainstCompetitor).forEach(p => { wonDeals[p.wonAgainstCompetitor] = (wonDeals[p.wonAgainstCompetitor]||0)+1; });
  const totalLostValue = prospects.filter(p => p.stage === 'lost' && p.lostToCompetitor).reduce((s, p) => s + (p.dealValue||0), 0);
  const totalWonValue = prospects.filter(p => p.stage === 'won' && p.wonAgainstCompetitor).reduce((s, p) => s + (p.dealValue||0), 0);

  return (
    <>
      <style>{`
        @keyframes cardIn { from { opacity:0; transform:translateY(12px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0ms !important; transition-duration: 0ms !important; }
        }
      `}</style>
      <div style={{maxWidth:1100,margin:'0 auto',padding:'32px 24px'}}>
        <div style={{marginBottom:28,opacity:0,animation:`fadeUp 500ms ${SPRING_SNAP} 50ms forwards`}}>
          <h1 style={{fontSize:22,fontWeight:600,color:'var(--text-primary)',margin:'0 0 4px',letterSpacing:'-0.02em'}}>Competitor Intelligence</h1>
          <p style={{fontSize:13,color:'var(--text-tertiary)',margin:0,letterSpacing:'0.01em'}}>Track competitors, analyze win/loss data, and sharpen your positioning.</p>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:1,background:'var(--border)',borderRadius:14,overflow:'hidden',marginBottom:24}}>
          {[
            { value: competitors.length, label:'Tracked' },
            { value: Object.keys(lostDeals).length, label:'Lost To', color:'var(--danger)' },
            { value: Object.keys(wonDeals).length, label:'Won Against', color:'var(--success)' },
            { value: totalLostValue, label:'Lost Value', color:'var(--danger)', money:true },
            { value: totalWonValue, label:'Won Value', color:'var(--success)', money:true },
          ].map((s, i) => (
            <div key={i} style={{background:'var(--bg-surface)',padding:'14px 12px',textAlign:'center',opacity:0,animation:`fadeUp 400ms ${SPRING_SNAP} ${80 + i * 50}ms forwards`}}>
              <div style={{fontSize:20,fontWeight:300,letterSpacing:'-0.03em',color:s.color||'var(--text-primary)',lineHeight:1.1}}>
                {s.money ? <AnimatedNumber value={s.value} format={MONEY_FMT} /> : <AnimatedNumber value={s.value} />}
              </div>
              <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:3,letterSpacing:'0.03em'}}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:10,opacity:0,animation:`fadeUp 450ms ${SPRING_SNAP} 200ms forwards`}}>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {categories.map(c => (
              <FluidButton key={c} active={filter===c} onClick={() => setFilter(c)}>
                {c === 'all' ? 'All' : c}
              </FluidButton>
            ))}
          </div>
          <div style={{display:'flex',gap:4}}>
            {[['cards','Cards'],['matrix','Matrix'],['battle','Battle'],['insights','Insights']].map(([k,l]) => (
              <FluidButton key={k} active={view===k} onClick={() => setView(k)}>
                {l}
              </FluidButton>
            ))}
          </div>
        </div>

        {view === 'cards' && (
          filtered.length === 0 ? (
            <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:14,padding:'48px 24px',textAlign:'center',opacity:0,animation:`fadeUp 500ms ${SPRING_SNAP} 300ms forwards`}}>
              <div style={{fontSize:13,color:'var(--text-tertiary)',marginBottom:4}}>No competitors yet</div>
              <div style={{fontSize:12,color:'var(--text-muted)'}}>Add your first competitor below to start tracking.</div>
            </div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))',gap:12,marginBottom:20}}>
              {filtered.map((comp, i) => (
                <CompetitorCard key={comp.name} comp={comp} prospects={prospects} onEdit={handleEdit} onDelete={handleDelete} onAiResult={handleAiResult} index={i} />
              ))}
            </div>
          )
        )}

        {view === 'matrix' && <MatrixView competitors={competitors} prospects={prospects} />}
        {view === 'battle' && <BattleView competitors={competitors} selectedForBattle={selectedForBattle} setSelectedForBattle={setSelectedForBattle} prospects={prospects} onAiResult={handleAiResult} />}
        {view === 'insights' && <InsightsView competitors={competitors} prospects={prospects} onAiResult={handleAiResult} />}

        <div style={{marginTop:20,opacity:0,animation:`fadeUp 450ms ${SPRING_SNAP} 400ms forwards`}}>
          <CompetitorForm editing={editing} form={form} setForm={setForm} onSave={handleSave} onCancel={() => { setEditing(null); setForm({ name:'', category:'CRM', threat:'medium', strength:'', weakness:'', notes:'', talkingPoints:'', objectionResponses:'' }); }} onEnrich={handleEnrich} loadingEnrich={loadingEnrich} />
        </div>

        {prospects.filter(p => p.stage === 'lost' && !p.lostToCompetitor).length > 0 && (
          <div style={{marginTop:20,background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden',opacity:0,animation:`fadeUp 450ms ${SPRING_SNAP} 450ms forwards`}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:'var(--warning)',flexShrink:0}} />
              <span style={{fontSize:13,fontWeight:500}}>Unattributed Losses</span>
              <span style={{fontSize:11,color:'var(--text-tertiary)',marginLeft:4}}>
                {prospects.filter(p => p.stage === 'lost' && !p.lostToCompetitor).length} deals without a competitor
              </span>
            </div>
            <div style={{padding:'0 20px'}}>
              {prospects.filter(p => p.stage === 'lost' && !p.lostToCompetitor).slice(0, 5).map(p => (
                <div key={p.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)',fontSize:12.5}}>
                  <div>
                    <span style={{color:'var(--text-secondary)'}}>{esc(p.company)}</span>
                    <span style={{color:'var(--text-muted)',marginLeft:8}}>{formatMoney(p.dealValue)}</span>
                  </div>
                  <select
                    value=""
                    onChange={e => { if (e.target.value) { updateProspect(p.id, { lostToCompetitor:e.target.value }); showToast(`Assigned ${e.target.value}`); } }}
                    style={{padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-secondary)',fontSize:11,fontFamily:'inherit',outline:'none',cursor:'pointer',minWidth:140,transition:`border-color 200ms ${SPRING}`}}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  >
                    <option value="">Assign competitor...</option>
                    {competitors.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        <AIResultModal title={aiTitle} content={aiResult} onClose={() => setAiResult(null)} />
      </div>
    </>
  );
}
