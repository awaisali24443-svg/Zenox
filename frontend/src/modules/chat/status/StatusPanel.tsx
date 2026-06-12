import React from 'react';
import { theme } from '../../../global/theme';
import { StatusPanelProps } from './status.types';

const typeColors = {
  info: theme.textSecondary,
  success: theme.success,
  warning: '#F59E0B',
  error: theme.error,
};

export function StatusPanel({ statusUpdates }: StatusPanelProps) {
  return (
    <div style={{ width: '300px', background: theme.surface, borderLeft: `1px solid ${theme.border}`, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
      <h3 style={{ color: theme.textPrimary, marginBottom: '0.5rem', fontSize: '1rem' }}>Status</h3>
      {statusUpdates.map((status, i) => (
        <div key={i} style={{ 
          color: typeColors[status.type] || typeColors.info, 
          fontSize: '0.85rem',
          padding: '6px 8px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '4px'
        }}>
          • {status.text}
        </div>
      ))}
    </div>
  );
}
