import React, { useState, useEffect, useRef } from 'react';
import { 
  Menu, Plus, Copy, Send, Trash2, Check, CheckCircle2, 
  XCircle, Terminal, Square, RefreshCw, Download, Settings,
  ArrowDown, Search, MessageSquare, X, ImageIcon, Mic, MicOff,
  FileText, Zap, Scissors, BookOpen, Lightbulb, Moon, Sun,
  AlertTriangle
} from 'lucide-react';
import { IdleBrain } from './modules/agent/IdleBrain';

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

const ZenoxLogo = ({ size = 32, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={`shrink-0 ${className}`}
  >
    <path d="M12 2L22 7.7735V16.2265L12 22L2 16.2265V7.7735L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 22V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M22 7.7735L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 7.7735L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    <circle cx="12" cy="2" r="1.5" fill="currentColor" />
    <circle cx="22" cy="7.7735" r="1.5" fill="currentColor" />
    <circle cx="2" cy="7.7735" r="1.5" fill="currentColor" />
    <circle cx="22" cy="16.2265" r="1.5" fill="currentColor" />
    <circle cx="2" cy="16.2265" r="1.5" fill="currentColor" />
    <circle cx="12" cy="22" r="1.5" fill="currentColor" />
  </svg>
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
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const apiKey = import.meta.env.VITE_SYNOD_API_KEY || 'local-dev-key';
  
  useEffect(() => {
    if (!taskId || !isActive) return;
    
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${apiUrl}/api/agent/progress/${taskId}`, {
          headers: { 'X-API-Key': apiKey }
        });
        const data = await res.json();
        if (data.progress?.length) {
          setProgress(data.progress);
          const doneCount = data.progress.filter((p:any) => p.status === 'done').length;
          setCurrentStep(doneCount);
        }
      } catch {}
    }, 1500);
    
    return () => clearInterval(interval);
  }, [taskId, isActive]);
  
  if (!isActive && progress.length === 0) return null;
  
  return (
    <div className="mx-4 mb-4 p-4 bg-[#0d0d0d] border border-purple-500/20 
      rounded-2xl">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
        <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
          Agent Working
        </span>
      </div>
      <div className="space-y-2">
        {steps.map((step, i) => {
          const progressItem = progress[i];
          const isDone = progressItem?.status === 'done';
          const isRunning = progressItem?.status === 'running' || i === currentStep;
          const isFailed = progressItem?.status === 'error';
          
          return (
            <div key={i} className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center 
                shrink-0 mt-0.5 text-[10px] font-bold transition-all ${
                isDone ? 'bg-green-500 text-black' :
                isFailed ? 'bg-red-500 text-white' :
                isRunning ? 'bg-purple-500 text-white animate-pulse' :
                'bg-[#1a1a1a] text-[#444] border border-[#2a2a2a]'
              }`}>
                {isDone ? '✓' : isFailed ? '✗' : isRunning ? '→' : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm transition-colors ${
                  isDone ? 'text-[#666] line-through' :
                  isRunning ? 'text-white font-medium' :
                  'text-[#444]'
                }`}>
                  {step}
                </p>
                {progressItem?.detail && (
                  <p className="text-[10px] text-[#555] mt-0.5 truncate font-mono">
                    {progressItem.detail}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function App() {
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

  const pollTaskCompletion = async (taskId: string, newMessages: Message[], activeId: string) => {
    const API_URL = import.meta.env.VITE_API_URL || '';
    const API_KEY = import.meta.env.VITE_SYNOD_API_KEY || 'local-dev-key';
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;
    
    // Fallback: poll TaskManager memory temporarily because projects are only saved at the END
    const poll = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(poll);
        setIsLoading(false);
        setMsgStatus('idle');
        return;
      }
      
      try {
        const res = await fetch(
          `${API_URL}/api/projects/result/${taskId}`,
          { headers: { 'X-API-Key': API_KEY } }
        );
        if (res.ok) {
          const project = await res.json();
          setLastProject(project);
          clearInterval(poll);
          
          // Add completion message to chat
          const completionMsg: Message = {
            role: 'assistant',
            content: `✅ Done! Here's what I built:\n\n**Project:** ${project.prompt}\n${project.repo_url ? `**GitHub:** ${project.repo_url}\n` : ''}${project.deploy_url ? `**Live at:** ${project.deploy_url}` : '**Code generated** — GitHub/Render not configured yet'}`,
            timestamp: Date.now() / 1000
          };
          const finalMessages = [...newMessages, completionMsg];
          setMessages(finalMessages);
          setStreamingContent('');
          saveCurrentConversation(finalMessages, activeId);
          setIsLoading(false);
          setMsgStatus('idle');
          setCurrentAgentTaskId(null);
        } else {
            // Still polling, you could optionally fetch Task status, but UI updates via AgentProgressPanel now
            // Just update the stream mildly
            setStreamingContent(`> Task ID: ${taskId}\n> Synthesizing code...`);
        }
      } catch {}
    }, 5000); // poll every 5 seconds
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
  
  const [agentMode, setAgentMode] = useState(true);
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
        
        try {
          const classRes = await fetch(`${API_URL}/api/agent/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
            body: JSON.stringify({ prompt: userMsg.content })
          });
          const classification = await classRes.json();
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
        
        const userId = localStorage.getItem('zenox-user-id') || 'local-user';
        const taskId = await agent.submitTask(userId, userMsg.content);
        setCurrentAgentTaskId(taskId);
        
        pollTaskCompletion(taskId, newMessages, activeId);
        return;
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
    const lastAssistantIndex = messages.map(m => m.role)
      .lastIndexOf('assistant');
    if (lastAssistantIndex <= 0) return;
    const lastUserMsg = messages
      .slice(0, lastAssistantIndex)
      .filter(m => m.role === 'user')
      .at(-1);
    if (!lastUserMsg) return;
    setMessages(prev => prev.slice(0, lastAssistantIndex));
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
    <div className="flex h-[100dvh] w-full bg-atmosphere text-[#f0f0f0] overflow-hidden selection:bg-green-500/30">
      
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
      } xl:translate-x-0 fixed xl:static inset-y-0 left-0 w-full md:w-[280px] bg-[#050505]/95 backdrop-blur-xl border-r border-white/5 flex flex-col z-50 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-[4px_0_24px_rgba(0,0,0,0.5)]`}>
        <div className="flex items-center justify-between xl:justify-start gap-3 p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-gradient-to-br from-green-500/20 to-purple-500/20 rounded-xl border border-white/10 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
              <ZenoxLogo size={28} className="text-green-500 group-hover:shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all rounded-xl" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-sans text-white tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">Zenox</h1>
              <p className="text-[9px] text-[#888] uppercase tracking-[0.2em] font-medium mt-1">Zenox System</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="xl:hidden p-2 text-[#555] hover:text-white bg-white/5 rounded-full" aria-label="Close sidebar">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <button 
            onClick={startNewChat}
            className="w-full relative overflow-hidden flex items-center justify-between gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl py-3 px-4 transition-all duration-300 group shadow-lg active:scale-[0.98]"
            aria-label="New Chat"
          >
            <span className="font-semibold text-sm tracking-wide">New Session</span>
            <div className="bg-white/10 p-1 rounded-md text-white/70 group-hover:bg-green-500 group-hover:text-white transition-colors">
              <Plus size={16} />
            </div>
          </button>
          
          <div className="relative group">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#555] group-focus-within:text-green-400 transition-colors" />
            <input 
              id="search-input"
              type="text" 
              placeholder="Search cortex..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-green-500/50 focus:bg-[#111] transition-all placeholder-[#444] text-[#eee] shadow-inner"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 scrollbar-thin">
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
          
          {filteredConversations.map((conv) => (
            <div 
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={`group flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all duration-200 relative overflow-hidden ${
                currentConversationId === conv.id 
                  ? 'bg-white/10 text-white shadow-lg border border-white/10' 
                  : 'hover:bg-white/5 text-[#888] border border-transparent'
              }`}
            >
              {currentConversationId === conv.id && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-green-400 to-green-600 rounded-r-sm shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
              )}
              <div className="flex flex-col overflow-hidden w-full pl-1">
                <div className="truncate text-sm pr-6 font-semibold tracking-tight">{conv.title || "Untitled Session"}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded text-[#777] font-mono">{conv.messages.length}</span>
                  <span className="text-[10px] text-[#555] font-medium">{getTimeAgo(conv.createdAt)}</span>
                </div>
              </div>
              <button 
                onClick={(e) => deleteConversation(e, conv.id)}
                className="absolute right-3 opacity-100 xl:opacity-0 xl:group-hover:opacity-100 p-2 text-[#555] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                aria-label="Delete chat"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {userProjects.length > 0 && (
            <div className="border-t border-[#1a1a1a] mt-2 pt-2">
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
                    <div key={p.id} className="px-3 py-2 rounded-xl hover:bg-[#111] 
                      transition-colors cursor-default">
                      <p className="text-xs text-[#888] truncate font-medium">
                        {p.prompt.slice(0, 35)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {p.deploy_url && p.deploy_url.startsWith('http') && (
                          <a href={p.deploy_url} target="_blank" rel="noreferrer"
                            className="text-[10px] text-green-500 hover:text-green-400">
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

        <div className="p-5 border-t border-white/5 bg-[#0a0a0a]/50 flex justify-between items-center backdrop-blur-md">
          <div className="flex items-center gap-2.5 text-xs font-mono">
            {backendStatus === 'online' ? (
              <><div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></div> <span className="text-green-500/80 tracking-wider">ONLINE</span></>
            ) : backendStatus === 'offline' ? (
              <><div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div> <span className="text-red-500/80 tracking-wider">OFFLINE</span></>
            ) : (
              <><div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)] animate-pulse"></div> <span className="text-yellow-500/80 tracking-wider">SYNCING</span></>
            )}
          </div>
          <button onClick={() => setSettingsOpen(true)} className="p-2 text-[#666] hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all" aria-label="Settings">
            <Settings size={16} />
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
            <ZenoxLogo size={18} className="text-green-500" />
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
          <div className="max-w-3xl mx-auto h-full flex flex-col justify-end">
            
            {(messages.length === 0 || (messages.length === 1 && messages[0].content.includes('explore today'))) && !streamingContent ? (
              <div className="flex-1 flex flex-col items-center justify-center -mt-20">
                <div className="p-4 bg-gradient-to-br from-green-500/10 to-purple-500/10 rounded-3xl border border-white/5 shadow-[0_0_30px_rgba(34,197,94,0.05)] mb-6 animate-[fadeIn_0.3s_ease]">
                  <ZenoxLogo size={64} className="text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]" />
                </div>
                <h2 className="text-4xl sm:text-5xl font-bold font-sans text-transparent bg-clip-text bg-gradient-to-r from-white to-white/50 tracking-tight mb-3 text-center animate-[fadeIn_0.5s_ease]">
                  How can I help you today?
                </h2>
                <p className="text-base text-[#666] mb-12 text-center animate-[fadeIn_0.7s_ease] font-medium max-w-md">
                  Zenox is ready to code, assist, and execute autonomous tasks for you.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl px-4 animate-[fadeIn_0.9s_ease]">
                  {[
                    "Deploy a new React component",
                    "Analyze my Python script",
                    "Optimize this algorithm",
                    "Build an autonomous agent"
                  ].map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setInputValue(prompt);
                        setTimeout(() => handleSendWithMessage(prompt), 10);
                      }}
                      className="group p-5 text-left border border-white/5 glass-panel md:hover:bg-white/5 rounded-2xl text-[#888] transition-all duration-300 transform md:hover:-translate-y-1 md:hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)] md:hover:border-green-500/30"
                    >
                      <div className="font-semibold text-sm group-hover:text-white transition-colors">{prompt}</div>
                      <div className="text-[10px] text-[#555] uppercase tracking-widest mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Press to explore &rarr;</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-8 pb-4">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`w-full flex animate-[fadeIn_0.3s_ease] ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`relative max-w-[92%] sm:max-w-[85%] lg:max-w-[75%] rounded-3xl p-5 md:p-6 ${
                      msg.role === 'user' 
                        ? 'bg-gradient-to-br from-green-600/90 to-green-800/90 border border-green-400/30 text-white shadow-[0_10px_40px_rgba(34,197,94,0.15)] rounded-br-sm' 
                        : 'glass-panel text-[#f0f0f0] rounded-bl-sm shadow-[0_10px_40px_rgba(0,0,0,0.3)]'
                    }`}>
                      {msg.role === 'assistant' && (
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(msg.content);
                            setCopiedIndex(idx);
                            setTimeout(() => setCopiedIndex(null), 2000);
                            showToast('Copied to clipboard', 'success');
                          }}
                          className="absolute top-4 right-4 text-[#555] md:hover:text-white transition-colors bg-[#111] border border-white/5 p-2 rounded-lg"
                          aria-label="Copy message"
                        >
                          {copiedIndex === idx ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        </button>
                      )}
                      
                      {msg.role === 'user' && msg.imageUrl && (
                        <div className="mb-4 rounded-xl overflow-hidden border border-white/20 shadow-lg inline-block">
                          <img src={msg.imageUrl} alt="Attached" className="max-w-[200px] max-h-[200px] object-cover" />
                        </div>
                      )}
                      
                      <div className={`leading-relaxed text-[var(--chat-font-size)] [&_p]:mb-3 [&_li]:mb-1.5`}>
                        {msg.role === 'assistant' && msg.content.includes('[SYSTEM_ERROR]') ? (
                           <div className="text-yellow-400/90 whitespace-pre-wrap font-medium flex gap-2 items-start"><AlertTriangle size={18} className="shrink-0 mt-0.5" /> <span>{msg.content.replace('[SYSTEM_ERROR]', '').trim()}</span></div>
                        ) : msg.role === 'assistant' ? (
                          renderMarkdown(msg.content)
                        ) : (
                          <div className="whitespace-pre-wrap font-medium">{msg.content}</div>
                        )}
                      </div>
                      
                      <div className={`text-[10px] uppercase tracking-[0.15em] mt-3 font-semibold ${
                        msg.role === 'user' ? 'text-green-200/60' : 'text-[#555]'
                      }`}>
                        {formatTime(msg.timestamp)}
                      </div>

                      {msg.content.startsWith('[SYSTEM_ERROR]') && (
                        <button 
                          onClick={() => {
                            // Find the last user message before this error
                            const msgIndex = messages.indexOf(msg);
                            const userMsgBefore = messages
                              .slice(0, msgIndex)
                              .filter(m => m.role === 'user')
                              .at(-1);
                            if (!userMsgBefore) return;
                            setMessages(prev => prev.filter((_, i) => i < msgIndex));
                            handleSendWithMessage(userMsgBefore.content);
                          }}
                          className="flex items-center gap-1.5 text-xs font-semibold text-red-400 
                            hover:text-red-300 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10
                            rounded-lg px-3 py-2 mt-3 transition-all"
                        >
                          <RefreshCw size={12} />
                          RETRY GENERATION
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                
                {msgStatus === 'thinking' && (
                  <div className="w-full flex justify-start animate-[fadeIn_0.3s_ease]">
                    <div className="max-w-[92%] sm:max-w-[85%] lg:max-w-[70%] rounded-3xl p-5 glass-panel rounded-bl-sm border-t-2 border-t-green-500/50">
                      <div className="flex items-center gap-3 text-[#777] text-xs font-medium uppercase tracking-widest">
                        {mightSearch(messages[messages.length-1]?.content || '') ? (
                          <>
                            <span className="animate-spin text-green-500"><RefreshCw size={14} /></span>
                            Scanning reality...
                          </>
                        ) : (
                          <>
                            <span className="flex gap-1">
                              {[0,150,300].map(d => (
                                <span key={d} className="w-2 h-2 bg-green-500 rounded-full animate-bounce"
                                  style={{animationDelay:`${d}ms`}} />
                              ))}
                            </span>
                            Zenox is thinking...
                          </>
                        )}
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
                    className="flex items-center gap-1.5 text-xs text-[#555] md:hover:text-white transition-colors mt-2 ml-1 p-2 md:p-0"
                    aria-label="Regenerate">
                    <RefreshCw size={12} />
                    Regenerate
                  </button>
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
                          bg-[#111] text-[#888] hover:text-white hover:border-green-500/50
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
              onClick={() => messagesEndRef.current?.scrollIntoView({behavior:'smooth'})}
              className="absolute bottom-4 right-4 z-10 bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-full p-3 md:p-2 shadow-xl border-t border-[#333] flex items-center gap-1.5 text-[10px] md:text-xs animate-[fadeIn_0.2s_ease]"
              aria-label="Scroll to bottom"
            >
              <ArrowDown size={14} />
            </button>
          )}
        </div>

        {/* Input Area */}
        <div className="shrink-0 pt-0 pb-6 px-2 md:px-8 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent sticky bottom-0 z-20">
          <div className="max-w-3xl mx-auto relative group">
            
            {isListening && (
              <div className="flex items-center gap-2 text-xs font-semibold text-red-500 mb-2 px-3 animate-pulse bg-red-500/10 w-fit rounded-full py-1.5 border border-red-500/20 backdrop-blur-sm shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                Listening... Speak now
              </div>
            )}
            
            {msgStatus !== 'idle' && !isListening && (
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest mb-2 px-3 animate-[fadeIn_0.2s_ease]">
                {msgStatus === 'sending' && <span className="text-yellow-500 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div> Sending payload...</span>}
                {msgStatus === 'thinking' && <span className="text-blue-500 flex items-center gap-2 animate-pulse"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping"></div> Cortex processing...</span>}
                {msgStatus === 'streaming' && <span className="text-green-500 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div> Neural output synthesizing...</span>}
              </div>
            )}
            
            {selectedImage && imagePreview && (
              <div className="flex items-center gap-3 px-3 py-2 glass-panel rounded-2xl border-white/10 mb-2 mx-1 shadow-lg shadow-black/50">
                <img src={imagePreview} className="w-16 h-16 object-cover rounded-xl border border-white/10" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{selectedImage.name}</p>
                  <p className="text-[10px] text-[#888] font-mono mt-1">{(selectedImage.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button onClick={() => { setSelectedImage(null); setImagePreview(null); if(imageInputRef.current) imageInputRef.current.value=''; }} className="p-2 text-[#555] hover:text-red-400 hover:bg-white/5 rounded-full transition-all" aria-label="Remove image">
                  <X size={16} />
                </button>
              </div>
            )}

            {uploadedFile && (
              <div className="flex items-center gap-3 px-3 py-2 glass-panel rounded-2xl border-white/10 mb-2 mx-1 shadow-lg shadow-black/50">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <FileText size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white font-semibold truncate">{uploadedFile.name}</p>
                  <p className="text-[10px] text-[#888] font-mono mt-1">
                    {(uploadedFile.content.length / 1000).toFixed(1)}KB stored
                  </p>
                </div>
                <button onClick={() => setUploadedFile(null)} 
                  className="text-[#555] hover:text-red-400 p-2 hover:bg-white/5 rounded-full transition-all">
                  <X size={16} />
                </button>
              </div>
            )}

            <AgentProgressPanel
              taskId={currentAgentTaskId}
              steps={agentTaskSteps}
              isActive={agentMode && (msgStatus === 'thinking' || msgStatus === 'streaming')}
            />

            {lastProject && agentMode && (
              <div className="mx-4 mb-4 p-4 bg-[#0d1a0d] border border-green-500/30 rounded-2xl">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 size={14} className="text-green-400" />
                  <span className="text-xs font-bold text-green-400 uppercase tracking-wider">
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
                        bg-green-900/40 border border-green-700/50 text-green-300 
                        hover:bg-green-900/60 rounded-lg transition-all font-semibold">
                      🚀 View Live Site
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className={`glass-panel rounded-3xl p-2 transition-all duration-300 flex items-end relative overflow-visible ${
              isLoading ? 'border-white/5 opacity-80' : 
              agentMode ? 'border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.15)] bg-purple-500/5 focus-within:shadow-[0_0_40px_rgba(168,85,247,0.25)]' :
              'border-white/10 focus-within:border-green-400/50 focus-within:shadow-[0_0_25px_rgba(34,197,94,0.15)] shadow-2xl shadow-black/50 hover:border-white/20'
            }`}>
              <div className="relative shrink-0 flex items-end mb-1 mx-0.5">
                <button
                  onClick={() => setShowInputOptions(!showInputOptions)}
                  className={`p-2 transition-all rounded-xl min-w-[40px] min-h-[40px] flex items-center justify-center z-30 relative ${showInputOptions ? 'bg-white/10 text-white' : 'text-[#666] hover:text-white hover:bg-white/5'}`}
                  aria-label="More options"
                >
                  <Plus size={20} className={`transition-transform duration-300 ${showInputOptions ? 'rotate-45' : 'rotate-0'}`} />
                </button>
                
                {/* Popover Menu */}
                {showInputOptions && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowInputOptions(false)}></div>
                    <div className="absolute bottom-full left-0 mb-3 bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex flex-col gap-1 shadow-[0_10px_40px_rgba(0,0,0,0.5)] origin-bottom-left animate-[fadeIn_0.2s_ease] z-30 min-w-[180px]">
                    <button onClick={() => { fileInputRef.current?.click(); setShowInputOptions(false); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-[#aaa] hover:text-white hover:bg-white/5 rounded-xl transition-all">
                      <FileText size={16} className="text-blue-400" /> Upload File
                    </button>
                    <button onClick={() => { imageInputRef.current?.click(); setShowInputOptions(false); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-[#aaa] hover:text-white hover:bg-white/5 rounded-xl transition-all">
                      <ImageIcon size={16} className="text-emerald-400" /> Upload Image
                    </button>
                    <button onClick={() => { toggleVoiceInput(); setShowInputOptions(false); }} className={`flex items-center gap-3 px-3 py-2.5 text-sm font-semibold hover:bg-white/5 rounded-xl transition-all ${isListening ? 'text-red-400 bg-red-400/10' : 'text-[#aaa] hover:text-white'}`}>
                      {isListening ? <MicOff size={16} className="animate-pulse" /> : <Mic size={16} className="text-red-400" />} 
                      {isListening ? "Stop Voice" : "Voice Input"}
                    </button>
                    <div className="h-px bg-white/10 my-1 mx-2" />
                    <button onClick={() => { setAgentMode(!agentMode); setShowInputOptions(false); }} className={`flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-xl transition-all ${agentMode ? 'text-purple-400 bg-purple-500/10 border border-purple-500/20' : 'text-[#aaa] hover:text-white hover:bg-white/5 border border-transparent'}`}>
                      <Terminal size={16} className={agentMode ? 'animate-pulse text-purple-400' : 'text-purple-400'} /> 
                      Agent Mode {agentMode && 'ON'}
                    </button>
                  </div>
                  </>
                )}
              </div>

              <input type="file" ref={fileInputRef} className="hidden"
                accept=".txt,.md,.py,.js,.ts,.jsx,.tsx,.json,.csv,.html,.css,.xml,.yaml,.yml"
                onChange={handleFileSelect} />
              <input type="file" ref={imageInputRef} className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageSelect} />
              
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (e.target.value.length === 0) setSuggestions([]);
                }}
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
                disabled={!agentMode && isLoading}
                rows={1}
                className="flex-1 max-h-[200px] min-h-[44px] bg-transparent resize-none outline-none py-3 px-2 text-base md:text-sm text-[#f0f0f0] placeholder:text-[#555555] disabled:opacity-50"
                style={{ height: inputValue.split('\n').length > 1 ? `${Math.min(inputValue.split('\n').length * 24 + 28, 200)}px` : '44px' }}
              />
              
              <div className="flex-shrink-0 self-end mb-1 mr-1 ml-1">
                {(agentMode && (msgStatus === 'thinking' || msgStatus === 'streaming')) ? (
                  <button 
                    onClick={() => {
                      const agent = (window as any).awaisAgent;
                      if (agent && currentAgentTaskId && inputValue.trim()) {
                        agent.pivotTask(currentAgentTaskId, inputValue.trim());
                        setInputValue('');
                      } else {
                        stopGeneration();
                      }
                    }}
                    className={`p-3 md:p-2 rounded-xl transition-transform active:scale-95 flex items-center justify-center ${
                      inputValue.trim() 
                        ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.5)] hover:bg-purple-500' 
                        : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    }`}
                    title={inputValue.trim() ? "Pivot Task" : "Stop Generation"}
                  >
                    {inputValue.trim() ? <Send size={18} /> : <Square size={18} fill="currentColor" />}
                  </button>
                ) : isLoading ? (
                  <button onClick={stopGeneration} className="p-3 md:p-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all" aria-label="Stop generation">
                    <Square size={18} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={(!inputValue.trim() && !selectedImage && !uploadedFile) || inputValue.length > 4000}
                    className={`p-3 md:p-2 rounded-xl transition-transform active:scale-95 flex items-center justify-center ${
                      (!inputValue.trim() && !selectedImage && !uploadedFile) || inputValue.length > 4000
                        ? 'bg-transparent text-[#555] cursor-not-allowed'
                        : 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)] hover:bg-green-400'
                    }`}
                    title={inputValue.length > 4000 ? "Message too long (max 4000 chars)" : "Send message"}
                    aria-label="Send message"
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
              {inputValue.length > 0 && (
                <span className={`text-[10px] font-mono ${
                  inputValue.length > 3000 ? 'text-red-400' :
                  inputValue.length > 1500 ? 'text-yellow-400' :
                  'text-[#333]'
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
                  <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none group-hover:bg-green-500/10 transition-colors duration-1000"></div>
                  <div className="text-lg font-black font-sans text-transparent bg-clip-text bg-gradient-to-r from-white to-[#888] tracking-tight block mb-1">Zenox</div>
                  <div className="text-[10px] text-[#666] font-mono tracking-widest uppercase block mb-4">v4.1.0-alpha</div>
                  <div className="text-[10px] text-green-400 font-bold tracking-widest uppercase flex items-center gap-2 mt-1">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" /> Neural Link Active
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
