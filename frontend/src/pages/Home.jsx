import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useStore from '../store/useStore';
import senteryLogo from '../assets/sentery-logo.svg';
import senterySymbol from '../assets/sentery-symbol.svg';
import { SenterySymbol, SenteryWordmark } from '../components/SenteryLogo';
import { esc, timeAgo } from '../utils/helpers';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, useInView } from 'framer-motion';

const TERMINAL_LINES = [
    { prompt:'>', text:' Sarah Chen moved to Engaged', cls:'t-ok', extra:' +$120K' },
    { prompt:'>', text:' New lead: Maria Santos (Nubank)', cls:'', extra:'' },
    { prompt:'>', text:' Akira Tanaka replied to cold email', cls:'t-ok', extra:'' },
    { prompt:'>', text:' David Kim signed contract', cls:'t-ok', extra:' +$150K' },
    { prompt:'>', text:' James Rodriguez - follow-up sent', cls:'', extra:'' },
    { prompt:'>', text:' Emma Wilson closed Won!', cls:'t-ok', extra:' +$340K' },
    { prompt:'>', text:' Priya Sharma touched via Email', cls:'', extra:'' },
    { prompt:'>', text:' Pipeline value: $1.09M', cls:'t-dim', extra:'' },
    { prompt:'>', text:' New lead: Alex Petrov (Vercel)', cls:'', extra:'' },
    { prompt:'>', text:' Reminder: 3 follow-ups overdue', cls:'t-warn', extra:'' },
];

const AI_CHAT_SCRIPT = [
    { role:'user', text:'log a call with Sarah Chen, moved to engaged' },
    { role:'bot', text:'Logged. Updated Sarah Chen → Engaged, weighted pipeline +$108K.' },
    { role:'user', text:'follow up with her Thursday morning' },
    { role:'bot', text:'Scheduled. Reminder set for Thu 9:00am. I\'ll draft the email.' },
];

const PARTICLES = [
    { x:10, y:20, size:4, dur:14, delay:0 },
    { x:25, y:70, size:3, dur:11, delay:2 },
    { x:60, y:30, size:5, dur:16, delay:1 },
    { x:80, y:80, size:3, dur:12, delay:3 },
    { x:45, y:55, size:4, dur:15, delay:0.5 },
    { x:90, y:15, size:3, dur:13, delay:4 },
    { x:15, y:85, size:4, dur:17, delay:2.5 },
    { x:70, y:60, size:3, dur:10, delay:1.5 },
    { x:35, y:40, size:5, dur:18, delay:3.5 },
    { x:55, y:90, size:3, dur:14, delay:0.8 },
];

