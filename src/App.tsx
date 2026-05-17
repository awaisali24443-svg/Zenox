import React, { useState, useEffect, useRef } from 'react';
import { Menu, Plus, Copy, Send, Trash2, Check, CheckCircle2, XCircle, Terminal } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_SYNOD_API_KEY || 'local-dev-key';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

const STORAGE_KEY = "awais-codex-conversations";

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [inputValue, setInputValue] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setConversations(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse conversations", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, 50)));
  }, [conversations]);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_URL}/api/health`);
        if (res.ok) setBackendStatus('online');
        else setBackendStatus('offline');
      } catch {
        setBackendStatus('offline');
      }
    };
    checkHealth();
    // Optional: check every minute
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const saveCurrentConversation = (updatedMessages: Message[]) => {
    setConversations(prev => {
      let existing = prev.find(c => c.id === currentConversationId);
      if (!existing && updatedMessages.length > 0) {
        existing = {
          id: currentConversationId || Math.random().toString(36).substring(2, 9),
          title: updatedMessages[0].content.slice(0, 40) + (updatedMessages[0].content.length > 40 ? '...' : ''),
          messages: updatedMessages,
          createdAt: Date.now()
        };
        setCurrentConversationId(existing.id);
        return [existing, ...prev];
      } else if (existing) {
        const updated = { ...existing, messages: updatedMessages };
        return [updated, ...prev.filter(c => c.id !== existing!.id)];
      }
      return prev;
    });
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: inputValue.trim(), timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    
    setMessages(newMessages);
    setInputValue('');
    setIsLoading(true);
    setStreamingContent('');

    // Ensure we have an ID for this conversation before saving
    let activeId = currentConversationId;
    if (!activeId) {
      activeId = Math.random().toString(36).substring(2, 9);
      setCurrentConversationId(activeId);
    }

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({ 
          message: userMsg.content,
          history: messages.slice(-10)
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch response');
      }

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullContent += chunk;
          setStreamingContent(fullContent);
        }

        const aiMsg: Message = { role: 'assistant', content: fullContent, timestamp: Date.now() };
        const finalMessages = [...newMessages, aiMsg];
        setMessages(finalMessages);
        setStreamingContent('');
        
        // Save using functional update to ensure we write latest to context
        setConversations(prev => {
          let existing = prev.find(c => c.id === activeId);
          if (!existing) {
             existing = {
                id: activeId!,
                title: finalMessages[0].content.slice(0, 40) + (finalMessages[0].content.length > 40 ? '...' : ''),
                messages: finalMessages,
                createdAt: Date.now()
             };
             return [existing, ...prev];
          } else {
             const updated = { ...existing, messages: finalMessages };
             return [updated, ...prev.filter(c => c.id !== activeId)];
          }
        });
      }
    } catch (err) {
      console.error(err);
      const errorMsg: Message = { role: 'assistant', content: "Error: Could not reach the Zenox backend.", timestamp: Date.now() };
      const finalMsg = [...newMessages, errorMsg];
      setMessages(finalMsg);
      saveCurrentConversation(finalMsg);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  };

  const startNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setStreamingContent('');
    setInputValue('');
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const loadConversation = (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (conv) {
      setCurrentConversationId(conv.id);
      setMessages(conv.messages);
      setStreamingContent('');
    }
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const deleteConversation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversationId === id) {
      startNewChat();
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts: number) => {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric' }).format(new Date(ts));
  };

  const examplePrompts = [
    "Explain quantum computing simply",
    "Write a Python web scraper",
    "Help me debug this error",
    "Create a business plan outline"
  ];

  return (
    <div className="flex h-screen w-full bg-[#0a0a0a] text-[#f0f0f0] font-sans overflow-hidden font-sans selection:bg-green-500/30">
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 fixed md:static inset-y-0 left-0 w-[260px] bg-[#111111] border-r border-[#1f1f1f] flex flex-col z-50 transition-transform duration-300 ease-in-out`}
      >
        {/* Logo Area */}
        <div className="p-5 border-b border-[#1f1f1f]">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
            <div>
              <h1 className="text-xl font-semibold italic tracking-tight text-white">Zenox</h1>
              <p className="text-xs text-[#555555] font-medium uppercase tracking-wider mt-0.5">personal AI</p>
            </div>
          </div>
        </div>

        {/* New Chat Button */}
        <div className="p-4">
          <button 
            onClick={startNewChat}
            className="w-full flex items-center justify-center gap-2 bg-green-900/40 hover:bg-green-900/60 text-green-400 border border-green-800/50 rounded-lg py-2.5 px-4 font-medium transition-all duration-200"
          >
            <Plus size={18} />
            <span>New Chat</span>
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {conversations.map((conv) => (
            <div 
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors relative ${
                currentConversationId === conv.id 
                  ? 'bg-[#1a1a1a] border-l-2 border-green-500 text-white' 
                  : 'hover:bg-[#1f1f1f] border-l-2 border-transparent text-[#a0a0a0]'
              }`}
            >
              <div className="truncate text-sm pr-6">
                {conv.title || "Empty chat"}
              </div>
              <button 
                onClick={(e) => deleteConversation(e, conv.id)}
                className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 text-[#555555] hover:text-red-400 transition-all"
                title="Delete chat"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Status Bar */}
        <div className="p-4 border-t border-[#1f1f1f] bg-[#0d0d0d] flex items-center gap-2 text-xs">
          {backendStatus === 'online' ? (
            <><CheckCircle2 size={14} className="text-green-500" /> <span className="text-[#a0a0a0]">Backend Connected</span></>
          ) : backendStatus === 'offline' ? (
            <><XCircle size={14} className="text-red-500" /> <span className="text-[#a0a0a0]">Backend Offline</span></>
          ) : (
            <><Terminal size={14} className="text-yellow-500" /> <span className="text-[#a0a0a0]">Checking status...</span></>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full relative w-full overflow-hidden">
        
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-[#1f1f1f] bg-[#111111] shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="text-[#a0a0a0] hover:text-white">
            <Menu size={24} />
          </button>
          <div className="font-semibold italic text-white tracking-tight">Zenox</div>
          <div className="w-6" /> {/* spacer */}
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 shrink-0 relative min-h-0">
          <div className="max-w-3xl mx-auto h-full flex flex-col justify-end">
            
            {messages.length === 0 && !streamingContent ? (
              <div className="flex-1 flex flex-col items-center justify-center -mt-20">
                <h2 className="text-3xl font-semibold mb-10 text-white tracking-tight">What can I help you with?</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl px-4">
                  {examplePrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => setInputValue(prompt)}
                      className="p-4 text-left border border-[#1f1f1f] bg-[#111111] hover:bg-[#1a1a1a] rounded-xl text-[#a0a0a0] hover:text-white transition-all transform hover:-translate-y-0.5 hover:shadow-lg hover:border-green-500/30"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 pb-2">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`w-full flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`relative max-w-[85%] rounded-2xl p-4 ${
                      msg.role === 'user' 
                        ? 'bg-green-600 border border-green-500 text-white shadow-md' 
                        : 'bg-[#111111] border border-[#1f1f1f] text-[#f0f0f0]'
                    }`}>
                      {msg.role === 'assistant' && (
                        <button 
                          onClick={() => copyToClipboard(msg.content, idx)}
                          className="absolute top-3 right-3 text-[#555555] hover:text-white transition-colors bg-[#111111] p-1 rounded-md"
                          title="Copy to clipboard"
                        >
                          {copiedIndex === idx ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                        </button>
                      )}
                      <div className="whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </div>
                      <div className={`text-[10px] uppercase tracking-wider mt-2 font-medium ${
                        msg.role === 'user' ? 'text-green-200' : 'text-[#555555]'
                      }`}>
                        {formatTime(msg.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
                
                {streamingContent && (
                  <div className="w-full flex justify-start">
                    <div className="max-w-[85%] rounded-2xl p-4 bg-[#111111] border border-[#1f1f1f] text-[#f0f0f0]">
                      <div className="whitespace-pre-wrap leading-relaxed">
                        {streamingContent}
                        <span className="inline-block w-2 h-4 ml-1 bg-green-500 animate-pulse align-middle" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="shrink-0 p-4 md:px-8 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent sticky bottom-0">
          <div className="max-w-3xl mx-auto relative group">
            <div className={`bg-[#111111] border rounded-2xl p-2 transition-all duration-300 ${
              isLoading ? 'border-[#1f1f1f]/50' : 'border-[#1f1f1f] focus-within:border-green-500 focus-within:ring-1 focus-within:ring-green-500/50 shadow-lg'
            }`}>
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Zenox..."
                disabled={isLoading}
                rows={1}
                className="w-full max-h-[200px] min-h-[44px] sm:min-h-[52px] bg-transparent resize-none outline-none py-3 sm:py-3.5 px-4 text-[#f0f0f0] placeholder:text-[#555555] disabled:opacity-50"
                style={{ 
                  height: inputValue.split('\n').length > 1 ? `${Math.min(inputValue.split('\n').length * 24 + 28, 200)}px` : '52px'
                }}
              />
              <div className="absolute right-4 bottom-3 sm:bottom-4 flex items-center justify-center">
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading}
                  className={`p-2 rounded-xl transition-all flex items-center justify-center ${
                    !inputValue.trim() || isLoading
                      ? 'bg-transparent text-[#555555] cursor-not-allowed'
                      : 'bg-green-500 text-white cursor-pointer shadow-[0_0_15px_rgba(34,197,94,0.4)] hover:bg-green-400'
                  }`}
                >
                  <Send size={18} className={isLoading ? 'opacity-50' : ''} />
                </button>
              </div>
            </div>
            <div className="text-center mt-2 text-[11px] text-[#555555] font-medium tracking-wide">
              Press Enter to send &middot; Shift+Enter for newline
            </div>
          </div>
        </div>
        
      </main>
    </div>
  );
}
