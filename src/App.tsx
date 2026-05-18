import React, { useState, useEffect, useRef } from 'react';
import { 
  Menu, Plus, Copy, Send, Trash2, Check, CheckCircle2, 
  XCircle, Terminal, Square, RefreshCw, Download, Settings,
  ArrowDown, Search, MessageSquare, X, ImageIcon, Mic, MicOff
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';
let rawApiKey = import.meta.env.VITE_SYNOD_API_KEY || 'local-dev-key';
if (rawApiKey) {
  rawApiKey = rawApiKey.replace(/\\n/g, '\n').split('\n')[0].trim();
}
const API_KEY = rawApiKey;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  imageUrl?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

type MsgStatus = 'idle' | 'sending' | 'thinking' | 'streaming';
type ResponseStyle = 'balanced' | 'concise' | 'detailed' | 'creative';

const STORAGE_KEY = "zenox-conversations";

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const ZenoxLogo = ({ size = 32 }: { size?: number }) => (
  <div 
    style={{ width: size, height: size, minWidth: size, minHeight: size }}
    className="relative flex items-center justify-center 
      bg-gradient-to-br from-green-500 to-emerald-700 
      rounded-xl shadow-[0_0_20px_rgba(34,197,94,0.3)] shrink-0"
  >
    <span 
      style={{ fontSize: size * 0.55 }}
      className="font-black text-black tracking-tighter select-none"
    >
      Z
    </span>
    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 
      bg-green-400 rounded-full border-2 border-[#0a0a0a]
      shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
  </div>
);

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [msgStatus, setMsgStatus] = useState<MsgStatus>('idle');
  
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [backendModel, setBackendModel] = useState('Checking...');
  
  const [inputValue, setInputValue] = useState('');
  // Show sidebar open by default only on wider screens
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1280);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('zenox-font-size') || 'M');
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>(
    (localStorage.getItem('zenox-response-style') as ResponseStyle) || 'balanced'
  );
  
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{msg: string; type: 'success' | 'error' | 'info'} | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  
  // Image Feature
  const [selectedImage, setSelectedImage] = useState<File|null>(null);
  const [imagePreview, setImagePreview] = useState<string|null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  // Voice feature
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    // Apply font size CSS var
    if (fontSize === 'S') document.documentElement.style.setProperty('--chat-font-size', '14px');
    if (fontSize === 'M') document.documentElement.style.setProperty('--chat-font-size', '16px');
    if (fontSize === 'L') document.documentElement.style.setProperty('--chat-font-size', '18px');
  }, [fontSize]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setConversations(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse conversations", e);
      }
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [currentConversationId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, 50)));
  }, [conversations]);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_URL}/api/health`);
        if (res.ok) {
          const data = await res.json();
          if (backendStatus === 'offline') {
            showToast('✅ Zenox is back online', 'success');
          }
          setBackendStatus('online');
          setBackendModel(data.model || 'Gemini 2.5 Flash');
          setLastChecked(Date.now());
        } else {
          setBackendStatus('offline');
        }
      } catch {
        setBackendStatus('offline');
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, [backendStatus]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        startNewChat();
        showToast('New chat started', 'info');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      }
      if (e.key === 'Escape') {
        setSettingsOpen(false);
        if (window.innerWidth < 1280) setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Window resize handler for sidebar behavior
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1280) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!showScrollBtn) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollBtn(!isNearBottom && messages.length > 0);
  };

  const getTimeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff/86400000)}d ago`;
    return new Date(ts).toLocaleDateString();
  };

  const generateTitle = async (message: string, id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ message })
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(prev => prev.map(c => 
          c.id === id ? { ...c, title: data.title } : c
        ));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const stopGeneration = () => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
    setMsgStatus('idle');
    if (streamingContent) {
      const aiMsg: Message = { role: 'assistant', content: streamingContent + ' [stopped]', timestamp: Date.now() };
      const newMessages = [...messages, aiMsg];
      setMessages(newMessages);
      saveCurrentConversation(newMessages, currentConversationId);
      setStreamingContent('');
    }
  };

  const saveCurrentConversation = (updatedMessages: Message[], activeId: string | null) => {
    const isWelcomeOnly = updatedMessages.length === 1 && updatedMessages[0].role === 'assistant';
    if (isWelcomeOnly) return;
    setConversations(prev => {
      let existing = prev.find(c => c.id === activeId);
      if (!existing && updatedMessages.length > 0) {
        const userMsgs = updatedMessages.filter(m => m.role === 'user');
        const firstUserMsg = userMsgs.length > 0 ? userMsgs[0].content : updatedMessages[0].content;
        existing = {
          id: activeId || Math.random().toString(36).substring(2, 9),
          title: firstUserMsg.slice(0, 40) + (firstUserMsg.length > 40 ? '...' : ''),
          messages: updatedMessages,
          createdAt: Date.now()
        };
        setCurrentConversationId(existing.id);
        if (userMsgs.length === 1) generateTitle(firstUserMsg, existing.id);
        return [existing, ...prev];
      } else if (existing) {
        const updated = { ...existing, messages: updatedMessages };
        return [updated, ...prev.filter(c => c.id !== existing!.id)];
      }
      return prev;
    });
  };

  const toBase64 = (file: File): Promise<string> => 
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.readAsDataURL(file);
    });

  const handleSendWithMessage = async (overrideMessage: string) => {
    if (!overrideMessage.trim() && !selectedImage || isLoading) return;

    let imageBase64: string | undefined;
    let imageType: string | undefined;
    let currentImagePreview = imagePreview;

    if (selectedImage) {
      imageBase64 = await toBase64(selectedImage);
      imageType = selectedImage.type;
    }

    const userMsg: Message = { 
      role: 'user', 
      content: overrideMessage.trim(), 
      timestamp: Date.now(),
      imageUrl: currentImagePreview || undefined
    };
    
    // Clear image states immediately
    setSelectedImage(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputValue('');
    setIsLoading(true);
    setMsgStatus('sending');
    setStreamingContent('');

    let activeId = currentConversationId;
    if (!activeId) {
      activeId = Math.random().toString(36).substring(2, 9);
      setCurrentConversationId(activeId);
    }

    const historyToUse = messages.filter(m => 
      !(messages.length === 1 && messages[0].role === 'assistant' && messages[0].content.includes('explore today'))
    ).slice(-10);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ 
          message: userMsg.content,
          history: historyToUse,
          response_style: responseStyle,
          image: imageBase64,
          image_type: imageType
        }),
        signal: abortControllerRef.current.signal
      });

      setMsgStatus('thinking');

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let firstChunk = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!firstChunk) {
            setMsgStatus('streaming');
            firstChunk = true;
          }
          const chunk = decoder.decode(value, { stream: true });
          fullContent += chunk;
          setStreamingContent(fullContent);
        }

        const aiMsg: Message = { role: 'assistant', content: fullContent, timestamp: Date.now() };
        const finalMessages = [...newMessages, aiMsg];
        setMessages(finalMessages);
        setStreamingContent('');
        saveCurrentConversation(finalMessages, activeId);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error(err);
      let errorText = "Something went wrong. Please try again.";
      if (!navigator.onLine) errorText = "No internet connection. Check your network and retry.";
      else if (err.message.includes('503')) errorText = "Zenox backend is sleeping. It wakes in ~30 seconds on free tier.";
      else if (err.message.includes('401') || err.message.includes('403')) errorText = "API key error. Check your VITE_SYNOD_API_KEY setting.";
      else if (err.message.includes('429')) errorText = "Rate limit reached. Wait a moment before sending again.";
      
      const errorMsg: Message = { role: 'assistant', content: `⚠️ ${errorText}`, timestamp: Date.now() };
      const finalMsg = [...newMessages, errorMsg];
      setMessages(finalMsg);
      saveCurrentConversation(finalMsg, activeId);
    } finally {
      setIsLoading(false);
      setMsgStatus('idle');
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  };

  const handleSend = () => handleSendWithMessage(inputValue);

  const startNewChat = () => {
    setCurrentConversationId(null);
    const welcomeMsg: Message = {
      role: 'assistant',
      content: "Hello! I'm Zenox, your personal AI. What would you like to explore today?",
      timestamp: Date.now()
    };
    setMessages([welcomeMsg]);
    setStreamingContent('');
    setInputValue('');
    if (window.innerWidth < 1280) setSidebarOpen(false);
  };

  const loadConversation = (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (conv) {
      setCurrentConversationId(conv.id);
      setMessages(conv.messages);
      setStreamingContent('');
    }
    if (window.innerWidth < 1280) setSidebarOpen(false);
  };

  const deleteConversation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversationId === id) startNewChat();
    showToast('Chat cleared');
  };

  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const clearAllConversations = () => {
    setConversations([]);
    startNewChat();
    showToast('All conversations cleared', 'success');
    setShowConfirmClear(false);
    setSettingsOpen(false);
  };

  const exportConversation = () => {
    if (!messages.length) return;
    const lines = messages.map(m => 
      `[${formatTime(m.timestamp)}] ${m.role === 'user' ? 'You' : 'Zenox'}:\n${m.content}\n`
    );
    const content = `Zenox v3 Conversation\nExported: ${new Date().toLocaleString()}\n${'─'.repeat(40)}\n\n${lines.join('\n')}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zenox-[${currentConversationId || 'new'}]-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Conversation exported', 'success');
  };

  const handleRegenerate = () => {
    if (messages.length < 2) return;
    const lastUserMsg = messages[messages.length - 2];
    setMessages(prev => prev.slice(0, -2));
    handleSendWithMessage(lastUserMsg.content);
  };

  const formatTime = (ts: number) => {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric' }).format(new Date(ts));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be under 5MB', 'error');
      if (imageInputRef.current) imageInputRef.current.value = '';
      return;
    }
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      showToast('Voice input not supported in this browser', 'error');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInputValue(transcript);
    };
    recognition.onend = () => {
      setIsListening(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    };
    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event.error === 'not-allowed') showToast('Microphone permission denied', 'error');
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const renderMarkdown = (text: string) => {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const match = part.match(/```(\w*)\n([\s\S]*?)```/);
        const language = match ? match[1] : '';
        const codeContent = match ? match[2] : part.slice(3, -3);
        return (
          <div key={index} className="relative bg-[#0d0d0d] rounded-xl border border-[#1a1a1a] my-3 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a1a1a] bg-[#111]">
              <span className="text-[10px] text-[#444] font-mono">{language || 'code'}</span>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(codeContent);
                  setCopiedIndex(index);
                  setTimeout(() => setCopiedIndex(null), 2000);
                  showToast('Copied to clipboard', 'success');
                }}
                className="text-[10px] text-[#444] hover:text-green-400 flex items-center gap-1 transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 justify-end"
              >
                {copiedIndex === index ? <><Check size={10}/> Copied</> : <><Copy size={10}/> Copy</>}
              </button>
            </div>
            <pre className="p-4 overflow-x-auto text-green-300 text-sm font-mono leading-relaxed">
              <code>{codeContent}</code>
            </pre>
          </div>
        );
      }
      const elementParts = part.split(/(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|`[\s\S]*?`|^- .*$|\n#+ .*$)/gm);
      return (
        <span key={index}>
          {elementParts.map((subPart, subIndex) => {
            if (!subPart) return null;
            if (subPart.startsWith('**') && subPart.endsWith('**')) return <strong key={subIndex} className="font-semibold text-white">{subPart.slice(2, -2)}</strong>;
            if (subPart.startsWith('*') && subPart.endsWith('*')) return <em key={subIndex} className="italic">{subPart.slice(1, -1)}</em>;
            if (subPart.startsWith('`') && subPart.endsWith('`')) return <code key={subIndex} className="bg-[#1a1a1a] px-1.5 py-0.5 rounded text-green-400 font-mono text-sm">{subPart.slice(1, -1)}</code>;
            if (subPart.match(/^- (.*)/)) return <li key={subIndex} className="ml-4 list-disc my-1">{subPart.slice(2)}</li>;
            if (subPart.match(/^\n#+ (.*)/)) {
              const hashes = subPart.match(/#+/)?.[0].length || 1;
              const text = subPart.replace(/^\n#+ /, '');
              if (hashes === 1) return <h1 key={subIndex} className="text-2xl font-bold mt-4 mb-2 text-white">{text}</h1>;
              if (hashes === 2) return <h2 key={subIndex} className="text-xl font-bold mt-3 mb-2 text-white">{text}</h2>;
              return <h3 key={subIndex} className="text-lg font-bold mt-2 mb-1 text-white">{text}</h3>;
            }
            return <span key={subIndex} className="whitespace-pre-wrap">{subPart}</span>;
          })}
        </span>
      );
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredConversations = conversations.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const [expandedShortcuts, setExpandedShortcuts] = useState(false);

  return (
    <div className="flex h-[100dvh] w-full bg-[#0a0a0a] text-[#f0f0f0] overflow-hidden selection:bg-green-500/30">
      
      {/* Toast */}
      <div className={`fixed bottom-6 right-6 z-[100] transition-all duration-300 ${toast ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
        <div className={`px-4 py-3 rounded-xl text-sm font-medium shadow-xl border flex items-center gap-2 ${
          toast?.type === 'success' ? 'bg-green-900/80 border-green-700 text-green-200' :
          toast?.type === 'error' ? 'bg-red-900/80 border-red-700 text-red-200' :
          'bg-[#1a1a1a] border-[#2a2a2a] text-white'
        }`}>
          {toast?.msg}
        </div>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 xl:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } xl:translate-x-0 fixed xl:static inset-y-0 left-0 w-full md:w-[260px] bg-[#111111] border-r border-[#1f1f1f] flex flex-col z-50 transition-transform duration-300 ease-in-out`}>
        <div className="flex items-center justify-between xl:justify-start gap-3 p-5 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-3">
            <ZenoxLogo size={36} />
            <div>
              <h1 className="text-lg font-black text-white tracking-tight">Zenox</h1>
              <p className="text-[10px] text-[#444] uppercase tracking-widest font-medium">personal ai · by awais</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="xl:hidden p-3 text-[#555] hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <button 
            onClick={startNewChat}
            className="w-full relative overflow-hidden flex items-center justify-center gap-2 bg-green-900/40 md:hover:bg-green-900/60 text-green-400 border border-green-800/50 rounded-lg py-2.5 px-4 font-medium transition-all duration-200 before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/5 before:to-transparent before:-translate-x-full md:hover:before:translate-x-full before:transition-transform before:duration-700"
          >
            <Plus size={18} />
            <span>New Chat</span>
          </button>
          
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
            <input 
              id="search-input"
              type="text" 
              placeholder="Search chats..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg py-2 md:py-1.5 pl-9 pr-3 text-base md:text-sm focus:outline-none focus:border-green-500/50 transition-colors placeholder-[#555] text-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center mb-3">
                <MessageSquare size={18} className="text-[#333]" />
              </div>
              <p className="text-xs text-[#444] leading-relaxed">
                No conversations yet.<br/>
                Start chatting with Zenox.
              </p>
            </div>
          )}
          
          {filteredConversations.map((conv) => (
            <div 
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all relative ${
                currentConversationId === conv.id 
                  ? 'bg-[#1a1a1a] border-l-2 border-green-500 text-white' 
                  : 'md:hover:bg-[#1f1f1f] border-l-2 border-transparent text-[#a0a0a0]'
              }`}
            >
              <div className="flex flex-col overflow-hidden">
                <div className="truncate text-sm pr-6 font-medium">{conv.title || "Empty chat"}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-[#444]">{conv.messages.length} msgs</span>
                  <span className="text-[10px] text-[#333]">·</span>
                  <span className="text-[10px] text-[#444]">{getTimeAgo(conv.createdAt)}</span>
                </div>
              </div>
              <button 
                onClick={(e) => deleteConversation(e, conv.id)}
                className="absolute right-2 opacity-100 xl:opacity-0 xl:group-hover:opacity-100 p-3 md:p-1 text-[#555555] md:hover:text-red-400 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-[#1f1f1f] bg-[#0d0d0d] flex flex-col gap-2">
          <div className="flex flex-row justify-between items-center">
            <div className="flex items-center gap-2 text-xs">
              {backendStatus === 'online' ? (
                <><CheckCircle2 size={14} className="text-green-500" /> <span className="text-[#a0a0a0] truncate">{backendModel}</span></>
              ) : backendStatus === 'offline' ? (
                <><XCircle size={14} className="text-red-500" /> <span className="text-[#a0a0a0]">Backend Offline</span></>
              ) : (
                <><Terminal size={14} className="text-yellow-500" /> <span className="text-[#a0a0a0]">Checking status...</span></>
              )}
            </div>
            <button onClick={() => setSettingsOpen(true)} className="p-3 md:p-1.5 text-[#555] md:hover:text-white transition-colors">
              <Settings size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full relative w-full overflow-hidden">
        
        {/* Mobile Header */}
        <header className="xl:hidden flex items-center justify-between p-3 border-b border-[#1f1f1f] bg-[#111111] shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-[#a0a0a0] active:text-white">
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <ZenoxLogo size={20} />
            <div className="font-semibold italic text-white tracking-tight">Zenox</div>
          </div>
          <button onClick={() => setSettingsOpen(true)} className="p-2 text-[#a0a0a0] active:text-white">
            <Settings size={20} />
          </button>
        </header>

        {/* Desktop Header */}
        <header className="hidden xl:flex items-center justify-between px-8 py-3 border-b border-[#1a1a1a] bg-[#0d0d0d] shrink-0">
          <div className="text-sm text-[#444] font-medium">
            {currentConversationId 
              ? conversations.find(c=>c.id===currentConversationId)?.title || 'New Chat'
              : 'Zenox'}
          </div>
          <div className="flex items-center gap-3">
            {messages.length > 1 && (
              <button 
                onClick={exportConversation}
                className="text-xs text-[#444] hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <Download size={14} />
                Export
              </button>
            )}
            <button 
              onClick={() => setSettingsOpen(true)}
              className="text-[#444] hover:text-white transition-colors p-1.5 rounded-lg hover:bg-[#1a1a1a]"
            >
              <Settings size={16} />
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-6 md:px-8 shrink-0 relative min-h-0">
          <div className="max-w-3xl mx-auto h-full flex flex-col justify-end">
            
            {(messages.length === 0 || (messages.length === 1 && messages[0].content.includes('explore today'))) && !streamingContent ? (
              <div className="flex-1 flex flex-col items-center justify-center -mt-20">
                <ZenoxLogo size={56} />
                <h2 className="text-3xl font-black text-white tracking-tight mt-5 mb-2 text-center animate-[fadeIn_0.3s_ease]">
                  What can I do for you?
                </h2>
                <p className="text-sm text-[#555] mb-10 text-center animate-[fadeIn_0.4s_ease]">
                  Zenox is ready — ask anything
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl px-4 animate-[fadeIn_0.5s_ease]">
                  {[
                    "Explain quantum computing simply",
                    "Write a Python web scraper",
                    "Help me debug this error",
                    "Create a business plan outline"
                  ].map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setInputValue(prompt);
                        setTimeout(() => handleSendWithMessage(prompt), 10);
                      }}
                      className="p-4 text-left border border-[#1f1f1f] bg-[#111111] md:hover:bg-[#1a1a1a] rounded-xl text-[#a0a0a0] md:hover:text-white transition-all transform md:hover:-translate-y-0.5 md:hover:shadow-lg md:hover:border-green-500/30"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 pb-2">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`w-full flex animate-[fadeIn_0.3s_ease] ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`relative max-w-[92%] sm:max-w-[85%] lg:max-w-[70%] rounded-2xl p-4 ${
                      msg.role === 'user' 
                        ? 'bg-green-600 border border-green-500 text-white shadow-md rounded-br-sm' 
                        : 'bg-[#111111] border border-[#1f1f1f] text-[#f0f0f0] rounded-bl-sm'
                    }`}>
                      {msg.role === 'assistant' && (
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(msg.content);
                            setCopiedIndex(idx);
                            setTimeout(() => setCopiedIndex(null), 2000);
                            showToast('Copied to clipboard', 'success');
                          }}
                          className="absolute top-3 right-3 text-[#555555] md:hover:text-white transition-colors bg-[#111111] p-2 md:p-1 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 rounded-md"
                        >
                          {copiedIndex === idx ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                        </button>
                      )}
                      
                      {msg.role === 'user' && msg.imageUrl && (
                        <img src={msg.imageUrl} alt="Attached" className="max-w-[200px] max-h-[200px] object-cover rounded-lg mb-3 border border-green-400" />
                      )}
                      
                      <div className={`leading-relaxed text-[var(--chat-font-size)] [&_p]:mb-2 [&_li]:mb-1`}>
                        {msg.role === 'assistant' && msg.content.includes('⚠️') ? (
                           <div className="text-yellow-400 whitespace-pre-wrap">{msg.content}</div>
                        ) : msg.role === 'assistant' ? (
                          renderMarkdown(msg.content)
                        ) : (
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        )}
                      </div>
                      
                      <div className={`text-[10px] uppercase tracking-wider mt-2 font-medium ${
                        msg.role === 'user' ? 'text-green-200' : 'text-[#555555]'
                      }`}>
                        {formatTime(msg.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
                
                {msgStatus === 'thinking' && (
                  <div className="w-full flex justify-start animate-[fadeIn_0.3s_ease]">
                    <div className="max-w-[92%] sm:max-w-[85%] lg:max-w-[70%] rounded-2xl p-4 bg-[#111] border border-[#1f1f1f] rounded-bl-sm">
                      <div className="flex items-center gap-2 text-[#555]">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
                        </div>
                        <span className="text-xs text-[#555]">Zenox is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}

                {streamingContent && (
                  <div className="w-full flex justify-start animate-[fadeIn_0.2s_ease]">
                    <div className="max-w-[92%] sm:max-w-[85%] lg:max-w-[70%] rounded-2xl p-4 bg-[#111111] border border-[#1f1f1f] text-[#f0f0f0] rounded-bl-sm">
                      <div className={`leading-relaxed text-[var(--chat-font-size)]`}>
                        {renderMarkdown(streamingContent)}
                        <span className="inline-block w-2 h-4 ml-1 bg-green-500 animate-pulse align-middle" />
                      </div>
                    </div>
                  </div>
                )}

                {messages.length > 0 && messages[messages.length - 1].role === 'assistant' && !isLoading && (
                  <button onClick={handleRegenerate}
                    className="flex items-center gap-1.5 text-xs text-[#555] md:hover:text-white transition-colors mt-2 ml-1 p-2 md:p-0">
                    <RefreshCw size={12} />
                    Regenerate
                  </button>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
          
          {showScrollBtn && (
            <button 
              onClick={() => messagesEndRef.current?.scrollIntoView({behavior:'smooth'})}
              className="absolute bottom-4 right-4 z-10 bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-full p-3 md:p-2 shadow-xl border-t border-[#333] flex items-center gap-1.5 text-[10px] md:text-xs animate-[fadeIn_0.2s_ease]"
            >
              <ArrowDown size={14} />
            </button>
          )}
        </div>

        {/* Input Area */}
        <div className="shrink-0 pt-0 pb-4 px-2 md:px-8 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent sticky bottom-0">
          <div className="max-w-3xl mx-auto relative group">
            
            {isListening && (
              <div className="flex items-center gap-2 text-xs text-red-400 mb-1 px-1 animate-pulse">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                Listening... speak now
              </div>
            )}
            
            {msgStatus !== 'idle' && !isListening && (
              <div className="flex items-center gap-2 text-xs mb-1.5 px-2 animate-[fadeIn_0.2s_ease]">
                {msgStatus === 'sending' && <span className="text-yellow-400">● Sending...</span>}
                {msgStatus === 'thinking' && <span className="text-blue-400 animate-pulse">● Zenox is thinking...</span>}
                {msgStatus === 'streaming' && <span className="text-green-400">● Responding...</span>}
              </div>
            )}
            
            {selectedImage && imagePreview && (
              <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] rounded-xl border border-[#2a2a2a] mb-2 mx-1">
                <img src={imagePreview} className="w-14 h-14 object-cover rounded-lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{selectedImage.name}</p>
                  <p className="text-[10px] text-[#555]">{(selectedImage.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button onClick={() => { setSelectedImage(null); setImagePreview(null); if(imageInputRef.current) imageInputRef.current.value=''; }} className="p-2 text-[#555] hover:text-red-400">
                  <X size={16} />
                </button>
              </div>
            )}

            <div className={`bg-[#111111] border rounded-2xl p-2 transition-all duration-300 flex items-end ${
              isLoading ? 'border-[#1f1f1f]/50' : 'border-[#1f1f1f] focus-within:border-green-500 focus-within:shadow-[0_0_0_2px_rgba(34,197,94,0.15)] shadow-lg'
            }`}>
              <button onClick={() => imageInputRef.current?.click()} className="p-3 md:p-2 text-[#555] md:hover:text-green-400 transition-colors flex-shrink-0 self-end mb-1">
                <ImageIcon size={18} />
              </button>
              <input type="file" ref={imageInputRef} className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageSelect} />
              
              <button onClick={toggleVoiceInput} className={`p-3 md:p-2 transition-colors flex-shrink-0 self-end mb-1 ${isListening ? 'text-red-400 animate-pulse' : 'text-[#555] md:hover:text-green-400'}`}>
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Zenox..."
                disabled={isLoading}
                rows={1}
                className="flex-1 max-h-[200px] min-h-[44px] bg-transparent resize-none outline-none py-3 px-2 text-base md:text-sm text-[#f0f0f0] placeholder:text-[#555555] disabled:opacity-50"
                style={{ height: inputValue.split('\n').length > 1 ? `${Math.min(inputValue.split('\n').length * 24 + 28, 200)}px` : '44px' }}
              />
              
              <div className="flex-shrink-0 self-end mb-1 mr-1 ml-1">
                {isLoading ? (
                  <button onClick={stopGeneration} className="p-3 md:p-2 rounded-xl bg-red-500/20 text-red-400">
                    <Square size={18} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={(!inputValue.trim() && !selectedImage)}
                    className={`p-3 md:p-2 rounded-xl transition-transform active:scale-95 flex items-center justify-center ${
                      (!inputValue.trim() && !selectedImage)
                        ? 'bg-transparent text-[#555] cursor-not-allowed'
                        : 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)] hover:bg-green-400'
                    }`}
                  >
                    <Send size={18} />
                  </button>
                )}
              </div>
            </div>
            
            <div className="hidden md:flex justify-between items-center mt-2 px-1">
              <div className="text-[11px] text-[#555555] font-medium tracking-wide">
                Press Enter to send &middot; Shift+Enter for newline
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Settings Panel entirely rewritten */}
      {settingsOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity" onClick={() => {setSettingsOpen(false); setShowConfirmClear(false)}} />
          <div className="fixed bottom-0 left-0 right-0 md:bottom-auto md:right-0 md:top-0 md:left-auto md:w-[320px] md:h-full bg-[#111] border-t md:border-t-0 md:border-l border-[#1f1f1f] z-50 flex flex-col md:animate-[slideInRight_0.2s_ease-out] rounded-t-2xl md:rounded-none max-h-[85vh] md:max-h-none shadow-2xl">
            <div className="px-5 py-4 border-b border-[#1a1a1a] flex justify-between items-center bg-[#0d0d0d] rounded-t-2xl md:rounded-none">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-white tracking-tight">Settings</h2>
                <span className="text-[10px] bg-[#1a1a1a] text-[#888] px-2 py-0.5 rounded-full font-medium">v3.0</span>
              </div>
              <button onClick={() => setSettingsOpen(false)} className="p-3 md:p-1.5 text-[#555] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto w-full pb-10">
              
              {/* Appearance */}
              <div className="p-5 border-b border-[#1a1a1a]">
                <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-4">Appearance</h3>
                
                <div className="mb-5">
                  <span className="text-xs text-[#aaa] font-medium block mb-2">Theme</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col items-center justify-center py-3 rounded-lg border-2 border-green-500 bg-green-500/10 cursor-pointer">
                      <span className="text-xs font-semibold text-white">🌑 Dark</span>
                    </div>
                    <div className="flex flex-col items-center justify-center py-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] opacity-50 cursor-not-allowed relative">
                      <span className="text-xs font-medium text-[#888]">☀️ Light</span>
                      <span className="absolute -top-2 bg-black text-[#888] text-[8px] px-1.5 border border-[#333] rounded">Coming soon</span>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-xs text-[#aaa] font-medium block mb-2">Font Size</span>
                  <div className="flex rounded-lg border border-[#2a2a2a] overflow-hidden">
                    {['S', 'M', 'L'].map(sz => (
                      <button
                        key={sz}
                        onClick={() => {
                          setFontSize(sz);
                          localStorage.setItem('zenox-font-size', sz);
                        }}
                        className={`flex-1 py-1.5 text-xs font-medium transition-all ${
                          fontSize === sz 
                            ? 'bg-green-500 text-black font-bold' 
                            : 'bg-[#1a1a1a] text-[#888] hover:bg-[#222]'
                        } ${sz !== 'L' && 'border-r border-[#2a2a2a]'}`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Behavior */}
              <div className="p-5 border-b border-[#1a1a1a]">
                <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-4">AI Behavior</h3>
                
                <div className="space-y-2">
                  {[
                    { id: 'balanced', icon: '⚡', title: 'Balanced', desc: 'Smart default for most tasks' },
                    { id: 'concise', icon: '✂️', title: 'Concise', desc: 'Short and direct answers only' },
                    { id: 'detailed', icon: '📖', title: 'Detailed', desc: 'Deep explanations with examples' },
                    { id: 'creative', icon: '🎨', title: 'Creative', desc: 'Imaginative and expansive thinking' }
                  ].map(opt => (
                    <div 
                      key={opt.id}
                      onClick={() => {
                        setResponseStyle(opt.id as ResponseStyle);
                        localStorage.setItem('zenox-response-style', opt.id);
                      }}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                        responseStyle === opt.id 
                          ? 'bg-[#1a2a1a] border-l-4 border-green-500 border-t-[#2a3a2a] border-r-[#2a3a2a] border-b-[#2a3a2a]' 
                          : 'bg-[#111] border-[#1f1f1f] opacity-70 hover:opacity-100 hover:border-[#333]'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center shrink-0 border border-[#2a2a2a]">
                        <span className="text-sm">{opt.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white">{opt.title}</div>
                        <div className="text-[10px] text-[#888] truncate">{opt.desc}</div>
                      </div>
                      {responseStyle === opt.id && <Check size={16} className="text-green-500 shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Chat settings */}
              <div className="p-5 border-b border-[#1a1a1a]">
                <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-4">Chat</h3>
                
                <div className="space-y-3">
                  {messages.length > 0 && (
                    <button 
                      onClick={exportConversation}
                      className="w-full flex items-center justify-center gap-2 p-3 text-xs font-medium border border-[#2a2a2a] rounded-xl text-[#aaa] hover:bg-[#1a1a1a] hover:text-white transition-colors"
                    >
                      <Download size={14} /> Export as .txt
                    </button>
                  )}
                  
                  {showConfirmClear ? (
                    <div className="bg-red-950/30 p-3 rounded-xl border border-red-900/50">
                      <p className="text-xs text-red-200 text-center mb-3">This will delete all {conversations.length} conversations.</p>
                      <div className="flex gap-2">
                        <button onClick={() => setShowConfirmClear(false)} className="flex-1 py-2 text-xs font-medium bg-[#1a1a1a] rounded text-white">Cancel</button>
                        <button onClick={clearAllConversations} className="flex-1 py-2 text-xs font-bold bg-red-500/20 text-red-500 rounded">Yes, Delete All</button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      disabled={conversations.length===0}
                      onClick={() => setShowConfirmClear(true)}
                      className="w-full flex items-center justify-center gap-2 p-3 text-xs font-medium border border-red-900/50 rounded-xl text-red-400 hover:bg-red-950/40 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    >
                      <Trash2 size={14} /> Clear History
                    </button>
                  )}
                </div>
              </div>

              {/* About section */}
              <div className="p-5">
                <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-4">About</h3>
                
                <div className="space-y-1 mb-6">
                  <div className="text-sm font-bold text-white block">Zenox v3.0</div>
                  <div className="text-xs text-[#888] block">Built by Awais</div>
                  <div className="text-xs text-[#888] flex items-center gap-1.5 mt-1">
                    Powered by Gemini <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                  </div>
                </div>
                
                <div className="h-px bg-[#1a1a1a] w-full mb-4" />
                
                <div>
                  <button 
                    onClick={() => setExpandedShortcuts(!expandedShortcuts)}
                    className="flex justify-between items-center w-full text-xs font-medium text-[#aaa] hover:text-white"
                  >
                    Keyboard Shortcuts
                    <span className="text-[#555] font-mono">{expandedShortcuts ? '-' : '+'}</span>
                  </button>
                  {expandedShortcuts && (
                    <div className="mt-3 grid grid-cols-[1fr,auto] gap-y-2 text-[10px] text-[#888]">
                      <span className="font-medium text-white">New Chat</span>
                      <kbd className="bg-[#1a1a1a] border border-[#2a2a2a] px-1.5 py-0.5 rounded font-mono">Ctrl+Shift+N</kbd>
                      
                      <span className="font-medium text-white">Search</span>
                      <kbd className="bg-[#1a1a1a] border border-[#2a2a2a] px-1.5 py-0.5 rounded font-mono">Ctrl+K</kbd>
                      
                      <span className="font-medium text-white">Settings</span>
                      <kbd className="bg-[#1a1a1a] border border-[#2a2a2a] px-1.5 py-0.5 rounded font-mono">Ctrl+,</kbd>
                      
                      <span className="font-medium text-white">Close</span>
                      <kbd className="bg-[#1a1a1a] border border-[#2a2a2a] px-1.5 py-0.5 rounded font-mono">ESC</kbd>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </>
      )}
      
    </div>
  );
}