export default function Home() {
    const { theme, setTheme, prospects, setPage } = useStore();
    const [termLines, setTermLines] = useState([]);
    const [termIdx, setTermIdx] = useState(0);
    const [filledVars, setFilledVars] = useState({});
    const terminalBodyRef = useRef(null);
    const termIdxRef = useRef(0);
    const stackWrapRef = useRef(null);
    const heroRef = useRef(null);

    const typeTerminal = useCallback(() => {
        const line = TERMINAL_LINES[termIdxRef.current % TERMINAL_LINES.length];
        setTermLines(prev => {
            const next = [...prev, { ...line, id: Date.now() }];
            return next.length > 8 ? next.slice(-8) : next;
        });
        termIdxRef.current++;
    }, []);

    useEffect(() => {
        const timer = setInterval(typeTerminal, 2200 + Math.random() * 1800);
        return () => clearInterval(timer);
    }, [typeTerminal]);

    useEffect(() => {
        if (terminalBodyRef.current) {
            terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
        }
    }, [termLines]);

    const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
    const handleSignIn = () => setPage('signin');

    const events = useMemo(() => {
        const out = [];
        prospects.forEach(p => {
            if (p.createdAt) out.push({ type:'add', text:<><strong>{p.name}</strong> added to pipeline{p.company ? <> from <strong>{p.company}</strong></> : ''}</>, time:p.createdAt, dot:'add' });
            if (p.lastTouch) out.push({ type:'outreach', text:<><strong>{p.name}</strong> touched via {p.lastChannel || 'outreach'}</>, time:p.lastTouch, dot:'outreach' });
            if (p.replied) out.push({ type:'reply', text:<><strong>{p.name}</strong> replied</>, time:p.lastTouch || p.createdAt, dot:'reply' });
        });
        out.sort((a, b) => new Date(b.time) - new Date(a.time));
        return out.slice(0, 5);
    }, [prospects]);

    // Parallax on hero card stack
    const mx = useMotionValue(0);
    const my = useMotionValue(0);
    const sx = useSpring(mx, { stiffness:60, damping:18 });
    const sy = useSpring(my, { stiffness:60, damping:18 });
    const backX = useTransform(sx, [-200, 200], [8, -8]);
    const backY = useTransform(sy, [-200, 200], [6, -6]);
    const midX = useTransform(sx, [-200, 200], [-10, 10]);
    const midY = useTransform(sy, [-200, 200], [-8, 8]);

    const onStackMouseMove = (e) => {
        const r = stackWrapRef.current?.getBoundingClientRect();
        if (!r) return;
        mx.set(e.clientX - (r.left + r.width / 2));
        my.set(e.clientY - (r.top + r.height / 2));
    };
    const onStackMouseLeave = () => { mx.set(0); my.set(0); };

    // Smooth scroll to features
    const scrollToFeatures = () => {
        const el = document.getElementById('features');
        if (el) {
            const top = el.getBoundingClientRect().top + window.scrollY - 100;
            window.scrollTo({ top, behavior:'smooth' });
        }
    };

    return (
        <div>
            <FloatingParticles />
            <nav className="home-nav">
                <div className="home-nav-inner">
                    <div className="home-logo" onClick={() => window.scrollTo({top:0, behavior:'smooth'})} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
                        <SenterySymbol size={32} />
                        <SenteryWordmark height={26} />
                    </div>
                    <div className="home-nav-links">
                        <a className="active" onClick={() => window.scrollTo({top:0, behavior:'smooth'})}>Home</a>
                        <a onClick={scrollToFeatures}>Features</a>
                        <a onClick={handleSignIn}>Sign In</a>
                        <a className="icon-btn" onClick={toggleTheme}>
                            {theme === 'dark' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
                            {theme === 'dark' ? 'Light' : 'Dark'}
                        </a>
                    </div>
                </div>
            </nav>

            <section className="home-hero">
                <motion.div className="home-hero-left"
                    initial={{ opacity:0, y:20 }}
                    animate={{ opacity:1, y:0 }}
                    transition={{ duration:0.6, ease:[0.22,1,0.36,1] }}>
                    <div className="home-hero-eyebrow">
                        <span className="home-hero-eyebrow-dot"></span>
                        Sentery · Sales Intelligence Platform
                    </div>
                    <h1>World's first <em>agentic</em><br/>and AI-native<br/>sales CRM.</h1>
                    <p className="home-hero-desc">Track every lead, craft every message, close every deal. 60 MCP tools, AI assistant, email sync, and pipeline analytics. End-to-end encrypted by default.</p>
                    <div className="home-hero-btns">
                        <button className="btn-hero btn-hero-primary" onClick={handleSignIn}>
                            Get Started
                            <span className="arrow-nudge">→</span>
                        </button>
                        <button className="btn-hero btn-hero-secondary" onClick={scrollToFeatures}>Explore Features</button>
                    </div>
                    <div className="home-hero-trust">
                        <span className="home-trust-pill">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            Free until Oct 1, 2026
                        </span>
                        <span className="home-trust-pill">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                            No credit card
                        </span>
                        <span className="home-trust-pill">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                            MCP-native
                        </span>
                    </div>
                </motion.div>

                <motion.div className="home-hero-right"
                    ref={stackWrapRef}
                    onMouseMove={onStackMouseMove}
                    onMouseLeave={onStackMouseLeave}
                    initial={{ opacity:0 }}
                    animate={{ opacity:1 }}
                    transition={{ duration:0.8, delay:0.2 }}>
                    <div className="hero-grid-pattern"></div>
                    <div className="hero-stack-glow"></div>
                    <div className="hero-stack-glow-2"></div>
                    <div className="hero-stack-glow-3"></div>
                    <div className="hero-stack">
                        <motion.div className="hero-stack-card hero-stack-back"
                            style={{ x:backX, y:backY }}
                            initial={{ opacity:0, x:-40, rotate:-10 }}
                            animate={{ opacity:0.55, x:0, rotate:-6 }}
                            transition={{ duration:0.8, delay:0.3, ease:[0.22,1,0.36,1] }}>
                            <div className="hero-stack-card-inner">
                                <div style={{fontSize:'0.65rem',fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Dashboard</div>
                                <div style={{fontSize:'1.2rem',fontWeight:700,marginTop:6,letterSpacing:'-0.02em'}}>$1.9M</div>
                                <div style={{fontSize:'0.6rem',color:'var(--success)',fontWeight:600,marginTop:2}}>↑ 12% this week</div>
                            </div>
                        </motion.div>
                        <motion.div className="hero-stack-card hero-stack-mid"
                            style={{ x:midX, y:midY }}
                            initial={{ opacity:0, x:40, rotate:10 }}
                            animate={{ opacity:0.78, x:0, rotate:5 }}
                            transition={{ duration:0.8, delay:0.45, ease:[0.22,1,0.36,1] }}>
                            <div className="hero-stack-card-inner">
                                <div style={{fontSize:'0.65rem',fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Pipeline</div>
                                <div className="hero-stack-mini-kpis" style={{marginTop:10}}>
                                    <div className="hero-stack-mini-kpi"><div className="kpi-val">76</div><div className="kpi-label">Lead</div></div>
                                    <div className="hero-stack-mini-kpi"><div className="kpi-val">23</div><div className="kpi-label">Active</div></div>
                                    <div className="hero-stack-mini-kpi"><div className="kpi-val">6</div><div className="kpi-label">Won</div></div>
                                </div>
                            </div>
                        </motion.div>
                        <motion.div className="hero-stack-card hero-stack-front"
                            initial={{ opacity:0, y:30 }}
                            animate={{ opacity:1, y:0 }}
                            transition={{ duration:0.8, delay:0.15, ease:[0.22,1,0.36,1] }}>
                            <div className="home-terminal">
                                <div className="home-terminal-bar">
                                    <div className="home-terminal-dot"></div>
                                    <div className="home-terminal-dot"></div>
                                    <div className="home-terminal-dot"></div>
                                    <span className="home-terminal-title">Sentery · live activity</span>
                                </div>
                                <div className="home-terminal-body" ref={terminalBodyRef}>
                                    {termLines.map(l => (
                                        <div key={l.id} className="home-terminal-line">
                                            <span className="t-prompt">{l.prompt} </span>
                                            <span className={l.cls}>{l.text}</span>
                                            {l.extra && <span className={l.cls}>{l.extra}</span>}
                                        </div>
                                    ))}
                                    <span className="home-terminal-cursor"></span>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </motion.div>
            </section>

            <motion.section className="home-trust-stats"
                initial={{ opacity:0, y:20 }}
                whileInView={{ opacity:1, y:0 }}
                viewport={{ once:true, margin:'-60px' }}
                transition={{ duration:0.5 }}>
                <CountUpStat end={1200} suffix="+" label="Sales teams" />
                <CountUpStat end={1.2} suffix="B" prefix="$" decimals={1} label="Pipeline tracked" />
                <CountUpStat end={60} label="MCP tools" />
                <CountUpStat end={14} label="Countries" />
            </motion.section>

            <section className="home-section" id="features">
                <motion.div className="home-section-title" initial={{ opacity:0 }} whileInView={{ opacity:1 }} viewport={{ once:true }} transition={{ duration:0.4 }}>Features</motion.div>
                <motion.h2 className="home-section-heading" initial={{ opacity:0, y:12 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true }} transition={{ duration:0.5 }}>Everything your sales team needs. Nothing they don't.</motion.h2>
                <motion.p className="home-section-sub" initial={{ opacity:0, y:12 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, margin:'-60px' }} transition={{ duration:0.5, delay:0.1 }}>Pipeline intelligence, AI assistant, MCP-native, email sync, analytics. End-to-end encrypted and built for serious revenue teams.</motion.p>

                <div className="home-bento">
                    {/* Row 1: Hero tile (AI + MCP) */}
                    <BentoTile className="bento-4-2" title="AI Assistant + MCP" desc="60 Model Context Protocol tools. Chat with Claude, ChatGPT, Cursor. Natural language actions on your pipeline.">
                        <AITypingChat />
                        <div className="ai-tools-badge">⚡ 60 MCP tools available</div>
                    </BentoTile>

                    {/* Pipeline Analytics */}
                    <BentoTile className="bento-2-1" title="Pipeline Analytics" desc="Stage distribution, conversion funnels, deal velocity. All live.">
                        <div className="bento-mini-bars">
                            {[40,70,55,85,30,100,15].map((v, i) => (
                                <motion.span key={i} initial={{ height:0 }} whileInView={{ height:v+'%' }} viewport={{ once:true }} transition={{ duration:0.6, delay:i*0.06, ease:[0.22,1,0.36,1] }} style={{ display:'block' }}/>
                            ))}
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:'0.62rem',color:'var(--text-tertiary)'}}>
                            <span>Lead</span><span>Meet</span><span>Won</span>
                        </div>
                    </BentoTile>

                    {/* Email Sequences */}
                    <BentoTile className="bento-2-1" title="Email Sequences" desc="Multi-step drip campaigns with reply detection.">
                        <div className="email-stack">
                            <div className="email-card email-card-1">
                                <span className="email-status email-status-sending">Sending</span>
                                <span className="email-subject">Quick intro from Sentery</span>
                                <span className="email-meta">12:04pm</span>
                            </div>
                            <div className="email-card email-card-2">
                                <span className="email-status email-status-opened">Opened</span>
                                <span className="email-subject">Following up on our chat</span>
                                <span className="email-meta">Tue 4:20pm</span>
                            </div>
                            <div className="email-card email-card-3">
                                <span className="email-status email-status-replied">Replied</span>
                                <span className="email-subject">Next steps for our team</span>
                                <span className="email-meta">Mon 9:15am</span>
                            </div>
                        </div>
                    </BentoTile>

                    {/* AI Competitor Detection */}
                    <BentoTile className="bento-2-1" title="AI Competitor Detection" desc="Auto-detects your competitive landscape from your domain.">
                        <div className="bento-mini-list">
                            <div className="row"><span className="name">HubSpot</span><span className="val" style={{color:'var(--danger)'}}>High</span></div>
                            <div className="row"><span className="name">Salesforce</span><span className="val" style={{color:'var(--warning)'}}>Med</span></div>
                            <div className="row"><span className="name">Pipedrive</span><span className="val">Low</span></div>
                        </div>
                    </BentoTile>

                    {/* Activity Log */}
                    <BentoTile className="bento-2-1" title="Workspace Activity" desc="Every touchpoint, deal move, email. Logged automatically.">
                        <div className="home-activity" style={{marginTop:0}}>
                            {events.length === 0 ? (
                                <div className="activity-empty">Sign in to see live activity</div>
                            ) : events.map((e, i) => (
                                <div key={i} className="activity-item" style={{padding:'8px 10px',fontSize:'0.7rem'}}>
                                    <div className={'activity-dot ' + e.dot} style={{width:6,height:6,marginTop:4}}></div>
                                    <div className="activity-text" style={{fontSize:'0.7rem'}}>{e.text}</div>
                                    <div className="activity-time" style={{fontSize:'0.62rem'}}>{timeAgo(e.time)}</div>
                                </div>
                            ))}
                        </div>
                    </BentoTile>

                    {/* Integrations strip */}
                    <BentoTile className="bento-4-1" title="Connect everything in 30 seconds" desc="Apollo for leads, Gmail for outreach, Google Calendar for meetings. One-click setup.">
                        <div className="bento-integrations">
                            <div className="integration-circle">Ap</div>
                            <div className="integration-dots"><span/><span/><span/></div>
                            <div className="integration-circle">G</div>
                            <div className="integration-dots"><span/><span/><span/></div>
                            <div className="integration-circle">📅</div>
                            <div className="integration-dots"><span/><span/><span/></div>
                            <div className="integration-circle">W</div>
                            <div className="integration-dots"><span/><span/><span/></div>
                            <div className="integration-circle">+</div>
                        </div>
                    </BentoTile>

                    {/* Row 3: Small breadth tiles */}
                    <BentoTile className="bento-2-1" title="Win / Loss Analysis" desc="See why deals close or stall. Pattern detection.">
                        <div className="bento-mini-stat">73%<span className="small"> win rate</span></div>
                        <div className="bento-mini-flag">
                            <span>Champion</span><span>Timing</span><span>ROI</span>
                        </div>
                    </BentoTile>

                    <BentoTile className="bento-2-1" title="Deal Rooms" desc="Shared workspaces for buyers. Track engagement.">
                        <div className="bento-mini-stat">12<span className="small"> active deals</span></div>
                        <div className="bento-mini-flag">
                            <span className="muted">8 viewed today</span>
                        </div>
                    </BentoTile>

                    <BentoTile className="bento-2-1" title="Meetings" desc="Self-serve booking, Google Calendar sync, briefings.">
                        <div className="bento-mini-stat">4<span className="small"> this week</span></div>
                        <div className="bento-mini-flag">
                            <span>2 today</span><span className="muted">2 upcoming</span>
                        </div>
                    </BentoTile>

                    <BentoTile className="bento-2-1" title="Segments" desc="Dynamic cohorts. JSON rules. Bulk actions.">
                        <div className="bento-mini-list">
                            <div className="row"><span className="name">High-Value Leads</span><span className="val">23</span></div>
                            <div className="row"><span className="name">Active Opps</span><span className="val">17</span></div>
                            <div className="row"><span className="name">Former Customers</span><span className="val">8</span></div>
                        </div>
                    </BentoTile>

                    <BentoTile className="bento-2-1" title="Territory View" desc="Map your deals by region. Spot gaps.">
                        <div className="bento-mini-stat">5<span className="small"> regions</span></div>
                        <div className="bento-mini-flag">
                            <span>NA</span><span>EMEA</span><span>APAC</span><span className="muted">+2</span>
                        </div>
                    </BentoTile>

                    <BentoTile className="bento-2-1" title="Playbooks" desc="Reusable outreach sequences. Share across team.">
                        <div className="bento-mini-stat">9<span className="small"> playbooks</span></div>
                        <div className="bento-mini-flag">
                            <span>Cold</span><span>Follow-up</span><span>Re-engage</span>
                        </div>
                    </BentoTile>

                    <BentoTile className="bento-2-1" title="Bookings" desc="Public booking page. Clients pick a slot.">
                        <div className="bento-mini-stat">47<span className="small"> booked this month</span></div>
                        <div className="bento-mini-flag">
                            <span>15-min</span><span>30-min</span><span>60-min</span>
                        </div>
                    </BentoTile>

                    <BentoTile className="bento-2-1" title="Multi-Currency" desc="Admin-set workspace currency. Auto-converts deal values.">
                        <div className="bento-mini-stat">$€£¥<span className="small"> 30 currencies</span></div>
                        <div className="bento-mini-flag">
                            <span>USD</span><span>EUR</span><span>GBP</span><span className="muted">+27</span>
                        </div>
                    </BentoTile>

                    <BentoTile className="bento-2-1" title="Custom Fields" desc="Add any field you need. Filter and report on it.">
                        <div className="bento-mini-stat">∞<span className="small"> fields</span></div>
                        <div className="bento-mini-flag">
                            <span>Text</span><span>Number</span><span>Date</span><span>Boolean</span>
                        </div>
                    </BentoTile>

                    <BentoTile className="bento-2-1" title="Contacts & Companies" desc="Dedicated records with full timelines.">
                        <div className="bento-mini-stat">2.4k<span className="small"> contacts</span></div>
                        <div className="bento-mini-flag">
                            <span>340 companies</span>
                        </div>
                    </BentoTile>

                    {/* Row 4: Full-width */}
                    <BentoTile className="bento-3-1" title="Daily Digest" desc="Morning briefing: follow-ups overdue, meetings today, new leads.">
                        <div className="bento-notif">
                            <div className="bento-notif-avatar">J</div>
                            <div style={{flex:1}}>
                                <div className="bento-notif-text"><strong>Good morning, Jame.</strong> 3 follow-ups overdue · 2 meetings today · 5 new replies</div>
                                <div className="bento-notif-sub">Sent every weekday at 8:00am</div>
                            </div>
                        </div>
                    </BentoTile>

                    <BentoTile className="bento-3-1" title="Secure Notes" desc="Your data is yours. AES-256, end-to-end encrypted.">
                        <div className="bento-lock-wrap">
                            <div className="bento-lock-icon">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            </div>
                            <div>
                                <div style={{fontSize:'0.85rem',color:'var(--text-primary)',fontWeight:500}}>Military-grade encryption</div>
                                <div style={{marginTop:6}}><span className="bento-lock-badge">AES-256</span></div>
                            </div>
                        </div>
                    </BentoTile>
                </div>
            </section>

            <section className="home-section">
                <div className="home-section-title">Try it</div>
                <h2 className="home-section-heading">Interactive demos</h2>
                <p className="home-section-sub">Click around. Drag the pipeline cards. Fill the template. This is what working in Sentery looks like.</p>
                <div className="home-demos-grid">
                    <div className="home-demo-card">
                        <div className="home-demo-area">
                            <MiniPipeline />
                        </div>
                        <div className="home-demo-text">
                            <h3>Drag &amp; Drop Pipeline</h3>
                            <p>Drag prospect cards between columns. Won deals drop into the closed column.</p>
                        </div>
                    </div>
                    <div className="home-demo-card">
                        <div className="home-demo-area">
                            <div className="mini-template">
                                <div className="mini-template-tpl">
                                    Hi <span className={'tvar' + (filledVars.first_name ? ' filled' : '')}>{filledVars.first_name || 'first_name'}</span>, saw <span className={'tvar' + (filledVars.company ? ' filled' : '')}>{filledVars.company || 'company'}</span> is scaling <span className={'tvar' + (filledVars.pain_point ? ' filled' : '')}>{filledVars.pain_point || 'pain_point'}</span>. We helped <span className={'tvar' + (filledVars.ref ? ' filled' : '')}>{filledVars.ref || 'ref'}</span> cut costs 40% in 90 days.
                                </div>
<div className="mini-template-fill">
                                    <button onClick={() => setFilledVars(p => ({...p, first_name:"Sam"}))}>+ first_name</button>
                                    <button onClick={() => setFilledVars(p => ({...p, company:"Acme"}))}>+ company</button>
                                    <button onClick={() => setFilledVars(p => ({...p, pain_point:"fast"}))}>+ pain_point</button>
                                    <button onClick={() => setFilledVars(p => ({...p, ref:"Beta Co"}))}>+ ref</button>
                                </div>
                            </div>
                        </div>
                        <div className="home-demo-text">
                            <h3>Live Template Preview</h3>
                            <p>Watch variables fill in as you click. Templates with placeholders become personal messages.</p>
                        </div>
                    </div>
                    <div className="home-demo-card">
                        <div className="home-demo-area">
                            <div className="mini-chart">
                                <div className="mini-chart-title">Pipeline by Stage</div>
                                <div className="mini-chart-bars">
                                    {[40,70,55,85,30,100,15].map((h, i) => (
                                        <motion.div key={i} className="mini-chart-bar" initial={{ height:0 }} whileInView={{ height:h+'%' }} viewport={{ once:true }} transition={{ duration:0.6, delay:i*0.06, ease:[0.22,1,0.36,1] }} data-val={[3,5,4,6,2,8,1][i]}></motion.div>
                                    ))}
                                </div>
                                <div className="mini-chart-labels">
                                    <span>Lead</span><span>Contact</span><span>Engage</span><span>Meet</span><span>Prop</span><span>Nego</span><span>Won</span>
                                </div>
                            </div>
                        </div>
                        <div className="home-demo-text">
                            <h3>Real-Time Analytics</h3>
                            <p>Visual pipeline distribution, conversion funnels, and deal velocity. All updating live.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="home-comparison">
                <div className="home-section-title" style={{padding:'0',marginBottom:10}}>Why Sentery</div>
                <h2 className="home-section-heading" style={{marginBottom:40}}>Before vs After Sentery</h2>
                <div className="comparison-grid">
                    <motion.div className="comparison-card without"
                        initial={{ opacity:0, x:-20 }} whileInView={{ opacity:1, x:0 }} viewport={{ once:true }} transition={{ duration:0.5 }}>
                        <h3>Without Sentery</h3>
                        <ul className="comparison-list">
                            {['Spreadsheets and notes scattered everywhere', 'Lost context on every handoff', 'No AI help, manual follow-ups', 'Data breaches from sketchy CRMs', 'Hours wasted on data entry'].map((item, i) => (
                                <li key={i}>
                                    <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </motion.div>
                    <motion.div className="comparison-card with"
                        initial={{ opacity:0, x:20 }} whileInView={{ opacity:1, x:0 }} viewport={{ once:true }} transition={{ duration:0.5, delay:0.1 }}>
                        <h3>With Sentery</h3>
                        <ul className="comparison-list">
                            {['One encrypted workspace, every interaction logged', 'Full timeline on every contact', '60 AI + MCP tools, natural language actions', 'AES-256 end-to-end encryption', 'Auto-sync email, calendar, contacts'].map((item, i) => (
                                <motion.li key={i}
                                    initial={{ opacity:0, scale:0.9 }} whileInView={{ opacity:1, scale:1 }} viewport={{ once:true }} transition={{ duration:0.3, delay:0.2 + i*0.08, ease:[0.22,1,0.36,1] }}>
                                    <span className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></span>
                                    {item}
                                </motion.li>
                            ))}
                        </ul>
                    </motion.div>
                </div>
            </section>

            <section className="home-cta">
                <div className="home-cta-inner">
                    <h2>Start building relationships</h2>
                    <p className="desc">Every deal starts with trust. Sentery helps you build it at scale. Free until October 1, 2026. No credit card required.</p>
                    <div className="home-cta-btns">
                        <button className="btn-hero btn-hero-primary" onClick={handleSignIn}>
                            Get Started
                            <span className="arrow-nudge">→</span>
                        </button>
                        <button className="btn-hero btn-hero-secondary" onClick={scrollToFeatures}>Learn More</button>
                    </div>
                </div>
            </section>

            <footer className="home-footer">
                <p>Sentery · Sales Intelligence Platform · © 2026 Global Inc.</p>
                <div className="legal-footer-links">
                    <a href="/privacy" onClick={(e) => { e.preventDefault(); setPage('privacy'); }}>Privacy Policy</a>
                    <span className="legal-footer-sep">·</span>
                    <a href="/terms" onClick={(e) => { e.preventDefault(); setPage('terms'); }}>Terms of Service</a>
                </div>
            </footer>
        </div>
    );
}

function BentoTile({ className, title, desc, children }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once:true, margin:'-60px' });
    return (
        <motion.div ref={ref} className={'bento-tile ' + (className || '')}
            initial={{ opacity:0, y:20 }}
            animate={inView ? { opacity:1, y:0 } : {}}
            transition={{ duration:0.5, ease:[0.22,1,0.36,1] }}>
            <div className="tile-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <h3>{title}</h3>
            <p>{desc}</p>
            {children}
        </motion.div>
    );
}

function AITypingChat() {
    const [shown, setShown] = useState([]);
    const [typing, setTyping] = useState(null);
    const [paused, setPaused] = useState(false);
    const idxRef = useRef(0);
    const shownRef = useRef([]);
    const pausedRef = useRef(false);
    pausedRef.current = paused;

    useEffect(() => {
        if (paused) return;
        let cancelled = false;
        const advance = () => {
            if (cancelled || pausedRef.current) return;
            const i = idxRef.current % AI_CHAT_SCRIPT.length;
            const msg = AI_CHAT_SCRIPT[i];
            idxRef.current++;
            if (msg.role === 'user') {
                shownRef.current = [...shownRef.current, { ...msg, key: Date.now() }];
                if (shownRef.current.length > 4) shownRef.current = shownRef.current.slice(-4);
                setShown([...shownRef.current]);
                setTyping(null);
                setTimeout(advance, 700);
            } else {
                setTyping({ text:'', key: Date.now() });
                let ci = 0;
                const type = () => {
                    if (cancelled || pausedRef.current) return;
                    if (ci < msg.text.length) {
                        setTyping({ text: msg.text.slice(0, ci + 1), key: Date.now() });
                        ci++;
                        setTimeout(type, 22);
                    } else {
                        shownRef.current = [...shownRef.current, { ...msg, key: Date.now() + 1 }];
                        if (shownRef.current.length > 4) shownRef.current = shownRef.current.slice(-4);
                        setShown([...shownRef.current]);
                        setTyping(null);
                        setTimeout(advance, 1200);
                    }
                };
                setTimeout(type, 400);
            }
        };
        const start = setTimeout(advance, 600);
        return () => { cancelled = true; clearTimeout(start); };
    }, [paused]);

    return (
        <div className="ai-chat-mock" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
            {shown.map(m => (
                <div key={m.key} className={'ai-msg ' + (m.role === 'user' ? 'ai-msg-user' : 'ai-msg-bot')}>
                    {m.text}
                </div>
            ))}
            {typing && (
                <div className="ai-msg ai-msg-bot typing-active">
                    {typing.text}
                    <span className="ai-chat-cursor"></span>
                </div>
            )}
        </div>
    );
}

function CountUpStat({ end, prefix='', suffix='', label, decimals=0 }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once:true });
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!inView) return;
        const duration = 1400;
        const start = performance.now();
        let raf;
        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            const current = end * eased;
            setVal(decimals > 0 ? Number(current.toFixed(decimals)) : Math.round(current));
            if (t < 1) raf = requestAnimationFrame(tick);
            else setVal(end);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [inView, end, decimals]);

    const display = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString();

    return (
        <div className="trust-stat" ref={ref}>
            <div className="v-row">
                {prefix && <span className="prefix">{prefix}</span>}
                <span className="v">{display}</span>
                {suffix && <span className="suffix">{suffix}</span>}
            </div>
            <div className="l">{label}</div>
        </div>
    );
}

