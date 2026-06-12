import React from 'react';
import { theme } from '../../../global/theme';

export interface SessionData {
  id: string;
  title: string;
  date: string;
}

export interface SessionsProps {
  sessions: SessionData[];
  currentSessionId: string | null;
  onSelect: (id: string) => void;
}

export function Sessions({ sessions, currentSessionId, onSelect }: SessionsProps) {
  return (
    <div style={{ width: '250px', background: theme.surface, borderRight: `1px solid ${theme.border}`, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
      <button style={{
        background: theme.primary,
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        padding: '10px',
        fontWeight: 'bold',
        cursor: 'pointer',
        marginBottom: '1rem'
      }}>
        New Chat
      </button>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
        {sessions.map(s => {
          const isActive = s.id === currentSessionId;
          return (
            <div 
              key={s.id} 
              onClick={() => onSelect(s.id)}
              style={{
                padding: '10px',
                borderRadius: '6px',
                background: isActive ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
            >
              <span style={{ color: isActive ? theme.primary : theme.textPrimary, fontSize: '0.9rem', fontWeight: 500 }}>{s.title}</span>
              <span style={{ color: theme.textSecondary, fontSize: '0.75rem' }}>{s.date}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
