import React, { createContext, useContext, useState, useEffect, ReactNode, createElement } from 'react';

interface AppStore {
  token: string | null;
  userId: string | null;
  isLoggedIn: boolean;
  currentSessionId: string | null;
  login: (token: string, userId: string) => void;
  logout: () => void;
  setCurrentSession: (id: string) => void;
}

export const StoreContext = createContext<AppStore | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('zenox_token');
    const savedUserId = localStorage.getItem('zenox_userId');
    if (savedToken && savedUserId) {
      setToken(savedToken);
      setUserId(savedUserId);
    }
  }, []);

  const login = (newToken: string, newUserId: string) => {
    setToken(newToken);
    setUserId(newUserId);
    localStorage.setItem('zenox_token', newToken);
    localStorage.setItem('zenox_userId', newUserId);
  };

  const logout = () => {
    setToken(null);
    setUserId(null);
    setCurrentSessionId(null);
    localStorage.removeItem('zenox_token');
    localStorage.removeItem('zenox_userId');
  };

  const setCurrentSession = (id: string) => setCurrentSessionId(id);

  const value = {
    token,
    userId,
    isLoggedIn: !!token,
    currentSessionId,
    login,
    logout,
    setCurrentSession
  };

  return createElement(StoreContext.Provider, { value }, children);
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
}
