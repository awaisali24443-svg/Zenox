import React, { useState, useEffect, useRef } from 'react';
import { useBackendStatus } from './hooks/useBackendStatus';
import { Conversation, Message } from './types';
import { 
  Plus, Search, MessageSquare, X, Settings, Menu, 
  Layout, AlertCircle, Check, Copy, ImageIcon, 
  FileText, Mic, MicOff, Square, ArrowUp, Download 
} from 'lucide-react';
import Markdown from 'react-markdown';

const API_URL = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_SYNOD_API_KEY || 'local-dev-key';
const STORAGE_KEY = 'zenox-conversations-v3';

const ZenoxLogo = ({ size = 36 }: { size?: number }) => (
  <div style={{width:size, height:size}}
    className="relative flex items-center justify-center flex-shrink-0">
    <div style={{width:size, height:size}}
      className="rounded-[28%] bg-gradient-to-br from-[#111] to-[#0a0a0a]
        border border-emerald-500/20 flex items-center justify-center
        shadow-[0_0_24px_rgba(16,185,129,0.12)]">
      <svg width={size*0.52} height={size*0.52} viewBox="0 0 24 24" fill="none">
        <path d="M4 5h16M4 5l16 14M4 19h16"
          stroke="url(#zg)" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"/>
        <defs>
          <linearGradient id="zg" x1="4" y1="5" x2="20" y2="19">
            <stop offset="0%" stopColor="#10b981"/>
            <stop offset="100%" stopColor="#34d399"/>
          </linearGradient>
        </defs>
      </svg>
    </div>
    <div style={{width:size*0.22, height:size*0.22}}
      className="absolute -bottom-0.5 -right-0.5 rounded-full
        bg-emerald-400 border-2 border-[#080808]
        shadow-[0_0_6px_rgba(16,185,129,0.7)]"/>
  </div>
);

export default function App() {
  const { status: backendStatus, model: backendModel } = useBackendStatus();
  
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(
    typeof window !== 'undefined' && window.innerWidth >= 1024
  );
  
  const [searchQuery, setSearchQuery] = useState('');
  const [agentMode, setAgentMode] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [msgStatus, setMsgStatus] = useState<'idle'|'sending'|'thinking'|'typing'>('idle');
  const [lastProject, setLastProject] = useState<any>(null);
  const [toast, setToast] = useState<{msg: string, type: 'success'|'error'} | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, 50)));
  }, [conversations]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadConversation = (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (conv) {
      setCurrentConversationId(id);
      setMessages(conv.messages);
      setLastProject(null);
    }
  };

  const startNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setInputValue('');
    setLastProject(null);
  };

  const deleteConversation = (id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversationId === id) {
      startNewChat();
    }
    showToast('Chat deleted');
  };

  const saveConversation = (msgs: Message[], convoId: string | null) => {
    if (msgs.length === 0) return convoId;
    
    let activeId = convoId;
    setConversations(prev => {
      let existing = prev.find(c => c.id === convoId);
      if (!existing) {
        const id = convoId || Math.random().toString(36).substring(2, 9);
        activeId = id;
        const titleText = msgs.find(m => m.role === 'user')?.content || 'New Task';
        existing = {
          id,
          title: titleText.slice(0, 40) + '...',
          messages: msgs,
          createdAt: Date.now()
        };
        return [existing, ...prev];
      } else {
        const updated = { ...existing, messages: msgs, title: existing.title };
        return [updated, ...prev.filter(c => c.id !== existing!.id)];
      }
    });
    
    return activeId;
  };

  const getActiveIdStateSync = (currentId: string | null) => {
    return currentId || Math.random().toString(36).substring(2, 9);
  };

  const pollTaskCompletion = (taskId: string, currentMsgs: Message[], convoId: string) => {
    const maxAttempts = 120;
    let attempts = 0;
    
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        setIsLoading(false);
        setMsgStatus('idle');
        return;
      }
      
      try {
        const res = await fetch(`${API_URL}/api/agent/task/${taskId}`, {
          headers: { 'X-API-Key': API_KEY }
        });
        if (!res.ok) return;
        
        const taskObj = await res.json();
        
        if (taskObj.status === 'complete' && taskObj.result) {
          clearInterval(interval);
          setMsgStatus('idle');
          
          const lang = taskObj.result.language || 'javascript';
          const iters = taskObj.result.iterations || 1;
          const quality = taskObj.result.quality || 'good';
          let resultText = taskObj.result.code 
            ? `✅ **Done!** I built your ${lang} solution.\n\n` +
              `Self-corrected **${iters}x** to reach **${quality}** quality.\n\n` +
              (taskObj.result.repo_url ? `📁 [GitHub →](${taskObj.result.repo_url})\n` : '') +
              (taskObj.result.deploy_url?.startsWith('http') ? `🚀 [Live Site →](${taskObj.result.deploy_url})\n` : '') +
              `\nDownload your code below ↓`
            : `Task completed.`;
             
          const aiMsg: Message = {
            role: 'assistant',
            content: resultText,
            timestamp: Date.now(),
            taskId: taskId
          };
          
          const update = [...currentMsgs, aiMsg];
          setMessages(update);
          saveConversation(update, convoId);
          setIsLoading(false);
          setLastProject(taskObj.result);
          
          fetch(`${API_URL}/api/agent/task/${taskId}`, {
            method: 'DELETE',
            headers: { 'X-API-Key': API_KEY }
          }).catch(() => {});
          
        } else if (taskObj.status === 'failed') {
          clearInterval(interval);
          setMsgStatus('idle');
          const aiMsg: Message = {
            role: 'system',
            content: `Execution halted. \n${taskObj.error}`,
            timestamp: Date.now(),
            taskId: taskId
          };
          const update = [...currentMsgs, aiMsg];
          setMessages(update);
          saveConversation(update, convoId);
          setIsLoading(false);
          showToast('Task failed', 'error');
        } else {
          setMsgStatus('thinking');
          // Show live progress in the last message if it exists
          if (taskObj.progress && taskObj.progress.length > 0) {
            const latest = taskObj.progress[taskObj.progress.length - 1];
            const doneCount = taskObj.progress.filter((p: any) => p.status === 'done').length;
            const total = taskObj.progress.length;
            const progressText = `**Step ${doneCount}/${total}:** ${latest.step}${latest.detail ? ` — ${latest.detail}` : ''}`;
            const progressMsg: Message = {
              role: 'assistant',
              content: progressText,
              timestamp: Date.now(),
              taskId: taskId
            };
            setMessages([...currentMsgs, progressMsg]);
          }
        }
      } catch (e) {}
    }, 2000);
  };

  const handleSendWithMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    
    const convoId = getActiveIdStateSync(currentConversationId);
    if (!currentConversationId) setCurrentConversationId(convoId);
    
    setInputValue('');
    setIsLoading(true);
    setMsgStatus('sending');
    setLastProject(null);
    
    const userMsg: Message = { role: 'user', content: text.trim(), timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    saveConversation(newMessages, convoId);
    
    try {
      if (agentMode) {
        setMsgStatus('thinking');
        let classification = null;
        try {
          const classRes = await fetch(`${API_URL}/api/agent/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
            body: JSON.stringify({ prompt: text })
          });
          classification = await classRes.json();
        } catch (err) {
          classification = { type: 'chat', language: 'javascript' };
        }
        
        const runRes = await fetch(`${API_URL}/api/agent/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
          body: JSON.stringify({
            prompt: text,
            language: classification?.language || 'javascript',
            task_type: classification?.type || 'general'
          })
        });
        
        if (!runRes.ok) throw new Error('Failed to initialize task orchestration');
        const { task_id } = await runRes.json();
        pollTaskCompletion(task_id, newMessages, convoId);
      } else {
        // Chat mode (could be implemented as stream or single response, dummy implementation here falling back to standard API)
        setMsgStatus('typing');
        const history = newMessages.map(m => ({ role: m.role, content: m.content }));
        
        const res = await fetch(`${API_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
            body: JSON.stringify({ message: text, history: history })
        });
        
        if (!res.ok || !res.body) throw new Error('Chat API failed');
        
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        
        const aiMsg: Message = { role: 'assistant', content: '', timestamp: Date.now() };
        let updatedMsgs = [...newMessages, aiMsg];
        setMessages(updatedMsgs);
        
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          fullContent += decoder.decode(value, { stream: true });
          
          updatedMsgs = [...newMessages, { ...aiMsg, content: fullContent }];
          setMessages(updatedMsgs);
        }
        saveConversation(updatedMsgs, convoId);
        setIsLoading(false);
        setMsgStatus('idle');
      }
    } catch (e: any) {
      const errorMsg: Message = { role: 'system', content: `Error: ${e.message}`, timestamp: Date.now() };
      const updatedMsgs = [...newMessages, errorMsg];
      setMessages(updatedMsgs);
      saveConversation(updatedMsgs, convoId);
      setIsLoading(false);
      setMsgStatus('idle');
      showToast('Error occurred', 'error');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendWithMessage(inputValue);
    }
  };

  const stopGeneration = () => {
    setIsLoading(false);
    setMsgStatus('idle');
  };

  const removeImage = () => setImagePreview(null);
  const copyMessage = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    showToast('Copied to clipboard');
    setTimeout(() => setCopiedIndex(null), 2000);
  };
  const setSuggestions = (arr: any) => {};
  const filteredConversations = conversations.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const getTimeAgo = (timestamp: number) => {
    const diff = Math.floor((Date.now() - timestamp) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
    return `${Math.floor(diff/1440)}d ago`;
  };
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const renderMarkdown = (content: string) => {
    return (
      <div className="prose prose-invert max-w-none text-[#ccc] text-[13.5px]">
        <Markdown>{content}</Markdown>
      </div>
    );
  };

  // ── Image upload handler (was missing)
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Max 5MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // ── File upload handler (was missing)
  const [fileContent, setFileContent] = React.useState<{name:string;text:string}|null>(null);
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) { showToast('Max 200KB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = ev => setFileContent({ name: file.name, text: ev.target?.result as string });
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Real voice input (was fake)
  const recognitionRef = useRef<any>(null);
  const realToggleVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { showToast('Voice not supported', 'error'); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const r = new SR();
    r.continuous = false; r.interimResults = true; r.lang = 'en-US';
    r.onstart = () => setIsListening(true);
    r.onresult = (e: any) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setInputValue(t);
    };
    r.onend = () => { setIsListening(false); inputRef.current?.focus(); };
    r.onerror = () => { setIsListening(false); showToast('Mic error', 'error'); };
    recognitionRef.current = r; r.start();
  };

  // ── Export conversation
  const exportConversation = () => {
    if (!messages.length) return;
    const text = messages.map(m =>
      `[${formatTime(m.timestamp)}] ${m.role === 'user' ? 'You' : 'Zenox'}:\n${m.content}`
    ).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `zenox-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
    showToast('Exported');
  };

  // Logo component (inline)
  const Logo = ({ size = 32 }: { size?: number }) => (
    <div style={{width:size,height:size}} className="relative flex-shrink-0">
      <div style={{
          width:size, height:size, borderRadius:'28%',
          background:'linear-gradient(135deg,#1a1a1d,#0d0d0f)',
          border:'1px solid rgba(16,185,129,0.25)',
          boxShadow:'0 0 20px rgba(16,185,129,0.08)',
          display:'flex', alignItems:'center', justifyContent:'center',
          flexShrink:0, position:'relative'
        }}
        className="flex items-center justify-center">
        <svg width={size*0.52} height={size*0.52} viewBox="0 0 24 24" fill="none">
          <path d="M4 5h16M4 5l16 14M4 19h16" stroke="url(#lg)"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <defs>
            <linearGradient id="lg" x1="4" y1="5" x2="20" y2="19">
              <stop offset="0%" stopColor="#10b981"/>
              <stop offset="100%" stopColor="#34d399"/>
            </linearGradient>
          </defs>
        </svg>
        <div style={{
          position:'absolute', bottom:'-2px', right:'-2px',
          width:size*0.22, height:size*0.22,
          borderRadius:'50%', background:'#10b981',
          border:`2px solid #09090b`,
          boxShadow:'0 0 6px rgba(16,185,129,0.8)'
        }}/>
      </div>
    </div>
  );

  return (
    <div style={{
      display:'flex',
      height:'100dvh',
      overflow:'hidden',
      background:'var(--bg)',
      color:'var(--text1)',
      fontFamily:'-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif'
    }}>

      {/* Hidden inputs */}
      <input ref={imageInputRef} type="file" style={{display:'none'}}
        accept="image/*" onChange={handleImageSelect}/>
      <input ref={fileInputRef} type="file" style={{display:'none'}}
        accept=".txt,.md,.py,.js,.ts,.json,.csv,.html,.css"
        onChange={handleFileSelect}/>

      {/* ────────────────────── SIDEBAR ────────────────────── */}
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position:'fixed', inset:0, zIndex:30,
            background:'rgba(0,0,0,0.6)',
            backdropFilter:'blur(4px)'
          }}
          className="lg:hidden fade-in"
        />
      )}

      <aside style={{
        position:'fixed', top:0, left:0, bottom:0, zIndex:40,
        width:260,
        display:'flex', flexDirection:'column',
        background:'#0c0c0f',
        borderRight:'1px solid var(--border)',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition:'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
      }} className="lg:static lg:translate-x-0">

        {/* Logo header */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'16px 16px',
          borderBottom:'1px solid var(--border)',
          flexShrink:0
        }}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <Logo size={30}/>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:'var(--text1)',letterSpacing:'-0.3px'}}>
                Zenox
              </div>
              <div style={{fontSize:9,color:'var(--text4)',textTransform:'uppercase',letterSpacing:'0.12em'}}>
                by awais
              </div>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden"
            style={{
              padding:'6px', borderRadius:8, border:'none',
              background:'transparent', color:'var(--text3)',
              cursor:'pointer', display:'flex'
            }}>
            <X size={15}/>
          </button>
        </div>

        {/* New Chat */}
        <div style={{padding:'10px 10px', borderBottom:'1px solid var(--border)', flexShrink:0}}>
          <button
            onClick={() => { startNewChat(); if(window.innerWidth<1024) setSidebarOpen(false); }}
            style={{
              width:'100%', display:'flex', alignItems:'center',
              justifyContent:'center', gap:8,
              padding:'10px 0', borderRadius:12,
              background:'var(--green)',
              color:'#000', fontWeight:700, fontSize:13,
              border:'none', cursor:'pointer',
              boxShadow:'0 2px 14px rgba(16,185,129,0.25)',
              transition:'all 0.15s'
            }}
            onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.1)'}
            onMouseLeave={e=>e.currentTarget.style.filter=''}
          >
            <Plus size={15}/> New Chat
          </button>
        </div>

        {/* Search */}
        <div style={{padding:'8px 10px', flexShrink:0}}>
          <div style={{
            display:'flex', alignItems:'center', gap:8,
            padding:'8px 12px', borderRadius:10,
            background:'var(--card)', border:'1px solid var(--border)'
          }}>
            <Search size={12} style={{color:'var(--text4)',flexShrink:0}}/>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              style={{
                flex:1, background:'transparent', border:'none',
                outline:'none', fontSize:12, color:'var(--text2)',
                minWidth:0
              }}
            />
          </div>
        </div>

        {/* Conversation list */}
        <div style={{flex:1, overflowY:'auto', padding:'4px 8px'}}>
          {filteredConversations.length === 0 ? (
            <div style={{
              display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', padding:'40px 0', gap:8
            }}>
              <MessageSquare size={18} style={{color:'var(--text4)'}}/>
              <span style={{fontSize:11,color:'var(--text4)'}}>No chats yet</span>
            </div>
          ) : filteredConversations.map((conv: any) => {
            const active = currentConversationId === conv.id;
            return (
              <button
                key={conv.id}
                onClick={() => { loadConversation(conv.id); if(window.innerWidth<1024) setSidebarOpen(false); }}
                style={{
                  width:'100%', display:'flex', alignItems:'center',
                  gap:10, padding:'9px 10px',
                  borderRadius:10, textAlign:'left',
                  marginBottom:2, border:'none', cursor:'pointer',
                  background: active ? 'rgba(16,185,129,0.08)' : 'transparent',
                  outline: active ? '1px solid rgba(16,185,129,0.2)' : '1px solid transparent',
                  transition:'all 0.15s',
                  position:'relative'
                }}
                className="group w-full flex items-center justify-between"
                onMouseEnter={e=>{ if(!active) e.currentTarget.style.background='var(--card)'; }}
                onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <MessageSquare size={12} style={{
                    color: active ? 'var(--green)' : 'var(--text4)',
                    flexShrink:0
                  }}/>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{
                      fontSize:12, fontWeight:500, color: active ? 'var(--text1)' : 'var(--text2)',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
                    }}>
                      {conv.title}
                    </div>
                    <div style={{fontSize:9,color:'var(--text4)',marginTop:2}}>
                      {getTimeAgo(conv.createdAt)}
                    </div>
                  </div>
                </div>
                <div
                  onClick={e=>{ e.stopPropagation(); deleteConversation(conv.id); }}
                  style={{
                    padding:'2px', border:'none', background:'transparent',
                    color:'var(--text4)', cursor:'pointer', borderRadius:4,
                    transition:'all 0.15s', flexShrink:0
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400"
                >
                  <X size={11}/>
                </div>
              </button>
            );
          })}
        </div>

        {/* User / Settings */}
        <div style={{padding:'8px', borderTop:'1px solid var(--border)', flexShrink:0}}>
          <button
            onClick={() => setSettingsOpen(true)}
            style={{
              width:'100%', display:'flex', alignItems:'center', gap:10,
              padding:'8px 10px', borderRadius:10,
              border:'none', background:'transparent', cursor:'pointer',
              transition:'all 0.15s'
            }}
            onMouseEnter={e=>e.currentTarget.style.background='var(--card)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            <div style={{
              width:32, height:32, borderRadius:'50%',
              background:'linear-gradient(135deg,#059669,#0d9488)',
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'#fff', fontSize:13, fontWeight:700, flexShrink:0
            }}>A</div>
            <div style={{flex:1, textAlign:'left', minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--text1)'}}>Awais</div>
              <div style={{fontSize:9,color:'var(--text4)'}}>
                {backendStatus === 'online'
                  ? <span style={{color:'var(--green)'}}>● Online</span>
                  : <span style={{color:'var(--red)'}}>● Offline</span>}
              </div>
            </div>
            <Settings size={13} style={{color:'var(--text4)'}}/>
          </button>
        </div>
      </aside>

      {/* ────────────────────── MAIN ────────────────────── */}
      <div style={{
        flex:1, display:'flex', flexDirection:'column',
        minWidth:0, overflow:'hidden',
        marginLeft:0
      }} className="lg:ml-[260px]">  

        {/* Header */}
        <header style={{
          height:52, display:'flex', alignItems:'center',
          justifyContent:'space-between', padding:'0 16px',
          background:'#0c0c0f',
          borderBottom:'1px solid var(--border)',
          flexShrink:0
        }}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                padding:'7px', borderRadius:8, border:'none',
                background:'transparent', color:'var(--text3)',
                cursor:'pointer', display:'flex'
              }}
            >
              <Menu size={17}/>
            </button>

            {/* Status pill */}
            <div style={{
              display:'flex', alignItems:'center', gap:6,
              padding:'4px 10px', borderRadius:99,
              fontSize:9, fontWeight:700,
              letterSpacing:'0.1em', textTransform:'uppercase',
              background: backendStatus==='online' ? 'rgba(16,185,129,0.1)' :
                          backendStatus==='offline' ? 'rgba(239,68,68,0.1)' : 'var(--card)',
              border: `1px solid ${backendStatus==='online' ? 'rgba(16,185,129,0.3)' :
                      backendStatus==='offline' ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
              color: backendStatus==='online' ? '#10b981' :
                     backendStatus==='offline' ? '#ef4444' : 'var(--text3)'
            }}>
              <div style={{
                width:6, height:6, borderRadius:'50%',
                background: backendStatus==='online' ? '#10b981' :
                            backendStatus==='offline' ? '#ef4444' : 'var(--text4)',
                animation: backendStatus==='checking' ? 'pulse 1.5s infinite' : 'none'
              }}/>
              <span style={{display:'none'}} className="sm:inline">
                {backendStatus==='online' ? 'Online' :
                 backendStatus==='offline' ? 'Offline' : '...'}
              </span>
            </div>

            {/* Mode toggle */}
            <button
              onClick={() => setAgentMode(!agentMode)}
              style={{
                display:'flex', alignItems:'center', gap:6,
                padding:'4px 12px', borderRadius:99,
                fontSize:10, fontWeight:700, border:'none', cursor:'pointer',
                background: agentMode ? 'rgba(16,185,129,0.1)' : 'var(--card)',
                color: agentMode ? '#10b981' : 'var(--text3)',
                outline: `1px solid ${agentMode ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                transition:'all 0.15s'
              }}
            >
              <span role="img" aria-label="mode">{agentMode ? '🤖' : '💬'}</span>
              {agentMode ? ' Agent' : ' Chat'}
            </button>
          </div>

          <button
            onClick={() => messages.length > 0 && exportConversation()}
            title="Export conversation"
            style={{
              padding:'7px', borderRadius:8, border:'none',
              background:'transparent',
              color: messages.length > 0 ? 'var(--text3)' : 'var(--text4)',
              cursor: messages.length > 0 ? 'pointer' : 'default', display:'flex'
            }}
          >
            <Download size={15}/>
          </button>
        </header>

        {/* ──── Messages area ──── */}
        <div style={{flex:1, overflowY:'auto', padding:'0 16px', position: 'relative'}}>
          <div style={{maxWidth:720, margin:'0 auto', padding:'24px 0'}}>

            {messages.length === 0 ? (
              /* Welcome screen */
              <div style={{
                minHeight:'calc(100dvh - 52px - 120px)',
                display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center',
                padding:'24px 0', gap:0
              }} className="fade-in">

                {/* Logo */}
                <div style={{position:'relative',marginBottom:24}}>
                  <div style={{
                    position:'absolute', inset:0,
                    background:'radial-gradient(circle,rgba(16,185,129,0.15) 0%,transparent 70%)',
                    transform:'scale(3)', filter:'blur(20px)',
                    pointerEvents:'none'
                  }}/>
                  <Logo size={52}/>
                </div>

                <h1 style={{
                  fontSize:28, fontWeight:900, color:'var(--text1)',
                  letterSpacing:'-0.6px', marginBottom:10, textAlign:'center'
                }}>
                  {agentMode ? 'What should I build?' : 'How can I help?'}
                </h1>

                <p style={{
                  fontSize:13, color:'var(--text3)',
                  textAlign:'center', marginBottom:36,
                  maxWidth:300, lineHeight:1.6
                }}>
                  {agentMode
                    ? 'I plan, code, test and deploy your idea autonomously.'
                    : 'Ask anything. I think carefully and answer clearly.'}
                </p>

                {/* Offline warning */}
                {backendStatus === 'offline' && (
                  <div style={{
                    display:'flex', gap:12, padding:'14px 16px',
                    background:'var(--red-bg)', borderRadius:14,
                    border:'1px solid var(--red-bd)',
                    marginBottom:24, width:'100%', maxWidth:420
                  }}>
                    <AlertCircle size={14} style={{color:'var(--red)',flexShrink:0,marginTop:1}}/>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:'#fca5a5',marginBottom:3}}>
                        Backend Offline
                      </div>
                      <div style={{fontSize:11,color:'rgba(252,165,165,0.7)',lineHeight:1.5}}>
                        Set <code style={{background:'rgba(239,68,68,0.15)',padding:'1px 5px',borderRadius:4,fontFamily:'monospace'}}>VITE_API_URL</code> to your backend URL.
                      </div>
                    </div>
                  </div>
                )}

                {/* Example cards */}
                <div style={{
                  display:'grid',
                  gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',
                  gap:10, width:'100%', maxWidth:440
                }}>
                  {[
                    {e:'⚡', t:'Build a React dashboard',   h:'Tailwind + live data'},
                    {e:'🐍', t:'Write a Python scraper',    h:'With rate limiting'},
                    {e:'🌐', t:'Create a landing page',     h:'HTML + CSS + animations'},
                    {e:'🔍', t:'Research any topic',        h:'Web search enabled'},
                  ].map((ex, i) => (
                    <button key={i}
                      onClick={() => backendStatus !== 'offline' && handleSendWithMessage(ex.t)}
                      className="fade-up"
                      style={{
                        animationDelay:`${i*60}ms`,
                        display:'flex', alignItems:'flex-start', gap:12,
                        padding:'14px', borderRadius:14, textAlign:'left',
                        background:'var(--card)',
                        border:'1px solid var(--border)',
                        cursor: backendStatus === 'offline' ? 'not-allowed' : 'pointer',
                        transition:'all 0.15s'
                      }}
                      onMouseEnter={e=>{
                        e.currentTarget.style.borderColor='rgba(16,185,129,0.25)';
                        e.currentTarget.style.background='var(--hover)';
                      }}
                      onMouseLeave={e=>{
                        e.currentTarget.style.borderColor='var(--border)';
                        e.currentTarget.style.background='var(--card)';
                      }}
                    >
                      <span style={{fontSize:20,lineHeight:1,flexShrink:0}}>{ex.e}</span>
                      <div style={{minWidth:0}}>
                        <div style={{
                          fontSize:12.5, fontWeight:500, color:'var(--text2)',
                          lineHeight:1.3, marginBottom:3
                        }}>{ex.t}</div>
                        <div style={{fontSize:10,color:'var(--text4)'}}>{ex.h}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

            ) : (
              /* Messages */
              <div style={{display:'flex',flexDirection:'column',gap:20}}>
                {messages.map((msg, i) => (
                  <div key={i}
                    className="fade-up"
                    style={{display:'flex', justifyContent: msg.role==='user' ? 'flex-end' : 'flex-start'}}>

                    {msg.role !== 'user' && (
                      <div style={{marginRight:10,marginTop:4,flexShrink:0}}>
                        <Logo size={26}/>
                      </div>
                    )}

                    <div style={{
                      maxWidth: msg.role==='user' ? '78%' : '82%',
                      minWidth:0
                    }}>
                      {msg.role !== 'user' && (
                        <div style={{
                          display:'flex', alignItems:'center', gap:8, marginBottom:6
                        }}>
                          <span style={{
                            fontSize:10, fontWeight:700, color:'var(--green)',
                            letterSpacing:'0.08em', textTransform:'uppercase'
                          }}>Zenox</span>
                          <span style={{
                            fontSize:9, color:'var(--text4)', fontFamily:'monospace'
                          }}>{backendModel}</span>
                        </div>
                      )}

                      <div style={{
                        padding:'12px 16px',
                        borderRadius: msg.role==='user'
                          ? '18px 18px 5px 18px'
                          : '5px 18px 18px 18px',
                        background: msg.role==='user'
                          ? 'linear-gradient(135deg,#1a2e24,#131e18)'
                          : 'var(--card)',
                        border: msg.role==='user'
                          ? '1px solid rgba(16,185,129,0.15)'
                          : '1px solid var(--border)',
                        fontSize:13.5, lineHeight:1.7,
                        color: msg.role==='system' ? 'var(--red)' : 'var(--text2)'
                      }}>
                        {msg.role === 'user'
                          ? <span style={{color:'var(--text1)'}}>{msg.content}</span>
                          : msg.role === 'system'
                          ? <span style={{fontFamily:'monospace',fontSize:12}}>{msg.content}</span>
                          : <div className="prose"><Markdown>{msg.content}</Markdown></div>
                        }
                      </div>

                      <div style={{
                        display:'flex', alignItems:'center', gap:4,
                        marginTop:5,
                        justifyContent: msg.role==='user' ? 'flex-end' : 'flex-start'
                      }}>
                        <span style={{fontSize:9,color:'var(--text4)'}}>{formatTime(msg.timestamp)}</span>
                        {msg.role !== 'user' && (
                          <button
                            onClick={() => copyMessage(msg.content, i)}
                            style={{
                              display:'flex', alignItems:'center', gap:4,
                              padding:'2px 8px', borderRadius:6,
                              border:'none', background:'transparent',
                              color:'var(--text4)', cursor:'pointer',
                              fontSize:10, transition:'color 0.15s'
                            }}
                            onMouseEnter={e=>e.currentTarget.style.color='var(--text2)'}
                            onMouseLeave={e=>e.currentTarget.style.color='var(--text4)'}
                          >
                            {copiedIndex===i ? <Check size={10}/> : <Copy size={10}/>}
                            {copiedIndex===i ? 'Copied' : 'Copy'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Thinking indicator */}
                {(msgStatus==='thinking'||msgStatus==='sending') && (
                  <div style={{display:'flex',alignItems:'flex-start',gap:10}} className="fade-in">
                    <Logo size={26}/>
                    <div style={{
                      padding:'14px 18px',
                      background:'var(--card)',
                      border:'1px solid var(--border)',
                      borderRadius:'5px 18px 18px 18px',
                      display:'flex', alignItems:'center', gap:10
                    }}>
                      <div style={{display:'flex',gap:5,alignItems:'center'}}>
                        <div className="dot"/>
                        <div className="dot"/>
                        <div className="dot"/>
                      </div>
                      <span style={{fontSize:11,color:'var(--text3)'}}>
                        {msgStatus==='thinking' ? 'Thinking...' : 'Sending...'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Project result card */}
                {lastProject && agentMode && (
                  <div className="fade-up" style={{
                    padding:'20px',
                    borderRadius:18,
                    background: lastProject.language==='research'
                      ? 'linear-gradient(135deg,rgba(59,130,246,0.07),rgba(37,99,235,0.04))'
                      : 'linear-gradient(135deg,rgba(16,185,129,0.07),rgba(5,150,105,0.04))',
                    border:`1px solid ${lastProject.language==='research'
                      ? 'rgba(59,130,246,0.25)' : 'rgba(16,185,129,0.25)'}`
                  }}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                      <div style={{
                        width:20,height:20,borderRadius:'50%',
                        background:'rgba(16,185,129,0.15)',
                        display:'flex',alignItems:'center',justifyContent:'center'
                      }}>
                        <Check size={11} style={{color:'var(--green)'}}/>
                      </div>
                      <span style={{
                        fontSize:10,fontWeight:700,color:'var(--green)',
                        textTransform:'uppercase',letterSpacing:'0.1em'
                      }}>
                        {lastProject.deploy_url ? 'Deployed' :
                         lastProject.repo_url ? 'Saved to GitHub' : 'Complete'}
                      </span>
                      {lastProject.iterations > 1 && (
                        <span style={{
                          marginLeft:'auto',fontSize:9,
                          color:'var(--text4)',fontFamily:'monospace'
                        }}>
                          {lastProject.iterations}x self-corrected
                        </span>
                      )}
                    </div>

                    <p style={{
                      fontSize:13,color:'var(--text2)',
                      marginBottom:14,fontWeight:500,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'
                    }}>
                      {lastProject.prompt}
                    </p>

                    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                      {lastProject.code && lastProject.language !== 'research' && (
                        <button onClick={() => {
                          const ext = lastProject.language==='html'?'html':
                                      lastProject.language==='python'?'py':'js';
                          const blob = new Blob([lastProject.code],{type:'text/plain'});
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href=url; a.download=`zenox-project.${ext}`; a.click();
                          URL.revokeObjectURL(url);
                          showToast('Downloaded', 'success');
                        }} style={{
                          flex:1, display:'flex', alignItems:'center',
                          justifyContent:'center', gap:6,
                          padding:'10px 20px', borderRadius:12,
                          background:'var(--green)', color:'#000',
                          fontWeight:700, fontSize:13, border:'none',
                          cursor:'pointer',
                          boxShadow:'0 2px 12px rgba(16,185,129,0.25)',
                          transition:'all 0.15s'
                        }}
                        onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.1)'}
                        onMouseLeave={e=>e.currentTarget.style.filter=''}
                        >
                          <Download size={14}/> Download Code
                        </button>
                      )}
                      {lastProject.repo_url && (
                        <a href={lastProject.repo_url} target="_blank" rel="noreferrer"
                          style={{
                            padding:'10px 16px', borderRadius:12, fontSize:12,
                            fontWeight:500, textDecoration:'none',
                            background:'var(--card)',
                            border:'1px solid var(--border)',
                            color:'var(--text2)', transition:'color 0.15s'
                          }}
                          onMouseEnter={e=>e.currentTarget.style.color='var(--text1)'}
                          onMouseLeave={e=>e.currentTarget.style.color='var(--text2)'}
                        >
                          GitHub →
                        </a>
                      )}
                    </div>

                    {lastProject.language === 'research' && lastProject.code && (
                      <div style={{marginTop:16, paddingTop:16, borderTop:'1px solid rgba(255,255,255,0.05)'}}>
                        <p style={{fontSize:9, fontWeight:'bold', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8, color:'#888'}}>
                          Research Report
                        </p>
                        <div className="prose prose-invert max-w-none text-[#ccc] text-[13.5px]" style={{maxHeight:300, overflowY:'auto'}}>
                          <Markdown>{lastProject.code}</Markdown>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ──── Input bar ──── */}
        <div style={{
          padding:'10px 16px 14px',
          background:'#0c0c0f',
          borderTop:'1px solid var(--border)',
          flexShrink:0
        }}>
          <div style={{maxWidth:720, margin:'0 auto'}}>

            {/* Attachments */}
            {(imagePreview || fileContent || isListening) && (
              <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:8}}>
                {imagePreview && (
                  <div style={{
                    display:'flex',alignItems:'center',gap:6,
                    padding:'5px 10px', borderRadius:8,
                    background:'var(--card)', border:'1px solid var(--border)'
                  }}>
                    <img src={imagePreview} style={{width:18,height:18,objectFit:'cover',borderRadius:4}}/>
                    <span style={{fontSize:11,color:'var(--text2)'}}>Image</span>
                    <button onClick={() => setImagePreview(null)} style={{
                      border:'none',background:'transparent',
                      color:'var(--text4)',cursor:'pointer',fontSize:12
                    }}>×</button>
                  </div>
                )}
                {fileContent && (
                  <div style={{
                    display:'flex',alignItems:'center',gap:6,
                    padding:'5px 10px', borderRadius:8,
                    background:'var(--card)', border:'1px solid var(--border)'
                  }}>
                    <FileText size={11} style={{color:'var(--green)'}}/>
                    <span style={{fontSize:11,color:'var(--text2)',maxWidth:100,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {fileContent.name}
                    </span>
                    <button onClick={() => setFileContent(null)} style={{
                      border:'none',background:'transparent',
                      color:'var(--text4)',cursor:'pointer',fontSize:12
                    }}>×</button>
                  </div>
                )}
                {isListening && (
                  <div style={{
                    display:'flex',alignItems:'center',gap:6,
                    padding:'5px 12px', borderRadius:99,
                    background:'var(--red-bg)', border:'1px solid var(--red-bd)',
                    color:'var(--red)', fontSize:10, fontWeight:500
                  }}>
                    <div style={{width:6,height:6,borderRadius:'50%',
                      background:'var(--red)',animation:'pulse 1s infinite'}}/>
                    Listening...
                  </div>
                )}
              </div>
            )}

            {/* Status */}
            {msgStatus !== 'idle' && (
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                <div style={{
                  width:6, height:6, borderRadius:'50%',
                  background: msgStatus==='sending' ? '#facc15' :
                              msgStatus==='thinking' ? '#3b82f6' : 'var(--green)',
                  animation:'pulse 1.2s infinite'
                }}/>
                <span style={{fontSize:10,color:'var(--text4)'}}>
                  {msgStatus==='sending' ? 'Sending...' :
                   msgStatus==='thinking' ? 'Zenox is thinking...' :
                   'Writing response...'}
                </span>
              </div>
            )}

            {/* Main input */}
            <div style={{
              display:'flex', alignItems:'flex-end', gap:8,
              padding:'10px 12px',
              borderRadius:16,
              background:'var(--card)',
              border: inputValue.length > 0
                ? '1px solid rgba(16,185,129,0.25)'
                : '1px solid var(--border)',
              boxShadow: inputValue.length > 0
                ? '0 0 0 3px rgba(16,185,129,0.05)'
                : 'none',
              transition:'all 0.2s'
            }}>
              {/* Tool buttons */}
              <div style={{display:'flex',gap:2,alignSelf:'flex-end',paddingBottom:2}}>
                {[
                  {icon:<ImageIcon size={15}/>, onClick:()=>imageInputRef.current?.click(), title:'Image', active: false},
                  {icon:<FileText size={15}/>, onClick:()=>fileInputRef.current?.click(), title:'File', active: false},
                  {icon: isListening ? <MicOff size={15}/> : <Mic size={15}/>,
                   onClick: realToggleVoice, title:'Voice',
                   active: isListening},
                ].map((btn,i)=>(
                  <button key={i} onClick={btn.onClick} title={btn.title}
                    style={{
                      padding:'6px', borderRadius:8, border:'none',
                      background: btn.active ? 'var(--red-bg)' : 'transparent',
                      color: btn.active ? 'var(--red)' : 'var(--text4)',
                      cursor:'pointer', display:'flex', transition:'color 0.15s'
                    }}
                    onMouseEnter={e=>{ if(!btn.active) e.currentTarget.style.color='var(--text2)'; }}
                    onMouseLeave={e=>{ if(!btn.active) e.currentTarget.style.color='var(--text4)'; }}
                  >
                    {btn.icon}
                  </button>
                ))}
              </div>

              {/* Textarea */}
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  backendStatus==='offline' ? 'Backend offline...' :
                  agentMode ? 'Tell Zenox what to build...' :
                  'Ask Zenox anything...'
                }
                rows={1}
                disabled={isLoading || backendStatus==='offline' || backendStatus==='checking'}
                style={{
                  flex:1, resize:'none', border:'none', outline:'none',
                  background:'transparent', fontSize:13.5,
                  color:'var(--text1)', lineHeight:1.5,
                  minHeight:22, maxHeight:140,
                  fontFamily:'inherit', padding:'2px 0'
                }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 140) + 'px';
                }}
              />

              {/* Send/Stop */}
              <div style={{alignSelf:'flex-end',paddingBottom:2}}>
                {isLoading ? (
                  <button onClick={stopGeneration} style={{
                    width:32, height:32, borderRadius:10,
                    border:'1px solid var(--red-bd)',
                    background:'var(--red-bg)', color:'var(--red)',
                    cursor:'pointer', display:'flex',
                    alignItems:'center', justifyContent:'center'
                  }}>
                    <Square size={12} fill="currentColor"/>
                  </button>
                ) : (
                  <button
                    onClick={() => handleSendWithMessage(inputValue)}
                    disabled={!inputValue.trim() || isLoading ||
                              backendStatus==='offline' || backendStatus==='checking'}
                    style={{
                      width:32, height:32, borderRadius:10, border:'none',
                      cursor: (inputValue.trim() && backendStatus==='online')
                        ? 'pointer' : 'not-allowed',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      background: (inputValue.trim() && backendStatus==='online')
                        ? 'var(--green)' : 'var(--card)',
                      color: (inputValue.trim() && backendStatus==='online')
                        ? '#000' : 'var(--text4)',
                      boxShadow: (inputValue.trim() && backendStatus==='online')
                        ? '0 2px 10px rgba(16,185,129,0.3)' : 'none',
                      transition:'all 0.15s'
                    }}
                  >
                    <ArrowUp size={15} strokeWidth={2.5}/>
                  </button>
                )}
              </div>
            </div>

            {/* Hint */}
            <div style={{
              display:'flex', justifyContent:'space-between',
              marginTop:6, padding:'0 2px'
            }}>
              <span style={{fontSize:9,color:'var(--text4)'}}>
                Enter to send · Shift+Enter for new line
              </span>
              {inputValue.length > 100 && (
                <span style={{
                  fontSize:9, fontFamily:'monospace',
                  color: inputValue.length > 3000 ? 'var(--red)' : 'var(--text4)'
                }}>
                  {inputValue.length.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ────── SETTINGS MODAL ────── */}
      {settingsOpen && (
        <div
          onClick={() => setSettingsOpen(false)}
          style={{
            position:'fixed', inset:0, zIndex:2000,
            display:'flex', alignItems:'center', justifyContent:'center',
            padding:16, background:'rgba(0,0,0,0.75)',
            backdropFilter:'blur(8px)'
          }} className="fade-in">
          <div
            onClick={e => e.stopPropagation()}
            className="fade-up"
            style={{
              width:'100%', maxWidth:360,
              background:'var(--surface)',
              border:'1px solid var(--border2)',
              borderRadius:20, padding:24,
              boxShadow:'0 25px 60px rgba(0,0,0,0.6)'
            }}>

            {/* Header */}
            <div style={{
              display:'flex', alignItems:'center',
              justifyContent:'space-between', marginBottom:24
            }}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <Logo size={26}/>
                <span style={{fontSize:15,fontWeight:700,color:'var(--text1)'}}>
                  Settings
                </span>
              </div>
              <button onClick={() => setSettingsOpen(false)} style={{
                padding:'6px', borderRadius:8, border:'none',
                background:'transparent', color:'var(--text3)',
                cursor:'pointer', display:'flex'
              }}>
                <X size={15}/>
              </button>
            </div>

            {/* Mode */}
            <div style={{marginBottom:20}}>
              <div style={{
                fontSize:9, fontWeight:700, color:'var(--text4)',
                textTransform:'uppercase', letterSpacing:'0.15em', marginBottom:10
              }}>AI Mode</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {[{v:false,e:'💬',l:'Chat'},{v:true,e:'🤖',l:'Agent'}].map(m=>(
                  <button key={String(m.v)} onClick={() => setAgentMode(m.v)} style={{
                    padding:'11px', borderRadius:12, border:'none',
                    cursor:'pointer', fontSize:13, fontWeight:600,
                    display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    background: agentMode===m.v ? 'var(--green-bg)' : 'var(--card)',
                    color: agentMode===m.v ? 'var(--green)' : 'var(--text3)',
                    outline: `1px solid ${agentMode===m.v ? 'var(--green-bd)' : 'var(--border)'}`,
                    transition:'all 0.15s'
                  }}>
                    {m.e} {m.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={{borderTop:'1px solid var(--border)',marginBottom:20}}/>

            {/* Status */}
            <div style={{marginBottom:20}}>
              <div style={{
                fontSize:9, fontWeight:700, color:'var(--text4)',
                textTransform:'uppercase', letterSpacing:'0.15em', marginBottom:12
              }}>Status</div>
              {[
                ['Version', 'v17.0', 'var(--text1)'],
                ['Built by', 'Awais', 'var(--green)'],
                ['Backend', backendStatus==='online' ? 'Connected' : 'Offline',
                  backendStatus==='online' ? 'var(--green)' : 'var(--red)'],
                ['Model', backendModel, 'var(--text3)'],
              ].map(([k,v,c]) => (
                <div key={k} style={{
                  display:'flex', justifyContent:'space-between',
                  alignItems:'center', padding:'6px 0',
                  borderBottom:'1px solid var(--border)'
                }}>
                  <span style={{fontSize:12,color:'var(--text3)'}}>{k}</span>
                  <span style={{
                    fontSize:12, color: c || 'var(--text1)',
                    fontWeight: k==='Built by' ? 600 : 400,
                    fontFamily: k==='Model'||k==='Version' ? 'monospace' : 'inherit',
                    maxWidth:160, overflow:'hidden',
                    textOverflow:'ellipsis', whiteSpace:'nowrap'
                  }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Clear button */}
            <button
              onClick={() => {
                if (confirm('Clear all conversations?')) {
                  setConversations([]); startNewChat();
                  setSettingsOpen(false); showToast('All chats cleared');
                }
              }}
              style={{
                width:'100%', padding:'11px', borderRadius:12,
                border:'1px solid rgba(239,68,68,0.25)',
                background:'var(--red-bg)', color:'var(--red)',
                fontSize:12, fontWeight:600, cursor:'pointer',
                transition:'all 0.15s'
              }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,0.15)'}
              onMouseLeave={e=>e.currentTarget.style.background='var(--red-bg)'}>
              Clear All Conversations
            </button>
          </div>
        </div>
      )}

      {/* ────── TOAST ────── */}
      {toast && (
        <div style={{
          position:'fixed', bottom:24, left:'50%',
          transform:'translateX(-50%)', zIndex:3000,
          pointerEvents:'none'
        }} className="fade-up">
          <div style={{
            display:'flex', alignItems:'center', gap:8,
            padding:'10px 18px', borderRadius:12, fontSize:12, fontWeight:500,
            backdropFilter:'blur(16px)',
            background: toast.type==='success'
              ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${toast.type==='success'
              ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: toast.type==='success' ? '#6ee7b7' : '#fca5a5',
            boxShadow:'0 8px 32px rgba(0,0,0,0.3)'
          }}>
            {toast.type==='success' ? <Check size={13}/> : <AlertCircle size={13}/>}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
