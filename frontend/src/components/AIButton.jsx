import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Markdown from 'react-markdown';
import { SenteryWordmark } from './SenteryLogo';
import { showToast } from './Toast';

export default function AIButton({ options, onResult, prospect, size = 'small', label = 'AI' }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleAction = async (action) => {
        setOpen(false);
        setLoading(true);
        try {
            const result = await action.fn(prospect);
            onResult?.(result, action.label);
        } catch (err) {
            showToast(`AI Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{position:'relative',display:'inline-block'}}>
            <button
                className="btn-ai"
                style={{
                    fontSize: size === 'small' ? 10 : 12,
                    padding: size === 'small' ? '3px 8px' : '5px 12px',
                    display:'flex',alignItems:'center',gap:4,
                }}
                onClick={() => setOpen(!open)}
                disabled={loading}
            >
                {loading ? (
                    <span className="loading-dots">Thinking</span>
                ) : (
                    <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width={size === 'small' ? 10 : 12} height={size === 'small' ? 10 : 12}><path d="M12 2a5 5 0 0 1 5 5c0 1.5-.7 2.8-1.8 3.7L12 12l-3.2-1.3A5 5 0 0 1 12 2z"/><circle cx="12" cy="7" r="1"/><path d="M8 21l1-4m6 4l-1-4m-5 0h8"/></svg>
                        {label}
                    </>
                )}
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity:0, y:-4 }}
                        animate={{ opacity:1, y:0 }}
                        exit={{ opacity:0, y:-4 }}
                        transition={{ duration:0.12 }}
                        style={{ position:'absolute',bottom:'100%',left:0,marginBottom:4, zIndex:100 }}
                    >
                        <div style={{position:'fixed',inset:0,zIndex:98}} onClick={() => setOpen(false)} />
                        <div className="ai-dropdown" style={{
                            background:'var(--bg-surface)',border:'1px solid var(--border)',
                            borderRadius:8,boxShadow:'0 8px 24px rgba(0,0,0,0.2)',
                            minWidth:180,overflow:'hidden', position:'relative', zIndex:99,
                        }}>
                            {options.map((opt, i) => (
                                <button
                                    key={i}
                                    style={{
                                        display:'block',width:'100%',textAlign:'left',
                                        padding:'8px 12px',fontSize:12,border:'none',
                                        background:'transparent',cursor:'pointer',
                                        color:'var(--text-primary)',
                                    }}
                                    onMouseEnter={e => e.target.style.background = 'var(--bg-surface-alt)'}
                                    onMouseLeave={e => e.target.style.background = 'transparent'}
                                    onClick={() => handleAction(opt)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const styles = {
    overlay: {
        position:'fixed',inset:0,zIndex:200,
        display:'flex',alignItems:'center',justifyContent:'center',
        background:'rgba(0,0,0,0.5)',
        backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)',
        padding:24,
    },
    modal: {
        background:'var(--glass-bg)',
        backdropFilter:'var(--glass-blur)',WebkitBackdropFilter:'var(--glass-blur)',
        boxShadow:'var(--glass-shadow), 0 0 0 1px var(--glass-border)',
        borderRadius:16,
        width:'100%',maxWidth:620,
        maxHeight:'85vh',overflow:'auto',
        position:'relative',
    },
    modalGlow: {
        position:'absolute',top:0,left:0,right:0,height:3,
        background:'linear-gradient(90deg, transparent, var(--accent), transparent)',
        borderRadius:'16px 16px 0 0',
        opacity:0.6,
    },
    header: {
        display:'flex',justifyContent:'space-between',alignItems:'center',
        padding:'18px 24px 12px',
    },
    brand: {
        fontFamily:'"Press Start 2P",monospace',
        fontSize:9,
        color:'var(--accent)',
        textShadow:'1px 0 0 var(--accent), 0 1px 0 var(--accent), 1px 1px 0 var(--accent)',
        letterSpacing:0.3,
        display:'flex',alignItems:'center',gap:8,
    },
    brandDivider: {
        width:1,height:12,background:'var(--border)',
    },
    brandLabel: {
        fontFamily:'var(--font-body)',fontSize:11,fontWeight:500,
        color:'var(--text-tertiary)',letterSpacing:0.04,textShadow:'none',
    },
    divider: {
        height:1,background:'var(--glass-border)',
        margin:'0 24px',
    },
    body: {
        padding:'16px 24px 20px',
        fontSize:13,lineHeight:1.75,
        color:'var(--text-secondary)',
    },
    actions: {
        display:'flex',gap:8,
        padding:'0 24px 20px',
        flexWrap:'wrap',
    },
    badge: {
        display:'inline-flex',alignItems:'center',gap:4,
        fontSize:10,fontWeight:500,color:'var(--accent)',
        background:'var(--accent-tint)',
        padding:'2px 8px',borderRadius:4,
    },
};

function stripMarkdown(md) {
    return md
        .replace(/#{1,6}\s+/g, '')
        .replace(/(\*{1,2}|_{1,2})(.*?)\1/g, '$2')
        .replace(/`{1,3}(.*?)`{1,3}/g, '$1')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/!\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/>\s+/g, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/^---+/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function AIResultModal({ title, content, onClose, onRegenerate, onUse }) {
    const wordCount = content ? content.trim().split(/\s+/).length : 0;
    const charCount = content ? content.length : 0;

    const handleCopyMarkdown = () => {
        navigator.clipboard.writeText(content);
        showToast('Copied markdown');
    };

    const handleCopyText = () => {
        navigator.clipboard.writeText(stripMarkdown(content));
        showToast('Copied as plain text');
    };

    const handleSelectAll = () => {
        const sel = window.getSelection();
        const range = document.createRange();
        const body = document.querySelector('[data-ai-body]');
        if (body) { range.selectNodeContents(body); sel.removeAllRanges(); sel.addRange(range); }
    };

    const handleDownload = () => {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vaulty-nodey-${title || 'ai'}-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Downloaded as .txt');
    };

    const handleSpeak = () => {
        if ('speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance(stripMarkdown(content));
            u.rate = 0.9;
            speechSynthesis.cancel();
            speechSynthesis.speak(u);
            showToast('Reading aloud...');
        } else {
            showToast('Speech not supported in this browser');
        }
    };

    return (
        <AnimatePresence>
            {content && (
                <motion.div
                    key="modal-overlay"
                    initial={{ opacity:0 }}
                    animate={{ opacity:1 }}
                    exit={{ opacity:0 }}
                    transition={{ duration:0.15 }}
                    style={styles.overlay}
                    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
                >
                    <motion.div
                        key="modal-content"
                        initial={{ opacity:0, scale:0.95, y:12 }}
                        animate={{ opacity:1, scale:1, y:0 }}
                        exit={{ opacity:0, scale:0.95, y:12 }}
                        transition={{ duration:0.25, ease:'easeOut' }}
                        style={styles.modal}
                    >
                        <div style={styles.modalGlow} />

                        <div style={styles.header}>
                            <div style={{display:'flex',alignItems:'center',gap:10}}>
                                <div style={styles.brand}>
                                    <SenteryWordmark height={14} />
                                    <span style={styles.brandDivider} />
                                    <span style={styles.brandLabel}>AI</span>
                                </div>
                                {title && <span style={styles.badge}>{title}</span>}
                            </div>
                            <button className="btn-icon-sm" onClick={onClose}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>

                        <div style={styles.divider} />

                        <div style={styles.body} data-ai-body>
                            <Markdown
                                components={{
                                    h1: ({children}) => <h1 style={{fontSize:15,fontWeight:600,margin:'16px 0 8px',color:'var(--text-primary)'}}>{children}</h1>,
                                    h2: ({children}) => <h2 style={{fontSize:14,fontWeight:600,margin:'14px 0 6px',color:'var(--text-primary)'}}>{children}</h2>,
                                    h3: ({children}) => <h3 style={{fontSize:13,fontWeight:600,margin:'12px 0 4px',color:'var(--text-primary)'}}>{children}</h3>,
                                    p: ({children}) => <p style={{margin:'6px 0'}}>{children}</p>,
                                    ul: ({children,start}) => <ul style={{margin:'6px 0',paddingLeft:20}} start={start}>{children}</ul>,
                                    ol: ({children,start}) => <ol style={{margin:'6px 0',paddingLeft:20}} start={start}>{children}</ol>,
                                    li: ({children}) => <li style={{margin:'3px 0'}}>{children}</li>,
                                    strong: ({children}) => <strong style={{fontWeight:600,color:'var(--text-primary)'}}>{children}</strong>,
                                    code: ({children,className}) => {
                                        const isBlock = className?.startsWith('language-');
                                        if (isBlock) {
                                            return <pre style={{background:'var(--bg-sunken)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px',overflow:'auto',fontSize:12,lineHeight:1.6,margin:'10px 0'}}><code style={{background:'none',padding:0,borderRadius:0,fontSize:'inherit'}}>{children}</code></pre>;
                                        }
                                        return <code style={{background:'var(--bg-sunken)',padding:'2px 6px',borderRadius:4,fontSize:12,color:'var(--accent)',border:'1px solid var(--border)'}}>{children}</code>;
                                    },
                                    pre: ({children}) => <div style={{margin:'10px 0'}}>{children}</div>,
                                    hr: () => <div style={{height:1,background:'var(--border)',margin:'14px 0'}} />,
                                    blockquote: ({children}) => <blockquote style={{margin:'10px 0',paddingLeft:14,borderLeft:'3px solid var(--accent)',color:'var(--text-secondary)',fontStyle:'italic'}}>{children}</blockquote>,
                                }}
                            >
                                {content}
                            </Markdown>
                        </div>

                        <div style={styles.divider} />

                        <div style={{
                            display:'flex',alignItems:'center',gap:8,
                            padding:'0 24px 16px',
                            flexWrap:'wrap',
                        }}>
                            <span style={{fontSize:10,color:'var(--text-tertiary)',whiteSpace:'nowrap',marginRight:4}}>
                                {wordCount}w · {charCount.toLocaleString()}c
                            </span>
                            <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}>
                                {(onUse || onRegenerate) && <span style={{width:1,height:14,background:'var(--border)',margin:'0 2px'}} />}
                                {onUse && (
                                    <button className="btn-xs" onClick={() => { onUse(content); onClose(); }}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="10" height="10" style={{marginRight:2}}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                        Add to Notes
                                    </button>
                                )}
                                {onRegenerate && (
                                    <button className="btn-xs" onClick={onRegenerate}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="10" height="10" style={{marginRight:2}}><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                                        Refresh
                                    </button>
                                )}
                            </div>
                            <div style={{flex:1,minWidth:4}} />
                            <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}>
                                <button className="btn-xs" onClick={handleCopyMarkdown} title="Copy raw markdown">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="10" height="10" style={{marginRight:2}}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    Copy MD
                                </button>
                                <button className="btn-xs" onClick={handleCopyText} title="Strip markdown, copy plain text">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="10" height="10" style={{marginRight:2}}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                                    Copy Text
                                </button>
                                <button className="btn-xs" onClick={handleSelectAll} title="Select all content">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="10" height="10" style={{marginRight:2}}><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
                                    Select
                                </button>
                                <button className="btn-xs" onClick={handleSpeak} title="Read aloud">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="10" height="10" style={{marginRight:2}}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                                    Speak
                                </button>
                                <button className="btn-xs" onClick={handleDownload} title="Save as .txt file">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="10" height="10" style={{marginRight:2}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                    Download
                                </button>
                                <span style={{width:1,height:14,background:'var(--border)',margin:'0 2px'}} />
                                <button className="btn-secondary" onClick={onClose}>Close</button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
