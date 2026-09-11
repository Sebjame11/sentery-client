import { useState, useRef, useEffect } from 'react';
import { aiChat } from '../utils/ai';
import { showToast } from './Toast';

export default function AIAssistant({ open, onToggle }) {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hi! I am your AI sales assistant. Ask me anything about your prospects, pipeline, or sales strategy.' },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEnd = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    const send = async () => {
        const text = input.trim();
        if (!text || loading) return;

        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: text }]);
        setLoading(true);

        try {
            const chatMessages = [
                { role: 'system', content: 'You are an expert B2B sales assistant for Sentery. Be concise, actionable, professional. No emojis or em dashes. Format in clean text.' },
                ...messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: text },
            ];
            const reply = await aiChat(chatMessages, { maxTokens: 1024 });
            setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {open && (
                <div style={{
                    position:'fixed',top:60,right:16,zIndex:999,
                    width:380,maxHeight:'calc(100vh - 80px)',
                    background:'var(--bg-surface)',border:'1px solid var(--border)',
                    borderRadius:16,display:'flex',flexDirection:'column',
                    boxShadow:'0 8px 40px rgba(0,0,0,0.25)',overflow:'hidden',
                }}>
                    <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--bg-surface-alt)'}}>
                        <span style={{fontWeight:600,fontSize:14}}>AI Assistant</span>
                        <span style={{fontSize:10,color:'var(--text-muted)',padding:'2px 8px',background:'var(--bg-surface)',borderRadius:4}}>
                            Connected
                        </span>
                    </div>

                    <div style={{flex:1,overflowY:'auto',padding:12,maxHeight:400}}>
                        {messages.map((msg, i) => (
                            <div key={i} style={{
                                marginBottom:10,display:'flex',
                                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            }}>
                                <div style={{
                                    maxWidth:'85%',padding:'8px 12px',borderRadius:12,fontSize:13,lineHeight:1.5,
                                    background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-surface-alt)',
                                    color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                                    borderBottomRightRadius: msg.role === 'user' ? 4 : 12,
                                    borderBottomLeftRadius: msg.role === 'user' ? 12 : 4,
                                    whiteSpace:'pre-wrap',
                                }}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div style={{display:'flex',justifyContent:'flex-start',marginBottom:10}}>
                                <div style={{padding:'8px 12px',borderRadius:12,background:'var(--bg-surface-alt)',fontSize:13}}>
                                    <span className="loading-dots">Thinking</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEnd} />
                    </div>

                    <div style={{padding:12,borderTop:'1px solid var(--border)',display:'flex',gap:8}}>
                        <input
                            ref={inputRef}
                            className="input"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                            placeholder="Ask about sales strategy..."
                            style={{flex:1}}
                            disabled={loading}
                        />
                        <button className="btn-primary" onClick={send} disabled={loading || !input.trim()} style={{padding:'8px 16px'}}>
                            {loading ? '...' : 'Send'}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
