import React, { useState, useEffect, useRef } from 'react';
import { 
  Menu, Plus, Copy, Send, Trash2, Check, CheckCircle2, 
  XCircle, Terminal, Square, RefreshCw, Download, Settings,
  ArrowDown, ArrowUp, Search, MessageSquare, X, ImageIcon, Mic, MicOff,
  FileText, Zap, Scissors, BookOpen, Lightbulb, Moon, Sun,
  AlertTriangle, AlertCircle, Info
} from 'lucide-react';
import { AgentCore } from './modules/agent/AgentCore';

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

const ZenoxLogo = ({ size = 36, animate = false, className = '' }: { size?: number; animate?: boolean; className?: string }) => (
  <div
    style={{ width: size, height: size }}
    className={`relative flex items-center justify-center flex-shrink-0 ${animate ? 'group' : ''} ${className}`}
  >
    {/* Outer glow ring */}
    <div
      style={{ width: size, height: size }}
      className="absolute rounded-[28%] bg-white/5 
        blur-sm scale-110"
    />
    {/* Main body */}
    <div
      style={{ width: size, height: size }}
      className="relative rounded-[28%] bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a] 
        border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.05)] 
        flex items-center justify-center overflow-hidden"
    >
      {/* Shimmer layer */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent" />
      
      {/* Z lettermark */}
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M4 5h16M4 5l16 14M4 19h16"
          stroke="#fff"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
    
    {/* Online indicator dot */}
    <div
      style={{ width: size * 0.22, height: size * 0.22 }}
      className="absolute -bottom-0.5 -right-0.5 rounded-full 
        bg-white
        border-2 border-[#0a0a0a]"
    />
  </div>
);

const AgentProgressPanel = ({ 
  taskId, 
  steps,
  isActive 
}: { 
  taskId: string | null; 
  steps: string[];
  isActive: boolean;
}) => {
  const [progress, setProgress] = useState<any[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [iterations, setIterations] = useState(0);
  const [bgTaskData, setBgTaskData] = useState<any>(null);
  
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const apiKey = import.meta.env.VITE_SYNOD_API_KEY || 'local-dev-key';
  
  useEffect(() => {
    if (!taskId || !isActive) return;
    
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${apiUrl}/api/agent/task/${taskId}`, {
          headers: { 'X-API-Key': apiKey }
        });
        const data = await res.json();
        if (data.progress?.length) {
          setProgress(data.progress);
          const doneCount = data.progress.filter((p:any) => p.status === 'done').length;
          setCurrentStep(doneCount);
          
          const iterCount = data.progress.filter(
            (p:any) => p.step.startsWith('Iteration')
          ).length;
          setIterations(iterCount);
          setBgTaskData(data);
        }
      } catch {}
    }, 1500);
    
    return () => clearInterval(interval);
  }, [taskId, isActive]);
  
  if (!isActive && progress.length === 0) return null;
  
  return (
    <div className="mx-4 mb-3 p-4 rounded-[18px] slide-up
      bg-[#0a0a0a]
      border border-white/10">
      
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"/>
          <span className="text-[10px] font-bold text-white uppercase tracking-wider">
            Agent Working
          </span>
        </div>
        <span className="text-[9px] text-[#2a2a2a] font-mono">
          {progress.filter(p => p.status === 'done').length}/{steps.length} done
        </span>
      </div>
      
      {/* Progress bar */}
      <div className="w-full h-0.5 bg-[rgba(255,255,255,0.04)] rounded-full mb-4">
        <div 
          className="h-full bg-white 
            rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${steps.length ? 
              (progress.filter(p=>p.status==='done').length / steps.length) * 100 : 0}%`
          }}
        />
      </div>
      
      {bgTaskData?.plan && (
        <div className="mb-3 px-1">
          <p className="text-[10px] text-[#444] font-mono leading-relaxed">
            <span className="text-emerald-500/70">Goal: </span>
            {bgTaskData.plan.goal?.slice(0,80)}
          </p>
        </div>
      )}
      
      {iterations > 1 && (
        <div className="flex items-center gap-1.5 mb-3">
          <div className="w-1 h-1 rounded-full bg-amber-400"/>
          <span className="text-[9px] text-amber-400 font-medium">
            Self-correcting... iteration {iterations}
          </span>
        </div>
      )}
      
      {/* Steps */}
      <div className="space-y-2.5">
        {steps.map((step, i) => {
          const prog = progress[i];
          const done = prog?.status === 'done';
          const running = !done && i === progress.filter(p=>p.status==='done').length;
          const pending = !done && !running;
          
          return (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center 
                flex-shrink-0 transition-all duration-300 ${
                done    ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]' :
                running ? 'bg-white/20 border border-white/50 animate-pulse' :
                          'bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]'
              }`}>
                {done && <Check size={9} className="text-black" strokeWidth={3}/>}
                {running && <div className="w-1.5 h-1.5 rounded-full bg-white"/>}
              </div>
              <span className={`text-[11.5px] transition-colors ${
                done    ? 'text-[#3a3a3a] line-through' :
                running ? 'text-[#ccc] font-medium' :
                          'text-[#2a2a2a]'
              }`}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function App() {
  useEffect(() => {
    // Initialize agent singleton and attach to window
    // so all parts of the app can access it
    if (!(window as any).awaisAgent) {
      try {
        const agentInstance = AgentCore.getInstance();
        (window as any).awaisAgent = agentInstance;
        console.log('[Zenox] AgentCore initialized');
      } catch (e) {
        console.error('[Zenox] AgentCore init failed:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('zenox-user-id')) {
      const id = 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
      localStorage.setItem('zenox-user-id', id);
    }
  }, []);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentTaskSteps, setAgentTaskSteps] = useState<string[]>([]);
  const [currentAgentTaskId, setCurrentAgentTaskId] = useState<string | null>(null);
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
  const [apiKeysStatus, setApiKeysStatus] = useState<Record<string, string> | null>(null);
  
  useEffect(() => {
    if (settingsOpen) {
      setApiKeysStatus(null);
      const API_URL = import.meta.env.VITE_API_URL || '';
      const API_KEY = import.meta.env.VITE_SYNOD_API_KEY || 'local-dev-key';
      fetch(`${API_URL}/api/health/keys`, {
        headers: { 'X-API-Key': API_KEY }
      })
      .then(res => res.json())
      .then(data => setApiKeysStatus(data))
      .catch(() => setApiKeysStatus({ 'Backend': 'Offline ❌' }));
    }
  }, [settingsOpen]);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('zenox-theme') as 'dark' | 'light') || 'dark');
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('zenox-font-size') || 'M');
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>(
    (localStorage.getItem('zenox-response-style') as ResponseStyle) || 'balanced'
  );
  
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{msg: string; type: 'success' | 'error' | 'info'} | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [lastProject, setLastProject] = useState<any>(null);
  
  const [userProjects, setUserProjects] = useState<any[]>([]);
  const [showProjects, setShowProjects] = useState(false);

  const fetchUserProjects = async () => {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const API_KEY = import.meta.env.VITE_SYNOD_API_KEY || 'local-dev-key';
    const userId = localStorage.getItem('zenox-user-id') || 'local-user';
    try {
      const res = await fetch(`${API_URL}/api/projects/${userId}`, {
        headers: { 'X-API-Key': API_KEY }
      });
      if (res.ok) {
        const data = await res.json();
        setUserProjects(data.projects || []);
      }
    } catch {}
  };
  
  useEffect(() => { fetchUserProjects(); }, []);

  const pollTaskCompletion = async (
    bgTaskId: string,
    newMessages: Message[],
    activeId: string
  ) => {
    const maxAttempts = 120; // 10 minutes
    let attempts = 0;
    
    const poll = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(poll);
        setIsLoading(false);
        setMsgStatus('idle');
        return;
      }
      
      try {
        // Poll the new fire-and-forget background task endpoint
        const res = await fetch(
          `${API_URL}/api/agent/task/${bgTaskId}`,
          { headers: { 'X-API-Key': API_KEY } }
        );
        
        if (!res.ok) return; // Still initializing
        
        const bgTask = await res.json();
        
        if (bgTask.status === 'complete' && bgTask.result) {
          clearInterval(poll);
          const result = bgTask.result;
          setLastProject(result);
          
          const completionMsg: Message = {
            role: 'assistant',
            content: [
              `✅ **Done!**`,
              ``,
              `**Task:** ${result.prompt}`,
              result.repo_url ? `**GitHub:** ${result.repo_url}` : '',
              result.deploy_url ? `**Live at:** ${result.deploy_url}` : '',
              !result.repo_url && !result.deploy_url 
                ? `**Code generated** — download below ↓` : ''
            ].filter(Boolean).join('\n'),
            timestamp: Date.now() / 1000
          };
          
          const finalMessages = [...newMessages, completionMsg];
          setMessages(finalMessages);
          setStreamingContent('');
          saveCurrentConversation(finalMessages, activeId);
          setIsLoading(false);
          setMsgStatus('idle');
          setCurrentAgentTaskId(null);
          
          // Cleanup background task
          fetch(`${API_URL}/api/agent/task/${bgTaskId}`, {
            method: 'DELETE',
            headers: { 'X-API-Key': API_KEY }
          }).catch(() => {});
          return;
        }
        
        if (bgTask.status === 'failed') {
          clearInterval(poll);
          const errorMsg: Message = {
            role: 'assistant',
            content: `❌ **Task Failed**\n\n${bgTask.error || 'Unknown error'}`,
            timestamp: Date.now() / 1000
          };
          const finalMessages = [...newMessages, errorMsg];
          setMessages(finalMessages);
          setStreamingContent('');
          saveCurrentConversation(finalMessages, activeId);
          setIsLoading(false);
          setMsgStatus('idle');
          setCurrentAgentTaskId(null);
          return;
        }
        
        // Still running — update streaming text with latest progress
        if (bgTask.progress?.length > 0) {
          const lastStep = bgTask.progress[bgTask.progress.length - 1];
          const iterSteps = bgTask.progress.filter(
            (p:any) => p.step.startsWith('Iteration')
          ).length;
          setStreamingContent(
            `> ${lastStep.step}${iterSteps > 1 ? ` (self-correcting, pass ${iterSteps})` : ''}` +
            `\n> ${lastStep.detail || 'Working...'}`
          );
        }
        
      } catch { /* polling failure is non-fatal */ }
    }, 2000); // poll every 2 seconds
  };

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, [theme]);
  
  // Image Feature
  const [selectedImage, setSelectedImage] = useState<File|null>(null);
  const [imagePreview, setImagePreview] = useState<string|null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  // Features
  const MEMORY_KEY = "zenox-memory";
  const [memories, setMemories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]'); }
    catch { return []; }
  });
  const [uploadedFile, setUploadedFile] = useState<{name:string; content:string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  
  // Voice feature
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  
  const [agentMode, setAgentMode] = useState(false);
  const [showInputOptions, setShowInputOptions] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const prevBackendStatus = useRef<string>('checking');

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
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memories.slice(0, 50)));
  }, [memories]);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_URL}/api/health`);
        if (res.ok) {
          const data = await res.json();
          if (prevBackendStatus.current === 'offline') {
            showToast('✅ Zenox is back online', 'success');
          }
          prevBackendStatus.current = 'online';
          setBackendStatus('online');
          setBackendModel(data.model || 'Gemini 2.5 Flash');
          setLastChecked(Date.now());
        } else {
          setBackendStatus('offline');
          prevBackendStatus.current = 'offline';
        }
      } catch {
        setBackendStatus('offline');
        prevBackendStatus.current = 'offline';
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Strategy #3: Proactive Reverse Prompting (Idle Brain)
  /*
  useEffect(() => {
    if (agentMode) {
      const idleBrain = IdleBrain.getInstance();
      idleBrain.setCallback((msg) => {
        const aiMsg: Message = { role: 'assistant', content: msg, timestamp: Date.now() };
        setMessages(prev => [...prev, aiMsg]);
        showToast('Zenox has a proactive suggestion for you', 'info');
      });
      idleBrain.start('ai-tester');
      
      return () => {
        idleBrain.stop();
      };
    }
  }, [agentMode]);
  */

  const isUserScrolling = useRef(false);

  useEffect(() => {
    if (!isUserScrolling.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, streamingContent, msgStatus]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    isUserScrolling.current = !isNearBottom;
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 500 * 1024) {
      showToast('File must be under 500KB', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setUploadedFile({ name: file.name, content });
      showToast(`File loaded: ${file.name}`, 'success');
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processMemoryCommand = (text: string): string | null => {
    const rememberMatch = text.match(/(?:remember|note|save|keep in mind)[:\s]+(.+)/i);
    if (rememberMatch) {
      const memToSave = rememberMatch[1].trim();
      setMemories(prev => {
        const newMems = [memToSave, ...prev.filter(m => m !== memToSave)];
        return newMems.slice(0, 50);
      });
      return memToSave;
    }
    const forgetMatch = text.match(/(?:forget|delete|remove) memory[:\s]+(.+)/i);
    if (forgetMatch) {
      const memToForget = forgetMatch[1].trim();
      setMemories(prev => prev.filter(m => !m.toLowerCase().includes(memToForget.toLowerCase())));
      return null;
    }
    return null;
  };

  const handleSendWithMessage = async (overrideMessage: string) => {
    isUserScrolling.current = false;
    setShowScrollBtn(false);
    if (!overrideMessage.trim() && !selectedImage && !uploadedFile || isLoading) return;

    const savedMemory = processMemoryCommand(overrideMessage);
    if (savedMemory) {
      showToast(`Remembered: "${savedMemory.slice(0, 40)}..."`, 'success');
    }

    let finalMessage = overrideMessage.trim();
    if (uploadedFile) {
      finalMessage = `${finalMessage}\n\n[FILE: ${uploadedFile.name}]\n\`\`\`\n${uploadedFile.content.slice(0, 8000)}\n\`\`\``;
      setUploadedFile(null);
    }

    let imageBase64: string | undefined;
    let imageType: string | undefined;
    let currentImagePreview = imagePreview;

    if (selectedImage) {
      imageBase64 = await toBase64(selectedImage);
      imageType = selectedImage.type;
    }

    const userMsg: Message = { 
      role: 'user', 
      content: finalMessage, 
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
      if (agentMode) {
        setMsgStatus('thinking');
        setStreamingContent("> Initializing Zenox Subroutines...\n");
        const agent = (window as any).awaisAgent;
        if (!agent) throw new Error("AgentCore not initialized");
        
        let classification = null;
        try {
          const classRes = await fetch(`${API_URL}/api/agent/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
            body: JSON.stringify({ prompt: userMsg.content })
          });
          classification = await classRes.json();
          setAgentTaskSteps(classification.steps || []);
        } catch (err) {
          console.error("Classification failed:", err);
          setAgentTaskSteps([
            "Analyzing your request",
            "Generating solution",
            "Testing",
            "Saving result"
          ]);
        }
        
        if (!classification || classification.type !== 'chat') {
          // Use fire-and-forget endpoint — returns task_id instantly
          const runRes = await fetch(`${API_URL}/api/agent/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
            body: JSON.stringify({
              prompt: userMsg.content,
              language: classification?.language || 'javascript',
              task_type: classification?.type || 'general'
            })
          });
          
          if (!runRes.ok) throw new Error(`Agent start failed: ${runRes.status}`);
          const { task_id: bgTaskId } = await runRes.json();
          
          setCurrentAgentTaskId(bgTaskId);
          pollTaskCompletion(bgTaskId, newMessages, activeId);
          return;
        } else {
          setStreamingContent("");
          setAgentTaskSteps([]);
        }
      }

      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ 
          message: userMsg.content,
          history: historyToUse,
          response_style: responseStyle,
          image: imageBase64,
          image_type: imageType,
          memories: memories.slice(0, 10),
          agent_mode: agentMode
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

        setSuggestions([]);  // clear old ones
        // Fetch suggestions without awaiting (background)
        fetch(`${API_URL}/api/suggestions`, {
          method: 'POST',
          headers: {'Content-Type':'application/json','X-API-Key':API_KEY},
          body: JSON.stringify({
            last_response: fullContent.slice(0, 500),
            original_question: userMsg.content
          })
        }).then(r => r.json()).then(data => {
          if (data.suggestions?.length) setSuggestions(data.suggestions);
        }).catch(() => {});
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error(err);
      let errorText = "Something went wrong. Please try again.";
      if (!navigator.onLine) errorText = "No internet connection. Check your network and retry.";
      else if (err.message.includes('503')) errorText = "Zenox backend is sleeping. It wakes in ~30 seconds on free tier.";
      else if (err.message.includes('401') || err.message.includes('403')) errorText = "API key error. Check your VITE_SYNOD_API_KEY setting.";
      else if (err.message.includes('429')) errorText = "Rate limit reached. Wait a moment before sending again.";
      
      const errorMsg: Message = { role: 'assistant', content: `[SYSTEM_ERROR] ${errorText}`, timestamp: Date.now() };
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
    isUserScrolling.current = false;
    setShowScrollBtn(false);
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
    isUserScrolling.current = false;
    setShowScrollBtn(false);
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
    const content = `Zenox v4.1 Conversation\nExported: ${new Date().toLocaleString()}\n${'─'.repeat(40)}\n\n${lines.join('\n')}`;
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
    const userMsgs = messages.filter(m => m.role === 'user');
    if (userMsgs.length === 0) return; // Nothing to regenerate
    const lastUserMsg = userMsgs[userMsgs.length - 1];
    if (!lastUserMsg?.content) return;
    
    // Remove messages from last user message onward
    const lastUserIdx = messages.map(m=>m.role).lastIndexOf('user');
    if (lastUserIdx === -1) return;
    setMessages(prev => prev.slice(0, lastUserIdx));
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
        const match = part.match(/```([\w\-\:\.]*)\n([\s\S]*?)```/);
        const language = match ? match[1] : '';
        const codeContent = match ? match[2] : part.slice(3, -3);

        if (language === 'plan') {
          return (
            <div key={index} className="my-4 bg-[#111] border border-purple-500/30 rounded-xl overflow-hidden shadow-[0_0_15px_rgba(168,85,247,0.1)]">
              <div className="bg-purple-500/10 px-4 py-2 border-b border-purple-500/20 flex items-center gap-2">
                <Terminal size={14} className="text-purple-400" />
                <span className="text-xs font-bold text-purple-300 uppercase tracking-widest">Agent Task Plan</span>
              </div>
              <div className="p-4 text-sm text-[#ddd] leading-relaxed">
                {codeContent.split('\n').filter(l => l.trim()).map((line, i) => (
                  <div key={i} className="flex items-start gap-2 mb-1.5">
                    <div className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">{i+1}</div>
                    <span>{line.replace(/^\d+[\.\)]\s*/, '')}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (language.startsWith('file:')) {
          const filename = language.split(':')[1] || 'file.txt';
          
          const handleDownload = () => {
            const blob = new Blob([codeContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            showToast(`${filename} saved`, 'success');
          };

          return (
            <div key={index} className="relative bg-[#0d0d0d] rounded-xl border border-blue-500/30 my-4 overflow-hidden shadow-[0_0_15px_rgba(59,130,246,0.1)]">
              <div className="flex items-center justify-between px-4 py-2 border-b border-blue-500/20 bg-blue-500/10">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-blue-400" />
                  <span className="text-xs font-bold text-blue-300">{filename}</span>
                </div>
                <button onClick={handleDownload} className="text-blue-400 hover:text-blue-300 flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest bg-blue-500/20 hover:bg-blue-500/30 px-3 py-1.5 rounded transition-colors">
                  <Download size={12} /> Save File
                </button>
              </div>
              <pre className="p-4 overflow-x-auto text-blue-300 text-sm font-mono leading-relaxed">
                <code>{codeContent}</code>
              </pre>
            </div>
          );
        }

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

  const mightSearch = (text: string) => {
    const triggers = ['today','current','latest','now','news',
      'price','weather','recent','right now','this week'];
    return triggers.some(t => text.toLowerCase().includes(t));
  };

  const [expandedShortcuts, setExpandedShortcuts] = useState(false);

  return (
    <div className="flex h-[100dvh] w-full bg-atmosphere text-[#f0f0f0] overflow-hidden selection:bg-white/20">
      
      {/* Toast */}
      <div className={`fixed bottom-6 right-6 z-[100] transition-all duration-300 ${toast ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-4 opacity-0 scale-95 pointer-events-none'}`}>
        <div className={`glass-panel px-4 py-3 rounded-xl text-sm font-medium shadow-[0_10px_30px_rgba(0,0,0,0.5)] border flex items-center gap-2 ${
          toast?.type === 'success' ? 'border-green-500/30 text-green-200' :
          toast?.type === 'error' ? 'border-red-500/30 text-red-200' :
          'border-white/10 text-white'
        }`}>
          {toast?.msg}
        </div>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 xl:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } xl:translate-x-0 fixed xl:static inset-y-0 left-0 w-full md:w-[280px] bg-[#0b0b0b] border-r border-[rgba(255,255,255,0.06)] flex flex-col z-50 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-[4px_0_24px_rgba(0,0,0,0.5)]`}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(255,255,255,0.05)]">
          <ZenoxLogo size={34} />
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold text-white tracking-[-0.3px]">
              Zenox
            </h1>
            <p className="text-[10px] text-[#3a3a3a] tracking-[0.08em] uppercase font-medium">
              by awais
            </p>
          </div>
          {/* Status badge */}
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] 
            font-bold uppercase tracking-wider ${
            backendStatus === 'online' 
              ? 'bg-white/10 text-white border border-white/20' 
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              backendStatus === 'online' ? 'bg-white animate-pulse' : 'bg-red-400'
            }`} />
            {backendStatus === 'online' ? 'live' : 'off'}
          </div>
        </div>

        <div className="px-3 py-3">
          <button onClick={startNewChat}
            className="w-full flex items-center justify-center gap-2 
              py-2.5 px-4 rounded-[14px] text-[13px] font-semibold
              bg-white hover:bg-gray-200
              text-black transition-all duration-200 active:scale-[0.98]
              shadow-[0_2px_12px_rgba(255,255,255,0.1)]
              hover:shadow-[0_4px_20px_rgba(255,255,255,0.2)]">
            <Plus size={15} className="opacity-90" />
            New Chat
          </button>
        </div>
        
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-[10px]
            bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)]">
            <Search size={12} className="text-[#333] shrink-0" />
            <input
              id="search-input"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-xs text-[#888] 
                placeholder:text-[#333] outline-none min-w-0"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 scrollbar-thin">
          {conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center opacity-60">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-4 border border-white/5">
                <MessageSquare size={20} className="text-[#555]" />
              </div>
              <p className="text-xs text-[#666] leading-relaxed font-medium">
                Neural pathways clear.<br/>
                Initiate a new sequence.
              </p>
            </div>
          )}
          
          {filteredConversations.map((conv) => {
            const isActive = currentConversationId === conv.id;
            return (
              <button 
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 
                  mx-1 rounded-[12px] text-left transition-all duration-150 group
                  ${isActive 
                    ? 'bg-white/10 border border-white/20' 
                    : 'hover:bg-[rgba(255,255,255,0.03)] border border-transparent'
                  }`}>
                <MessageSquare size={13} className={isActive ? 'text-white' : 'text-[#333]'} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] truncate font-medium ${isActive ? 'text-white' : 'text-[#666]'}`}>
                    {conv.title || "Untitled Session"}
                  </p>
                  <p className="text-[9px] text-[#2a2a2a] mt-0.5">
                    {getTimeAgo(conv.createdAt)}
                  </p>
                </div>
                <div 
                  onClick={(e) => { e.stopPropagation(); deleteConversation(e, conv.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md
                    text-[#333] hover:text-red-400 transition-all shrink-0">
                  <X size={11} />
                </div>
              </button>
            );
          })}

          {userProjects.length > 0 && (
            <div className="border-t border-[#1a1a1a] mt-2 pt-2 mx-1">
              <button 
                onClick={() => setShowProjects(!showProjects)}
                className="w-full flex items-center justify-between px-3 py-2 
                  text-xs text-[#555] hover:text-[#888] transition-colors">
                <span className="font-bold uppercase tracking-wider">
                  My Projects ({userProjects.length})
                </span>
                <span>{showProjects ? '▲' : '▼'}</span>
              </button>
              
              {showProjects && (
                <div className="space-y-1 pb-2">
                  {userProjects.slice(0,5).map(p => (
                    <div key={p.id} className="px-3 py-2 rounded-[12px] hover:bg-[rgba(255,255,255,0.03)] 
                      transition-colors cursor-default">
                      <p className="text-[12px] text-[#888] truncate font-medium">
                        {(p.prompt || 'Untitled Project').slice(0, 35)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {p.deploy_url && p.deploy_url.startsWith('http') && (
                          <a href={p.deploy_url} target="_blank" rel="noreferrer"
                            className="text-[10px] text-white hover:text-gray-300">
                            Live ↗
                          </a>
                        )}
                        {p.repo_url && (
                          <a href={p.repo_url} target="_blank" rel="noreferrer"
                            className="text-[10px] text-[#555] hover:text-[#888]">
                            GitHub ↗
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-[rgba(255,255,255,0.04)] bg-transparent flex justify-between items-center mx-2 my-1">
          <button onClick={() => setSettingsOpen(true)} className="p-2 w-full flex items-center justify-center gap-2 text-[12px] font-medium text-[#666] hover:text-white hover:bg-[rgba(255,255,255,0.04)] rounded-[12px] transition-all" aria-label="Settings">
            <Settings size={14} />
            Settings
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full relative w-full overflow-hidden">
        
        {/* Mobile Header */}
        <header className="xl:hidden flex items-center justify-between p-3 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md shrink-0 z-10 sticky top-0">
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-[#a0a0a0] active:text-white bg-white/5 rounded-full" aria-label="Open sidebar">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <ZenoxLogo size={18} className="text-white" />
            <div className="font-semibold italic text-white tracking-tight text-sm">Zenox</div>
          </div>
          <button onClick={() => setSettingsOpen(true)} className="p-2 text-[#a0a0a0] active:text-white bg-white/5 rounded-full" aria-label="Settings">
            <Settings size={20} />
          </button>
        </header>

        {/* Desktop Header */}
        <header className="hidden xl:flex items-center justify-between px-8 py-4 border-b border-white/5 bg-[#0a0a0a]/60 backdrop-blur-xl shrink-0 z-10 sticky top-0">
          <div className="text-sm text-[#888] font-semibold tracking-wide">
            {currentConversationId 
              ? conversations.find(c=>c.id===currentConversationId)?.title || 'New Session'
              : 'Zenox System'}
          </div>
          <div className="flex items-center gap-3">
            {messages.length > 1 && (
              <button 
                onClick={exportConversation}
                className="text-xs font-semibold text-[#888] hover:text-white flex items-center gap-1.5 transition-all bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-transparent shadow-sm"
              >
                <Download size={14} />
                Export
              </button>
            )}
            <button 
              onClick={() => setSettingsOpen(true)}
              className="text-[#888] hover:text-white transition-all p-2 rounded-lg bg-white/5 hover:bg-white/10 shadow-sm"
              aria-label="Settings"
            >
              <Settings size={18} />
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-8 md:px-8 shrink-0 relative min-h-0 scrollbar-thin">
          <div className="max-w-3xl mx-auto min-h-full flex flex-col justify-end">
            
            {(messages.length === 0 || (messages.length === 1 && messages[0].content.includes('explore today'))) && !streamingContent ? (
              <div className="h-full flex flex-col items-center justify-center 
                px-6 py-12 fade-in">
                
                {/* Logo with glow */}
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-white/5 blur-2xl rounded-full scale-150" />
                  <ZenoxLogo size={56} animate />
                </div>
                
                {/* Headline */}
                <div className="text-center mb-2">
                  <h1 className="text-[28px] font-bold text-white tracking-[-0.5px] mb-2">
                    What can I help you with?
                  </h1>
                  <p className="text-[13px] text-[#3a3a3a] font-medium">
                    Chat, build, research — Zenox handles it all
                  </p>
                </div>
                
                {/* Agent mode badge */}
                {agentMode && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
                    bg-white/5 border border-white/10 mb-8 mt-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"/>
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                      Agent Mode Active
                    </span>
                  </div>
                )}
                
                {!agentMode && <div className="mb-8" />}
                
                {/* Example cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
                  {[
                    { icon: '⚡', text: 'Build a React dashboard', tag: 'Code' },
                    { icon: '🔍', text: 'Research quantum computing', tag: 'Research' },
                    { icon: '🌐', text: 'Create a landing page', tag: 'Build' },
                    { icon: '📊', text: 'Explain machine learning', tag: 'Learn' },
                  ].map((ex, i) => (
                    <button key={i}
                      style={{animationDelay:`${i*60}ms`}}
                      onClick={() => handleSendWithMessage(ex.text)}
                      className="group flex items-center gap-3 p-3.5 rounded-[14px]
                        bg-[#000] border border-[rgba(255,255,255,0.06)]
                        hover:border-[rgba(255,255,255,0.15)] hover:bg-[#111]
                        transition-all duration-200 text-left slide-up
                        hover:shadow-[0_4px_20px_rgba(255,255,255,0.03)]">
                      <span className="text-xl leading-none">{ex.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] text-[#888] group-hover:text-[#ccc] 
                          font-medium transition-colors truncate">
                          {ex.text}
                        </p>
                      </div>
                      <span className="text-[9px] font-bold text-[#2a2a2a] 
                        group-hover:text-white/60 uppercase tracking-wider 
                        transition-colors flex-shrink-0">
                        {ex.tag}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-8 pb-4">
                {messages.map((msg, idx) => {
                  const isLast = idx === messages.length - 1;
                  return (
                    msg.role === 'user' ? (
                      <div key={idx} className="flex justify-end msg-animate">
                        <div className="max-w-[78%] md:max-w-[65%]">
                          <div className="px-4 py-3 rounded-[18px] rounded-br-[6px]
                            bg-[#111] border border-white/10
                            text-[13.5px] text-[#e8e8e8] leading-[1.6] font-[400]">
                            {msg.imageUrl && (
                              <div className="mb-3 rounded-xl overflow-hidden border border-white/10 shadow-lg inline-block">
                                <img src={msg.imageUrl} alt="Attached" className="max-w-[200px] max-h-[200px] object-cover" />
                              </div>
                            )}
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                          </div>
                          <p className="text-[9px] text-[#2a2a2a] text-right mt-1 pr-1">
                            {formatTime(msg.timestamp)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div key={idx} className="flex items-start gap-3 msg-animate group">
                        <ZenoxLogo size={26} />
                        <div className="flex-1 min-w-0 max-w-[78%] md:max-w-[68%]">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[11px] font-bold text-white tracking-wide">
                              ZENOX
                            </span>
                            <span className="text-[9px] text-[#2a2a2a] font-mono">
                              {backendModel}
                            </span>
                          </div>
                          <div className="px-4 py-3 rounded-[18px] rounded-tl-[6px]
                            bg-[#0f0f0f] border border-[rgba(255,255,255,0.06)]
                            text-[13.5px] text-[#d8d8d8] leading-[1.7] font-[400]
                            markdown-body">
                            {msg.content.includes('[SYSTEM_ERROR]') ? (
                               <div className="text-yellow-400/90 whitespace-pre-wrap font-medium flex gap-2 items-start"><AlertTriangle size={18} className="shrink-0 mt-0.5" /> <span>{msg.content.replace('[SYSTEM_ERROR]', '').trim()}</span></div>
                            ) : renderMarkdown(msg.content)}
                          </div>
                          {/* Action bar */}
                          <div className="flex items-center gap-1 mt-1.5 opacity-0 
                            group-hover:opacity-100 transition-opacity">
                            <button onClick={() => {
                                navigator.clipboard.writeText(msg.content);
                                setCopiedIndex(idx);
                                setTimeout(() => setCopiedIndex(null), 2000);
                                showToast('Copied to clipboard', 'success');
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px]
                                text-[#333] hover:text-[#888] hover:bg-[rgba(255,255,255,0.04)]
                                transition-all">
                              {copiedIndex === idx ? <Check size={10}/> : <Copy size={10}/>}
                              {copiedIndex === idx ? 'Copied' : 'Copy'}
                            </button>
                            {isLast && !isLoading && (
                              <button onClick={handleRegenerate}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px]
                                  text-[#333] hover:text-[#888] hover:bg-[rgba(255,255,255,0.04)]
                                  transition-all">
                                <RefreshCw size={10}/> Retry
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  );
                })}
                
                {msgStatus !== 'idle' && (
                  <div className="w-full flex justify-start animate-[fadeIn_0.3s_ease]">
                    <div className="flex items-center gap-3 p-4 
                      bg-[#0f0f0f] rounded-[18px] border border-[rgba(255,255,255,0.06)]
                      max-w-[200px]">
                      {/* 3D rotating Z */}
                      <div className="w-8 h-8 relative flex items-center justify-center flex-shrink-0">
                        <div className="absolute inset-0 rounded-xl 
                          bg-white/5 
                          animate-[breathe_2s_ease-in-out_infinite]" />
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                          className="animate-[spin3d_3s_linear_infinite]"
                          style={{transformOrigin:'center', transform:'perspective(100px)'}}>
                          <path d="M4 5h16M4 5l16 14M4 19h16"
                            stroke="#fff" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      
                      {/* Text with typing dots */}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-[#666]">Zenox</span>
                          <div className="flex items-center gap-0.5">
                            {[0,200,400].map(delay => (
                              <div key={delay}
                                style={{animationDelay:`${delay}ms`}}
                                className="w-1 h-1 rounded-full bg-white 
                                  animate-[typing_1.2s_ease-in-out_infinite]" />
                            ))}
                          </div>
                        </div>
                        <p className="text-[9px] text-[#333] mt-0.5">
                          {msgStatus === 'thinking' ? 'Processing...' : 
                           msgStatus === 'streaming' ? 'Writing response...' : 'Working...'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {streamingContent && (
                  <div className="w-full flex justify-start animate-[fadeIn_0.2s_ease]">
                    <div className="flex items-start gap-3 msg-animate group">
                      <ZenoxLogo size={26} />
                      <div className="flex-1 min-w-0 max-w-[78%] md:max-w-[68%]">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[11px] font-bold text-white tracking-wide">
                            ZENOX
                          </span>
                          <span className="text-[9px] text-[#2a2a2a] font-mono">
                            {backendModel}
                          </span>
                        </div>
                        <div className="px-4 py-3 rounded-[18px] rounded-tl-[6px]
                          bg-[#0f0f0f] border border-[rgba(255,255,255,0.06)]
                          text-[13.5px] text-[#d8d8d8] leading-[1.7] font-[400]
                          markdown-body">
                          {renderMarkdown(streamingContent)}
                          <span className="inline-block w-2 h-4 ml-1 bg-white animate-pulse align-middle" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {suggestions.length > 0 && !isLoading && (
                  <div className="flex flex-wrap gap-2 mt-2 pb-2">
                    {suggestions.map((s, i) => (
                      <button key={i}
                        onClick={() => {
                          setSuggestions([]);
                          handleSendWithMessage(s);
                        }}
                        className="px-3 py-1.5 text-xs border border-[#2a2a2a] rounded-full
                          bg-[#111] text-[#888] hover:text-white hover:border-white/50
                          hover:bg-[#1a1a1a] transition-all"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
          
          {showScrollBtn && (
            <button 
              onClick={() => {
                isUserScrolling.current = false;
                setShowScrollBtn(false);
                messagesEndRef.current?.scrollIntoView({behavior:'smooth'});
              }}
              className="absolute bottom-4 right-4 z-10 bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-full p-3 md:p-2 shadow-xl border-t border-[#333] flex items-center gap-1.5 text-[10px] md:text-xs animate-[fadeIn_0.2s_ease]"
              aria-label="Scroll to bottom"
            >
              <ArrowDown size={14} />
            </button>
          )}
        </div>

        {/* Input Area */}
        <div className="shrink-0 px-4 pb-4 pt-3 bg-[#0b0b0b] 
          border-t border-[rgba(255,255,255,0.04)] z-20">
          <div className="max-w-3xl mx-auto relative group flex flex-col justify-end">
            
            <AgentProgressPanel
              taskId={currentAgentTaskId}
              steps={agentTaskSteps}
              isActive={agentMode && (msgStatus === 'thinking' || msgStatus === 'streaming')}
            />

            {lastProject && agentMode && (
              <div className="mx-4 mb-4 p-4 bg-[#0a0a0a] border border-white/10 rounded-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 size={14} className="text-white" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Project Complete
                  </span>
                </div>
                <p className="text-sm text-white mb-3 font-medium">{lastProject.prompt}</p>
                <div className="flex flex-wrap gap-2">
                  {lastProject.repo_url && (
                    <a href={lastProject.repo_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 
                        bg-[#1a1a1a] border border-[#2a2a2a] text-[#aaa] 
                        hover:text-white hover:border-[#444] rounded-lg transition-all">
                      GitHub Repo
                    </a>
                  )}
                  {lastProject.deploy_url && lastProject.deploy_url.startsWith('http') && (
                    <a href={lastProject.deploy_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 
                        bg-white/10 border border-white/20 text-white 
                        hover:bg-white/20 rounded-lg transition-all font-semibold">
                      🚀 View Live Site
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Image/file preview chips */}
            {(imagePreview || uploadedFile) && (
              <div className="flex items-center gap-2 mb-2 px-1">
                {imagePreview && (
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-[10px]
                    bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
                    <img src={imagePreview} className="w-6 h-6 object-cover rounded-md"/>
                    <span className="text-[11px] text-[#666]">Image</span>
                    <button onClick={() => { setSelectedImage(null); setImagePreview(null); if(imageInputRef.current) imageInputRef.current.value=''; }} className="text-[#333] hover:text-red-400 ml-1">
                      <X size={10}/>
                    </button>
                  </div>
                )}
                {uploadedFile && (
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-[10px]
                    bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
                    <FileText size={12} className="text-blue-400"/>
                    <span className="text-[11px] text-[#666] max-w-[100px] truncate">
                      {uploadedFile.name}
                    </span>
                    <button onClick={() => setUploadedFile(null)} 
                      className="text-[#333] hover:text-red-400 ml-1">
                      <X size={10}/>
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {/* Status row */}
            {msgStatus !== 'idle' && (
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  msgStatus === 'sending' ? 'bg-yellow-400 animate-pulse' :
                  msgStatus === 'thinking' ? 'bg-blue-400 animate-ping' :
                  'bg-white animate-pulse'
                }`} />
                <span className="text-[10px] text-[#444]">
                  {msgStatus === 'sending' ? 'Sending...' :
                   msgStatus === 'thinking' ? 'Zenox is thinking...' :
                   'Zenox is writing...'}
                </span>
              </div>
            )}
            
            {/* Main input box */}
            <div className={`flex items-end gap-2 px-3 py-3 rounded-[16px]
              bg-[#111] border transition-all duration-200 ${
              inputValue.length > 0 
                ? 'border-white/20 shadow-[0_0_0_3px_rgba(255,255,255,0.05)]' 
                : 'border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.12)]'
            }`}>
              
              {/* Left tools */}
              <div className="flex items-center gap-0.5 self-end pb-0.5">
                <button onClick={() => imageInputRef.current?.click()}
                  className="p-1.5 rounded-lg text-[#2a2a2a] hover:text-[#888] 
                    hover:bg-[rgba(255,255,255,0.05)] transition-all">
                  <ImageIcon size={15}/>
                </button>
                <button onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-lg text-[#2a2a2a] hover:text-[#888] 
                    hover:bg-[rgba(255,255,255,0.05)] transition-all">
                  <FileText size={15}/>
                </button>
                <button onClick={toggleVoiceInput}
                  className={`p-1.5 rounded-lg transition-all ${
                  isListening 
                    ? 'text-red-400 bg-red-500/10 animate-pulse' 
                    : 'text-[#2a2a2a] hover:text-[#888] hover:bg-[rgba(255,255,255,0.05)]'
                }`}>
                  {isListening ? <MicOff size={15}/> : <Mic size={15}/>}
                </button>
                <button onClick={() => setAgentMode(!agentMode)}
                  className={`p-1.5 rounded-lg transition-all ml-1 border ${
                  agentMode 
                    ? 'text-white border-white/30 bg-white/10' 
                    : 'text-[#2a2a2a] border-transparent hover:text-[#888] hover:bg-[rgba(255,255,255,0.05)]'
                }`}>
                  <Terminal size={15} className={agentMode ? "animate-pulse" : ""}/>
                </button>
              </div>

              <input type="file" ref={fileInputRef} className="hidden"
                accept=".txt,.md,.py,.js,.ts,.jsx,.tsx,.json,.csv,.html,.css,.xml,.yaml,.yml"
                onChange={handleFileSelect} />
              <input type="file" ref={imageInputRef} className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageSelect} />
              
              {/* Textarea */}
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={e => { setInputValue(e.target.value); setSuggestions([]); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (agentMode && (msgStatus === 'thinking' || msgStatus === 'streaming') && inputValue.trim()) {
                      const agent = (window as any).awaisAgent;
                      if (agent && currentAgentTaskId) {
                        agent.pivotTask(currentAgentTaskId, inputValue.trim());
                        setInputValue('');
                      }
                    } else if (!isLoading) {
                      handleSend();
                    }
                  }
                }}
                placeholder={
                  (agentMode && (msgStatus === 'thinking' || msgStatus === 'streaming'))
                    ? "Micro-Steer / Pivot (e.g. Stop and focus on Y...)"
                    : agentMode 
                      ? "Agent ready... describe the task" 
                      : "Message Zenox..."
                }
                rows={1}
                disabled={
                  isLoading || 
                  backendStatus === 'offline' || 
                  backendStatus === 'checking'
                }
                style={{ resize: 'none', maxHeight: '120px' }}
                className="flex-1 bg-transparent text-[13.5px] text-[#e0e0e0] 
                  placeholder:text-[#2d2d2d] outline-none leading-[1.5] 
                  disabled:opacity-40 min-h-[22px] py-0.5"
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                }}
              />
              
              {/* Send/Stop button */}
              <div className="self-end pb-0.5">
                {isLoading ? (
                  <button onClick={() => {
                      const agent = (window as any).awaisAgent;
                      if (agent && currentAgentTaskId && inputValue.trim()) {
                        agent.pivotTask(currentAgentTaskId, inputValue.trim());
                        setInputValue('');
                      } else {
                        stopGeneration();
                      }
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-[10px]
                      bg-red-500/15 border border-red-500/25 text-red-400 
                      hover:bg-red-500/25 transition-all active:scale-95">
                    {inputValue.trim() && agentMode ? <Send size={13} fill="currentColor"/> : <Square size={13} fill="currentColor"/>}
                  </button>
                ) : (
                  <button onClick={() => handleSendWithMessage(inputValue)}
                    disabled={
                      isLoading || 
                      backendStatus === 'offline' || 
                      backendStatus === 'checking'
                    }
                    className={`w-8 h-8 flex items-center justify-center rounded-[10px]
                      transition-all duration-200 active:scale-95 ${
                      (inputValue.trim() || selectedImage || uploadedFile) && backendStatus !== 'offline'
                        ? 'bg-white hover:bg-gray-200 text-black shadow-[0_2px_8px_rgba(255,255,255,0.2)]'
                        : 'bg-[rgba(255,255,255,0.04)] text-[#2a2a2a] cursor-not-allowed'
                    }`}>
                    <ArrowUp size={15} strokeWidth={2.5}/>
                  </button>
                )}
              </div>
            </div>
            
            {/* Bottom hint */}
            <div className="flex items-center justify-between mt-2 px-1">
              <span className="text-[9px] text-[#222]">
                Enter to send · Shift+Enter for newline
              </span>
              {inputValue.length > 0 && (
                <span className={`text-[9px] font-mono ${
                  inputValue.length > 3000 ? 'text-red-400' : 'text-[#222]'
                }`}>
                  {inputValue.length.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Settings Panel entirely rewritten */}
      {settingsOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xl z-50 transition-opacity" onClick={() => {setSettingsOpen(false); setShowConfirmClear(false)}} />
          <div className="fixed bottom-0 left-0 right-0 md:bottom-auto md:right-0 md:top-0 md:left-auto w-full md:w-[380px] h-[85dvh] md:h-full bg-[#050505]/95 backdrop-blur-xl border-t md:border-t-0 md:border-l border-white/5 z-50 flex flex-col md:animate-[slideInRight_0.3s_ease] rounded-t-3xl md:rounded-none shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-transparent rounded-t-3xl md:rounded-none">
              <div className="flex items-center gap-3">
                <Settings size={20} className="text-green-500" />
                <h2 className="text-xl font-bold text-white tracking-tight font-sans">Settings</h2>
                <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded uppercase tracking-widest font-bold border border-green-500/30">v4.1</span>
              </div>
              <button onClick={() => setSettingsOpen(false)} className="p-2 bg-white/5 hover:bg-white/10 text-[#888] hover:text-white rounded-full transition-all" aria-label="Close settings">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto w-full pb-10 scrollbar-thin">
              
              {/* Appearance */}
              <div className="p-6 border-b border-white/5">
                <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-4 flex items-center gap-2"><div className="w-1 h-1 bg-[#555] rounded-full"></div> Appearance</h3>
                
                <div className="mb-5">
                  <span className="text-xs text-[#888] font-medium block mb-2">Theme</span>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => { setTheme('dark'); localStorage.setItem('zenox-theme', 'dark'); }}
                      className={`flex flex-col items-center justify-center py-4 rounded-xl transition-all ${
                        theme === 'dark' ? 'border-2 border-green-500 bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border border-white/5 bg-white/5 hover:border-white/20 hover:bg-white/10'
                      }`}
                    >
                      <Moon size={16} className={`mb-2 ${theme === 'dark' ? 'text-green-500' : 'text-[#888]'}`} />
                      <span className={`text-xs uppercase tracking-widest text-[10px] ${theme === 'dark' ? 'font-bold text-green-400' : 'font-medium text-[#888]'}`}>Onyx Dark</span>
                    </button>
                    <button 
                      onClick={() => { setTheme('light'); localStorage.setItem('zenox-theme', 'light'); }}
                      className={`flex flex-col items-center justify-center py-4 rounded-xl transition-all ${
                        theme === 'light' ? 'border-2 border-green-500 bg-green-500/10 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border border-white/5 bg-white/5 hover:border-white/20 hover:bg-white/10'
                      }`}
                    >
                      <Sun size={16} className={`mb-2 ${theme === 'light' ? 'text-green-500' : 'text-[#888]'}`} />
                      <span className={`text-xs uppercase tracking-widest text-[10px] ${theme === 'light' ? 'font-bold text-green-400' : 'font-medium text-[#888]'}`}>Pure Light</span>
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-xs text-[#888] font-medium block mb-3">Typography Scale</span>
                  <div className="flex rounded-xl overflow-hidden glass-panel">
                    {['S', 'M', 'L'].map(sz => (
                      <button
                        key={sz}
                        onClick={() => {
                          setFontSize(sz);
                          localStorage.setItem('zenox-font-size', sz);
                        }}
                        className={`flex-1 py-2 text-xs transition-all ${
                          fontSize === sz 
                            ? 'bg-green-500/20 text-green-400 font-bold border-b-2 border-green-500' 
                            : 'bg-transparent text-[#888] hover:bg-white/5 hover:text-white font-medium border-b-2 border-transparent'
                        } ${sz !== 'L' && 'border-r border-white/5'}`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Behavior */}
              <div className="p-6 border-b border-white/5">
                <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-4 flex items-center gap-2"><div className="w-1 h-1 bg-[#555] rounded-full"></div> AI Behavior</h3>
                
                <div className="space-y-3">
                  {[
                    { id: 'balanced', icon: <Zap size={18} />, title: 'Balanced', desc: 'Smart default for most tasks' },
                    { id: 'concise', icon: <Scissors size={18} />, title: 'Concise', desc: 'Short and direct answers only' },
                    { id: 'detailed', icon: <BookOpen size={18} />, title: 'Detailed', desc: 'Deep explanations with examples' },
                    { id: 'creative', icon: <Lightbulb size={18} />, title: 'Creative', desc: 'Imaginative and expansive thinking' }
                  ].map(opt => (
                    <div 
                      key={opt.id}
                      onClick={() => {
                        setResponseStyle(opt.id as ResponseStyle);
                        localStorage.setItem('zenox-response-style', opt.id);
                      }}
                      className={`flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all duration-300 border ${
                        responseStyle === opt.id 
                          ? 'glass-panel border-green-500/30 shadow-[0_0_20px_rgba(34,197,绿,0.1)]' 
                          : 'bg-transparent border-transparent hover:glass-panel hover:border-white/5'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                        responseStyle === opt.id ? 'bg-green-500/10 border-green-500/30' : 'bg-[#111] border-white/5'
                      }`}>
                        <span className="text-base">{opt.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-bold ${responseStyle === opt.id ? 'text-green-400' : 'text-white'}`}>{opt.title}</div>
                        <div className="text-[10px] text-[#888] truncate font-medium">{opt.desc}</div>
                      </div>
                      {responseStyle === opt.id && (
                        <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                          <Check size={12} className="text-green-500" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Chat settings */}
              <div className="p-6 border-b border-white/5">
                <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-4 flex items-center gap-2"><div className="w-1 h-1 bg-[#555] rounded-full"></div> Cortex</h3>
                
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-[#888] font-medium">
                      Memories ({memories.length})
                    </span>
                    {memories.length > 0 && (
                      <button 
                        onClick={() => { setMemories([]); showToast('Memories cleared', 'info'); }}
                        className="text-[10px] text-red-500 hover:text-red-400 font-bold uppercase tracking-widest bg-red-500/10 hover:bg-red-500/20 px-2 py-1 rounded transition-colors"
                      >
                        Purge
                      </button>
                    )}
                  </div>
                  {memories.length === 0 ? (
                    <div className="glass-panel rounded-xl p-4 text-center">
                      <p className="text-xs text-[#555] font-medium">
                        Null data. Instruct Zenox to "remember" parameters.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin">
                      {memories.slice(0, 10).map((mem, i) => (
                        <div key={i} className="flex items-start gap-3 group glass-panel p-2.5 rounded-xl border border-white/5">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-500/50 mt-1.5 shrink-0" />
                          <span className="text-xs text-[#aaa] font-medium flex-1 leading-relaxed truncate" title={mem}>
                            {mem.slice(0, 50)}{mem.length > 50 ? '...' : ''}
                          </span>
                          <button 
                            onClick={() => {
                              setMemories(prev => prev.filter((_, idx) => idx !== i));
                              showToast('Memory extracted', 'info');
                            }}
                            className="bg-black/50 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-[#555] hover:text-red-400 transition-all shrink-0"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-8 mb-6">
                  <span className="text-xs text-[#888] font-medium block mb-3">API Keys Status</span>
                  <div className="glass-panel p-4 rounded-xl border border-white/5 space-y-2">
                    {apiKeysStatus === null ? (
                      <div className="text-xs text-[#666] animate-pulse">Checking status...</div>
                    ) : (
                      Object.entries(apiKeysStatus).map(([keyName, statusStr]) => (
                        <div key={keyName} className="flex justify-between items-center text-xs">
                          <span className="font-mono text-[#888]">{keyName}</span>
                          <span className={`font-medium ${String(statusStr).includes('✅') ? 'text-white' : 'text-red-400'}`}>
                            {String(statusStr)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-8 mb-6">
                  <span className="text-xs text-[#888] font-medium block mb-3">Zenox Blueprint Export</span>
                  <p className="text-[10px] text-[#555] mb-3 leading-relaxed">
                    Compile your agent's synthesized skills, semantic relationship graph, and core configuration into a shareable serialized JSON module.
                  </p>
                  <button 
                    onClick={async () => {
                      const { BlueprintManager } = await import('./modules/agent/BlueprintManager');
                      const json = await BlueprintManager.getInstance().exportBlueprint('ai-tester');
                      const blob = new Blob([json], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `zenox_blueprint_${Date.now()}.json`;
                      a.click();
                      showToast('Blueprint exported successfully', 'success');
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30 rounded-xl transition-all text-xs font-bold uppercase tracking-widest"
                  >
                    <Download size={16} />
                    Export Codex Blueprint
                  </button>
                </div>

                <div className="space-y-3">
                  {messages.length > 0 && (
                    <button 
                      onClick={exportConversation}
                      className="w-full flex items-center justify-center gap-2 p-3 text-xs font-semibold glass-panel rounded-xl text-[#aaa] hover:text-white transition-all shadow-sm md:hover:border-white/10 md:hover:-translate-y-0.5"
                    >
                      <Download size={14} /> EXPORT DATASTREAM
                    </button>
                  )}
                  
                  {showConfirmClear ? (
                    <div className="bg-red-500/10 p-4 rounded-2xl border border-red-500/20 backdrop-blur-md">
                      <p className="text-xs font-semibold text-red-400 text-center mb-4 uppercase tracking-wider">Confirm Neural Purge ({conversations.length} items)</p>
                      <div className="flex gap-2">
                        <button onClick={() => setShowConfirmClear(false)} className="flex-1 py-2 text-xs font-bold glass-panel hover:bg-white/5 rounded-xl text-white transition-colors">Abort</button>
                        <button onClick={clearAllConversations} className="flex-1 py-2 text-xs font-bold bg-red-500 hover:bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)] rounded-xl transition-all">PURGE</button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      disabled={conversations.length===0}
                      onClick={() => setShowConfirmClear(true)}
                      className="w-full flex items-center justify-center gap-2 p-3 text-xs font-semibold border border-red-500/10 rounded-xl text-red-500/70 hover:text-red-400 hover:bg-red-500/5 hover:border-red-500/30 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                    >
                      <Trash2 size={14} /> WIPE COGNITIVE HISTORY
                    </button>
                  )}
                </div>
              </div>

              {/* About section */}
              <div className="p-6">
                <h3 className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-4 flex items-center gap-2"><div className="w-1 h-1 bg-[#555] rounded-full"></div> System INFO</h3>
                
                <div className="glass-panel p-5 rounded-2xl border-white/5 mb-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none group-hover:bg-white/10 transition-colors duration-1000"></div>
                  <div className="text-lg font-black font-sans text-transparent bg-clip-text bg-gradient-to-r from-white to-[#888] tracking-tight block mb-1">Zenox</div>
                  <div className="text-[10px] text-[#666] font-mono tracking-widest uppercase block mb-4">v4.1.0-alpha</div>
                  <div className="text-[10px] text-white font-bold tracking-widest uppercase flex items-center gap-2 mt-1">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.5)]" /> Neural Link Active
                  </div>
                </div>
                
                <div>
                  <button 
                    onClick={() => setExpandedShortcuts(!expandedShortcuts)}
                    className="flex justify-between items-center w-full p-4 glass-panel rounded-xl text-xs font-bold text-[#aaa] hover:text-white transition-all shadow-sm md:hover:border-white/10"
                  >
                    <span className="tracking-wide uppercase">Command Shortcuts</span>
                    <span className="text-[#555] font-mono bg-white/5 w-5 h-5 rounded flex items-center justify-center">{expandedShortcuts ? '-' : '+'}</span>
                  </button>
                  {expandedShortcuts && (
                    <div className="mt-3 grid grid-cols-[1fr,auto] gap-y-3 px-4 py-2 text-[10px] text-[#888]">
                      <span className="font-semibold text-white uppercase tracking-widest flex items-center gap-2"><div className="w-1 h-1 bg-white/30 rounded-full"></div> New Session</span>
                      <kbd className="bg-white/5 border border-white/10 px-2 py-1 rounded-md font-mono text-white/70 shadow-sm">Ctrl+Shift+N</kbd>
                      
                      <span className="font-semibold text-white uppercase tracking-widest flex items-center gap-2"><div className="w-1 h-1 bg-white/30 rounded-full"></div> Global Search</span>
                      <kbd className="bg-white/5 border border-white/10 px-2 py-1 rounded-md font-mono text-white/70 shadow-sm">Ctrl+K</kbd>
                      
                      <span className="font-semibold text-white uppercase tracking-widest flex items-center gap-2"><div className="w-1 h-1 bg-white/30 rounded-full"></div> System Settings</span>
                      <kbd className="bg-white/5 border border-white/10 px-2 py-1 rounded-md font-mono text-white/70 shadow-sm">Ctrl+,</kbd>
                      
                      <span className="font-semibold text-white uppercase tracking-widest flex items-center gap-2"><div className="w-1 h-1 bg-white/30 rounded-full"></div> Abort / Close</span>
                      <kbd className="bg-white/5 border border-white/10 px-2 py-1 rounded-md font-mono text-white/70 shadow-sm">ESC</kbd>
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
