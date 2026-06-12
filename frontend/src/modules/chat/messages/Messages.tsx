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
      {messages.map(msg => {
        const isUser = msg.role === 'user';
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
