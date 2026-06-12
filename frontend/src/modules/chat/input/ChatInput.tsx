import React, { useState } from 'react';
import { theme } from '../../../global/theme';
import { ChatInputProps } from './input.types';

export function ChatInput({ onSend }: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const val = text.trim();
    if (val) {
      onSend(val);
      setText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ padding: '1rem', background: theme.background, borderTop: `1px solid ${theme.border}`, display: 'flex', gap: '0.5rem' }}>
      <input 
        type="text" 
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        style={{
          flex: 1,
          padding: '12px',
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: '8px',
          color: theme.textPrimary,
          outline: 'none'
        }}
      />
      <button 
        onClick={handleSend}
        style={{
          padding: '0 20px',
          background: theme.primary,
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        Send
      </button>
    </div>
  );
}
