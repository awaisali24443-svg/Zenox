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

  const toggleVoiceInput = () => setIsListening(!isListening);
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
    const diff = Math.floor((Date.now() - timestamp) / 60000); // in minutes
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
      <div className="prose prose-invert prose-p:my-2 prose-pre:bg-[#0a0a0a] prose-pre:border prose-pre:border-[#2a2a2a] max-w-none text-[#ccc] text-[13.5px]">
        <Markdown>{content}</Markdown>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#080808] text-[#F0F0F0] overflow-hidden font-sans antialiased">
      <SidebarCmp 
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        startNewChat={startNewChat}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filteredConversations={filteredConversations}
        currentConversationId={currentConversationId}
        loadConversation={loadConversation}
        deleteConversation={deleteConversation}
        getTimeAgo={getTimeAgo}
        setSettingsOpen={setSettingsOpen}
      />
      
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        <header className="h-[52px] bg-[#0a0a0a] border-b 
          border-[rgba(255,255,255,0.05)] flex items-center 
          justify-between px-4 flex-shrink-0">
          
          <div className="flex items-center gap-2.5">
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-[8px] text-[#444] 
                hover:text-[#888] hover:bg-[rgba(255,255,255,0.05)] transition-all">
              <Menu size={16}/>
            </button>
            
            {/* Backend status */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 
              rounded-full text-[9px] font-bold uppercase tracking-wider
              border transition-all ${
              backendStatus === 'online'
                ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400'
                : backendStatus === 'offline'
                ? 'bg-red-500/8 border-red-500/20 text-red-400'
                : 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)] text-[#444]'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                backendStatus==='online' ? 'bg-emerald-400 animate-pulse' :
                backendStatus==='offline' ? 'bg-red-400' : 'bg-[#333] animate-pulse'
              }`}/>
              <span className="hidden sm:inline">
                {backendStatus==='online' ? 'Online' : backendStatus==='offline' ? 'Offline' : '...'}
              </span>
            </div>
            
            {/* Agent mode toggle */}
            <button onClick={() => setAgentMode(!agentMode)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full
                text-[10px] font-bold border transition-all ${
                agentMode
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)] text-[#444] hover:text-[#888]'
              }`}>
              <span>{agentMode ? '🤖' : '💬'}</span>
              {agentMode ? 'Agent' : 'Chat'}
            </button>
          </div>
          
          <button onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className={`p-2 rounded-[8px] transition-all ${
            rightPanelOpen ? 'bg-[rgba(255,255,255,0.08)] text-[#888]' : 'text-[#2a2a2a] hover:text-[#666]'
          }`}>
            <Layout size={16}/>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 md:px-12 w-full mx-auto max-w-4xl py-6 flex flex-col gap-6 relative">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center
              px-6 py-12 fade-in">
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-emerald-500/5 blur-3xl rounded-full scale-150"/>
                <ZenoxLogo size={56}/>
              </div>
              <h1 className="text-[28px] font-black text-white tracking-[-0.6px] mb-3 text-center">
                What should I build?
              </h1>
              <p className="text-[13px] text-[#3a3a3a] mb-10 text-center max-w-[320px] leading-relaxed">
                {agentMode 
                  ? 'Agent mode on — I will plan, code, test, and deploy for you.'
                  : 'Ask me anything. I think, search, and answer clearly.'}
              </p>
              {backendStatus === 'offline' && (
                <div className="w-full max-w-md mb-6 flex items-start gap-3 p-4
                  bg-red-500/5 border border-red-500/15 rounded-[14px]">
                  <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5"/>
                  <div>
                    <p className="text-[12px] font-semibold text-red-300 mb-0.5">Backend Offline</p>
                    <p className="text-[11px] text-red-400/70 leading-relaxed">
                      Set <code className="bg-red-900/30 px-1 rounded font-mono">VITE_API_URL</code> in 
                      your environment variables.
                    </p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-[440px]">
                {[
                  {e:'⚡',t:'Build a React dashboard',h:'With Tailwind + live data'},
                  {e:'🐍',t:'Write a Python scraper',h:'With rate limiting'},
                  {e:'🌐',t:'Create a landing page',h:'HTML + CSS + animations'},
                  {e:'🔍',t:'Research any topic',h:'With web search enabled'},
                ].map((ex,i) => (
                  <button key={i}
                    style={{animationDelay:`${i*60}ms`}}
                    onClick={() => { if(backendStatus!=='offline') handleSendWithMessage(ex.t); }}
                    className="group flex items-start gap-3 p-4 rounded-[14px] text-left
                      bg-[#111] border border-[rgba(255,255,255,0.06)]
                      hover:border-[rgba(16,185,129,0.2)] hover:bg-[#141414]
                      transition-all fade-up">
                    <span className="text-xl leading-none flex-shrink-0">{ex.e}</span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] text-[#777] group-hover:text-[#ccc] 
                        font-medium transition-colors leading-snug">
                        {ex.t}
                      </p>
                      <p className="text-[10px] text-[#2a2a2a] mt-0.5 group-hover:text-[#3a3a3a]
                        transition-colors">
                        {ex.h}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => msg.role === 'user' ? (
                <div key={i} className="flex justify-end fade-up">
                  <div className="max-w-[75%]">
                    <div className="px-4 py-3 rounded-[16px] rounded-br-[5px]
                      bg-gradient-to-br from-[#1c2920] to-[#131a13]
                      border border-emerald-900/25
                      text-[13.5px] text-[#ddd] leading-[1.65]">
                      {msg.content}
                    </div>
                    <p className="text-[9px] text-[#222] text-right mt-1 pr-1">
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex items-start gap-3 fade-up group">
                  <ZenoxLogo size={26}/>
                  <div className="flex-1 min-w-0 max-w-[80%]">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-bold text-emerald-500 tracking-wider">ZENOX</span>
                      <span className="text-[9px] text-[#1f1f1f] font-mono">{backendModel}</span>
                    </div>
                    <div className="px-4 py-3 rounded-[16px] rounded-tl-[5px]
                      bg-[#111] border border-[rgba(255,255,255,0.06)]
                      text-[13.5px] text-[#ccc] leading-[1.7]">
                      {msg.role === 'system' ? <span className="text-red-400 font-mono text-[12px]">{msg.content}</span> : renderMarkdown(msg.content)}
                    </div>
                    <div className="flex items-center gap-1 mt-1.5
                      opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => copyMessage(msg.content, i)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg
                          text-[10px] text-[#2a2a2a] hover:text-[#666]
                          hover:bg-[rgba(255,255,255,0.04)] transition-all">
                        {copiedIndex===i ? <Check size={10}/> : <Copy size={10}/>}
                        {copiedIndex===i ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {msgStatus === 'thinking' && (
                <div className="flex items-start gap-3 fade-in">
                  <ZenoxLogo size={26}/>
                  <div className="px-4 py-3.5 rounded-[16px] rounded-tl-[5px]
                    bg-[#111] border border-[rgba(255,255,255,0.06)] max-w-[180px]">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {[0,150,300].map(d => (
                          <div key={d} style={{animationDelay:`${d}ms`, animation:'pulse-dot 1.2s ease infinite'} as any}
                            className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
                        ))}
                      </div>
                      <span className="text-[11px] text-[#444]">
                        {msgStatus==='thinking' ? 'Thinking...' : 'Writing...'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              
              {lastProject && agentMode && (
                <div className="mb-4 p-4 rounded-[18px] fade-up
                  bg-gradient-to-b from-[#0d1a10] to-[#0a0f0a]
                  border border-emerald-900/25">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 
                      flex items-center justify-center">
                      <Check size={11} className="text-emerald-400"/>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                      {lastProject.deploy_url ? 'Deployed' : 
                       lastProject.repo_url ? 'Saved to GitHub' : 'Complete'}
                    </span>
                  </div>
                  
                  <p className="text-[12.5px] text-[#888] mb-3 truncate font-medium">
                    {lastProject.prompt}
                  </p>
                  
                  <div className="flex flex-wrap gap-2">
                    {lastProject.code && (
                      <button onClick={() => {
                        const ext = lastProject.language==='html'?'html':
                                    lastProject.language==='python'?'py':'js';
                        const blob = new Blob([lastProject.code],{type:'text/plain'});
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href=url; a.download=`zenox-project.${ext}`; a.click();
                        URL.revokeObjectURL(url);
                        showToast('Code downloaded','success');
                      }}
                        className="flex-1 py-2.5 text-[12px] font-bold
                          bg-emerald-600 hover:bg-emerald-500 text-white
                          rounded-[10px] transition-all flex items-center 
                          justify-center gap-1.5
                          shadow-[0_2px_12px_rgba(16,185,129,0.2)]">
                        <Download size={13}/>
                        Download Code
                      </button>
                    )}
                    {lastProject.repo_url && (
                      <a href={lastProject.repo_url} target="_blank" rel="noreferrer"
                        className="px-3 py-2.5 text-[11px] font-medium
                          bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]
                          text-[#666] hover:text-[#ccc] rounded-[10px] transition-all">
                        GitHub →
                      </a>
                    )}
                    {lastProject.deploy_url?.startsWith('http') && (
                      <a href={lastProject.deploy_url} target="_blank" rel="noreferrer"
                        className="px-3 py-2.5 text-[11px] font-medium
                          bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]
                          text-[#666] hover:text-emerald-400 rounded-[10px] transition-all">
                        Live →
                      </a>
                    )}
                  </div>
                  
                  {lastProject.iterations > 1 && (
                    <p className="text-[9px] text-[#2a2a2a] mt-2.5 font-mono">
                      Self-corrected {lastProject.iterations}x · Quality: {lastProject.quality}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 pb-4 pt-3 bg-[#0a0a0a] border-t border-[rgba(255,255,255,0.05)] flex-shrink-0 w-full max-w-4xl mx-auto md:bg-transparent md:border-transparent">
          {(imagePreview || uploadedFile || isListening) && (
            <div className="flex items-center gap-2 mb-2">
              {imagePreview && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-[8px]
                  bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
                  <img src={imagePreview} className="w-5 h-5 object-cover rounded-md" alt="preview"/>
                  <span className="text-[10px] text-[#555]">Image</span>
                  <button onClick={removeImage} className="text-[#333] hover:text-red-400 ml-0.5">
                    <X size={10}/>
                  </button>
                </div>
              )}
              {isListening && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
                  bg-red-500/10 border border-red-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping"/>
                  <span className="text-[10px] text-red-400 font-medium">Listening...</span>
                </div>
              )}
            </div>
          )}
          
          {msgStatus !== 'idle' && (
            <div className="flex items-center gap-1.5 mb-2">
              <div className={`w-1.5 h-1.5 rounded-full ${
                msgStatus==='sending'   ? 'bg-yellow-400 animate-pulse' :
                msgStatus==='thinking'  ? 'bg-blue-400 animate-ping' :
                                          'bg-emerald-400 animate-pulse'
              }`}/>
              <span className="text-[10px] text-[#333]">
                {msgStatus==='sending'   ? 'Sending...' :
                 msgStatus==='thinking'  ? 'Zenox is thinking...' :
                                           'Writing response...'}
              </span>
            </div>
          )}
          
          <div className={`flex items-end gap-2 px-3 py-3 rounded-[14px]
            bg-[#111] transition-all duration-200 shadow-xl ${
            inputValue.length > 0
              ? 'border border-emerald-500/20 shadow-[0_0_0_3px_rgba(16,185,129,0.04)]'
              : 'border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.11)]'
          }`}>
            
            <div className="flex items-center gap-0.5 self-end pb-0.5">
              <button onClick={() => imageInputRef.current?.click()}
                className="p-1.5 rounded-[7px] text-[#222]
                  hover:text-[#666] hover:bg-[rgba(255,255,255,0.05)] transition-all"
                title="Attach image">
                <ImageIcon size={15}/>
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="p-1.5 rounded-[7px] text-[#222]
                  hover:text-[#666] hover:bg-[rgba(255,255,255,0.05)] transition-all"
                title="Attach file">
                <FileText size={15}/>
              </button>
              <button onClick={toggleVoiceInput}
                className={`p-1.5 rounded-[7px] transition-all ${
                isListening 
                  ? 'text-red-400 bg-red-500/10' 
                  : 'text-[#222] hover:text-[#666] hover:bg-[rgba(255,255,255,0.05)]'
              }`} title="Voice input">
                {isListening ? <MicOff size={15}/> : <Mic size={15}/>}
              </button>
            </div>
            
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={e => { setInputValue(e.target.value); setSuggestions([]); }}
              onKeyDown={handleKeyDown}
              placeholder={
                backendStatus==='offline' ? 'Backend offline...' :
                agentMode ? 'Tell Zenox what to build...' :
                'Ask Zenox anything...'
              }
              rows={1}
              disabled={isLoading || backendStatus==='offline' || backendStatus==='checking'}
              style={{resize:'none', maxHeight:'120px'}}
              className="flex-1 bg-transparent text-[13.5px] text-[#e0e0e0]
                placeholder:text-[#2a2a2a] outline-none leading-[1.5]
                disabled:opacity-40 min-h-[22px] py-0.5"
              onInput={e => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
            
            <div className="self-end pb-0.5">
              {isLoading ? (
                <button onClick={stopGeneration}
                  className="w-8 h-8 flex items-center justify-center rounded-[9px]
                    bg-red-500/10 border border-red-500/20 text-red-400
                    hover:bg-red-500/20 transition-all">
                  <Square size={13} fill="currentColor"/>
                </button>
              ) : (
                <button
                  onClick={() => handleSendWithMessage(inputValue)}
                  disabled={!inputValue.trim() || isLoading || 
                            backendStatus==='offline' || backendStatus==='checking'}
                  className={`w-8 h-8 flex items-center justify-center 
                    rounded-[9px] transition-all active:scale-95 ${
                    inputValue.trim() && backendStatus==='online'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.25)]'
                      : 'bg-[rgba(255,255,255,0.04)] text-[#222] cursor-not-allowed'
                  }`}>
                  <ArrowUp size={15} strokeWidth={2.5}/>
                </button>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between mt-2 px-0.5">
            <span className="text-[9px] text-[#1a1a1a]">
              Enter to send · Shift+Enter for new line
            </span>
            {inputValue.length > 100 && (
              <span className={`text-[9px] font-mono ${
                inputValue.length > 3000 ? 'text-red-400/70' : 'text-[#1a1a1a]'
              }`}>
                {inputValue.length.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000]
          pointer-events-none fade-up">
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-[12px]
            text-[12px] font-medium shadow-2xl border backdrop-blur-xl ${
            toast.type==='success' 
              ? 'bg-emerald-950/90 border-emerald-700/30 text-emerald-200'
              : toast.type==='error'
              ? 'bg-red-950/90 border-red-700/30 text-red-200'
              : 'bg-[#181818]/95 border-[rgba(255,255,255,0.1)] text-[#ccc]'
          }`}>
            {toast.type==='success' && <Check size={12} className="text-emerald-400"/>}
            {toast.type==='error' && <AlertCircle size={12} className="text-red-400"/>}
            {toast.msg}
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-[2000] flex items-end sm:items-center 
          justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setSettingsOpen(false)}>
          <div className="bg-[#111] border border-[rgba(255,255,255,0.08)] 
            rounded-[20px] w-full max-w-sm p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[15px] font-bold text-white">Settings</h2>
              <button onClick={() => setSettingsOpen(false)}
                className="p-1.5 rounded-lg text-[#444] hover:text-white
                  hover:bg-[rgba(255,255,255,0.06)] transition-all">
                <X size={15}/>
              </button>
            </div>
            
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-bold text-[#444] uppercase 
                  tracking-widest mb-3">AI Mode</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setAgentMode(false)}
                    className={`py-2.5 rounded-[10px] text-[12px] font-semibold
                      border transition-all ${!agentMode 
                        ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300' 
                        : 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-[#555]'}`}>
                    💬 Chat
                  </button>
                  <button onClick={() => setAgentMode(true)}
                    className={`py-2.5 rounded-[10px] text-[12px] font-semibold
                      border transition-all ${agentMode 
                        ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300' 
                        : 'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-[#555]'}`}>
                    🤖 Agent
                  </button>
                </div>
              </div>
              
              <div className="border-t border-[rgba(255,255,255,0.05)] pt-5">
                <p className="text-[10px] font-bold text-[#444] uppercase 
                  tracking-widest mb-3">About</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[12px] text-[#555]">Version</span>
                    <span className="text-[12px] text-[#888] font-mono">v16.0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[12px] text-[#555]">Built by</span>
                    <span className="text-[12px] text-emerald-400 font-semibold">Awais</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[12px] text-[#555]">Backend</span>
                    <span className={`text-[12px] font-semibold ${
                      backendStatus==='online' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {backendStatus==='online' ? 'Connected' : 'Offline'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[12px] text-[#555]">Model</span>
                    <span className="text-[12px] text-[#666] font-mono text-right max-w-[140px] truncate">
                      {backendModel}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="border-t border-[rgba(255,255,255,0.05)] pt-5">
                <button
                  onClick={() => {
                    if (confirm('Clear all conversations? This cannot be undone.')) {
                      setConversations([]);
                      startNewChat();
                      setSettingsOpen(false);
                      showToast('All chats cleared');
                    }
                  }}
                  className="w-full py-2.5 text-[12px] font-semibold text-red-400
                    border border-red-900/40 rounded-[10px] hover:bg-red-900/20
                    transition-all">
                  Clear All Conversations
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarCmp({
  sidebarOpen, setSidebarOpen, startNewChat, searchQuery, setSearchQuery,
  filteredConversations, currentConversationId, loadConversation, deleteConversation,
  getTimeAgo, setSettingsOpen
}: any) {
  return (
    <aside className={`
      fixed lg:static inset-y-0 left-0 z-40
      flex flex-col w-[260px] 
      bg-[#0a0a0a] border-r border-[rgba(255,255,255,0.05)]
      transition-transform duration-300 ease-out
      ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
    `}>
      
      <div className="flex items-center justify-between px-4 py-4
        border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <ZenoxLogo size={32}/>
          <div>
            <p className="text-[15px] font-bold text-white tracking-tight">
              Zenox
            </p>
            <p className="text-[9px] text-[#333] uppercase tracking-[0.12em] font-medium">
              by awais
            </p>
          </div>
        </div>
        <button onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-[#333] 
            hover:text-[#888] hover:bg-[rgba(255,255,255,0.05)] transition-all">
          <X size={15}/>
        </button>
      </div>
      
      <div className="p-3 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <button onClick={startNewChat}
          className="w-full flex items-center justify-center gap-2
            py-2.5 rounded-[12px] text-[13px] font-semibold
            bg-emerald-600/90 hover:bg-emerald-500 text-white
            transition-all active:scale-[0.98]
            shadow-[0_2px_12px_rgba(16,185,129,0.2)]">
          <Plus size={15}/>
          New Chat
        </button>
      </div>
      
      <div className="px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 rounded-[10px]
          bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
          <Search size={12} className="text-[#333] flex-shrink-0"/>
          <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
            placeholder="Search chats..." 
            className="flex-1 bg-transparent text-[12px] text-[#888]
              placeholder:text-[#2a2a2a] outline-none min-w-0"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-1">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <MessageSquare size={20} className="text-[#1f1f1f] mb-2"/>
            <p className="text-[11px] text-[#2a2a2a]">No chats yet</p>
          </div>
        ) : (
          filteredConversations.map((conv: any) => {
            const isActive = currentConversationId === conv.id;
            return (
              <button key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5
                  rounded-[10px] text-left mb-0.5 transition-all group
                  ${isActive 
                    ? 'bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.15)]' 
                    : 'hover:bg-[rgba(255,255,255,0.03)] border border-transparent'}`}>
                <MessageSquare size={13} className={isActive ? 'text-emerald-500' : 'text-[#2a2a2a]'} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] truncate font-medium ${isActive ? 'text-white' : 'text-[#555]'}`}>
                    {conv.title}
                  </p>
                  <p className="text-[9px] text-[#2a2a2a] mt-0.5">
                    {getTimeAgo(conv.createdAt)}
                  </p>
                </div>
                <button onClick={e=>{e.stopPropagation();deleteConversation(conv.id);}}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded
                    text-[#2a2a2a] hover:text-red-400 transition-all">
                  <X size={11}/>
                </button>
              </button>
            );
          })
        )}
      </div>
      
      <div className="p-3 border-t border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <button onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center gap-2.5 p-2.5 rounded-[10px]
            hover:bg-[rgba(255,255,255,0.04)] transition-all group">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br 
            from-emerald-600 to-teal-700 flex items-center justify-center 
            text-white text-[13px] font-bold flex-shrink-0">
            A
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[12px] font-semibold text-[#ccc]">Awais</p>
            <p className="text-[9px] text-[#333]">Personal Edition</p>
          </div>
          <Settings size={13} className="text-[#2a2a2a] group-hover:text-[#666] transition-colors"/>
        </button>
      </div>
    </aside>
  );
}
