import React, { useEffect, useRef } from 'react';
import { theme } from '../../../global/theme';
import { Message } from './messages.types';

export interface MessagesProps {
  messages: Message[];
}

export function Messages({ messages }: MessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={containerRef} style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', background: theme.background }}>
      <style>
        {`
          @keyframes bounce {
            0%, 80%, 100% { transform: translateY(0) }
            40% { transform: translateY(-6px) }
          }
        `}
      </style>
      {messages.map(msg => {
        const isUser = msg.role === 'user';
        if (msg.id === 'loading' || msg.content === '...') {
          return (
            <div key={msg.id} style={{
              alignSelf: 'flex-start',
              background: theme.surface,
              color: theme.textPrimary,
              padding: '12px',
              borderRadius: '12px',
              maxWidth: '70%',
            }}>
              <div style={{ display: 'flex', gap: '4px', padding: '8px', alignItems: 'center' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#888888', animation: 'bounce 1s infinite', animationDelay: '0s' }}></div>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#888888', animation: 'bounce 1s infinite', animationDelay: '0.2s' }}></div>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#888888', animation: 'bounce 1s infinite', animationDelay: '0.4s' }}></div>
              </div>
            </div>
          );
        }
        return (
          <div key={msg.id} style={{
            alignSelf: isUser ? 'flex-end' : 'flex-start',
            background: isUser ? theme.primary : theme.surface,
            color: isUser ? '#fff' : theme.textPrimary,
            padding: '12px',
            borderRadius: '12px',
            maxWidth: '70%',
            lineHeight: '1.5'
          }}>
            {msg.content}
          </div>
        );
      })}
    </div>
  );
}