function FloatingParticles() {
    return (
        <>
            {PARTICLES.map((p, i) => (
                <motion.div
                    key={i}
                    className="home-particle"
                    style={{
                        left: p.x + '%',
                        top: p.y + '%',
                        width: p.size,
                        height: p.size,
                        opacity: 0.08,
                    }}
                    initial={{ y:0, opacity:0 }}
                    animate={{ y:[0, -30, 0], opacity:[0.05, 0.12, 0.05] }}
                    transition={{ duration:p.dur, repeat:Infinity, delay:p.delay, ease:'easeInOut' }}
                />
            ))}
        </>
    );
}

function MiniPipeline() {
    const [cards, setCards] = useState([
        { id: 1, name: 'Lead Alpha', value: '$60K', stage: 'lead' },
        { id: 2, name: 'Lead Beta', value: '$45K', stage: 'lead' },
        { id: 3, name: 'Demo Co', value: '$120K', stage: 'engaged' },
        { id: 4, name: 'Pilot Inc', value: '$200K', stage: 'proposal' },
    ]);
    const [dragId, setDragId] = useState(null);
    const stages = ['lead', 'engaged', 'proposal', 'won'];

    const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; };
    const onDrop = (stage) => {
        if (dragId === null) return;
        setCards(prev => prev.map(c => c.id === dragId ? { ...c, stage } : c));
        setDragId(null);
    };

    return (
        <div className="mini-pipeline">
            {stages.map(s => (
                <div key={s} className="mini-pipeline-col"
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                    onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
                    onDrop={(e) => { e.currentTarget.classList.remove('drag-over'); onDrop(s); }}>
                    <div className="mini-pipeline-col-label">{s === 'won' ? 'Won' : s.charAt(0).toUpperCase() + s.slice(1)}</div>
                    {cards.filter(c => c.stage === s).map(c => (
                        <div key={c.id} className="mini-pipeline-card" draggable onDragStart={(e) => onDragStart(e, c.id)}>
                            <div className="mp-name">{c.name}</div><div className="mp-val">{c.value}</div>
                        </div>
                    ))}
                    {s === 'won' && cards.filter(c => c.stage === s).length === 0 && <div className="mini-pipeline-drop"></div>}
                </div>
            ))}
        </div>
    );
}