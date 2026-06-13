import React, { useState, useRef } from 'react';
import { theme } from './global/theme';
import { StoreProvider, useStore } from './global/store';
import { Login, Register } from './modules/auth/auth.index';
import { Messages, ChatInput, StatusPanel, Message, StatusUpdate } from './modules/chat/chat.index';
import { Sessions } from './modules/dashboard/sessions/Sessions';
import { sendMessage } from './global/api';
import './index.css';

function MainApp() {
  const { isLoggedIn, currentSessionId, setCurrentSession, logout } = useStore();
  const [showRegister, setShowRegister] = useState(false);
  
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: 'Hello! How can I help you today?', created_at: new Date().toISOString() }
  ]);
  
  const [statusUpdates, setStatusUpdates] = useState<StatusUpdate[]>([
    { text: 'System connected', type: 'success' },
    { text: 'Awaiting input', type: 'info' }
  ]);
  
  const [sessions] = useState([
    { id: 'session1', title: 'Getting Started', date: 'Just now' }
  ]);

  const handleSend = async (text: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    };
  
    const loadingMessage: Message = {
      id: 'loading',
      role: 'assistant',
      content: '...',
      created_at: new Date().toISOString()
    };
  
    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setStatusUpdates(prev => [
      ...prev, 
      { text: 'Thinking...', type: 'info' }
    ]);
  
    const loadingTimer = setTimeout(() => {
      setStatusUpdates(prev => [...prev, {
        text: 'First message may take up to 60 seconds on free hosting...',
        type: 'info'
      }]);
    }, 8000);
    loadingTimerRef.current = loadingTimer;

    const loadingTimer2 = setTimeout(() => {
      setStatusUpdates(prev => [...prev, {
        text: 'Still working, please do not refresh...',
        type: 'info'
      }]);
    }, 20000);
    loadingTimer2Ref.current = loadingTimer2;
  
    const history = messages.map(m => ({
      role: m.role,
      content: m.content
    }));
  
    try {
      const res = await sendMessage(
        currentSessionId || '',
        text,
        history
      );
  
      if (res && res.success) {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: res.content,
          created_at: new Date().toISOString()
        };
        setMessages(prev => 
          prev.filter(m => m.id !== 'loading').concat(aiMessage)
        );
        setStatusUpdates(prev => [
          ...prev, 
          { text: 'Response received', type: 'success' }
        ]);
      } else {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Error: ' + (res?.message || 'Something went wrong. Please try again.'),
          created_at: new Date().toISOString()
        };
        setMessages(prev => 
          prev.filter(m => m.id !== 'loading').concat(errorMessage)
        );
        setStatusUpdates(prev => [
          ...prev, 
          { text: 'Error: ' + (res?.message || 'Unknown error'), type: 'error' }
        ]);
      }
    } catch (err: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Connection failed. Please check your internet and try again.',
        created_at: new Date().toISOString()
      };
      setMessages(prev => 
        prev.filter(m => m.id !== 'loading').concat(errorMessage)
      );
      setStatusUpdates(prev => [
        ...prev, 
        { text: 'Connection failed', type: 'error' }
      ]);
    }

    clearTimeout(loadingTimer);
    clearTimeout(loadingTimer2);
  };

  if (!isLoggedIn) {
     if (showRegister) return <Register onGoToLogin={() => setShowRegister(false)} />
     return <Login onGoToRegister={() => setShowRegister(true)} />;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: theme.background }}>
      <Sessions 
        sessions={sessions} 
        currentSessionId={currentSessionId} 
        onSelect={setCurrentSession} 
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1rem', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: theme.textPrimary, fontWeight: 'bold' }}>Chat</span>
          <button 
            onClick={logout}
            style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
          >
            Sign Out
          </button>
        </div>
        <Messages messages={messages} />
        <ChatInput onSend={handleSend} />
      </div>
      <StatusPanel statusUpdates={statusUpdates} />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <MainApp />
    </StoreProvider>
  );
}
