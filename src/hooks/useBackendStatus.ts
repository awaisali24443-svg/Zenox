import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

export function useBackendStatus() {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [model, setModel] = useState('Checking...');
  const prevStatus = useRef<'online'|'offline'|'checking'>('checking');

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_URL}/api/health`);
        if (res.ok) {
          const data = await res.json();
          setStatus('online');
          prevStatus.current = 'online';
          setModel(data.model || 'Gemini 2.5 Flash');
        } else {
          setStatus('offline');
          prevStatus.current = 'offline';
        }
      } catch {
        setStatus('offline');
        prevStatus.current = 'offline';
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return { status, model };
}
