import React, { useEffect, useState } from 'react';
import { checkHealth } from './global/api';
import { theme } from './global/theme';
import './index.css';

export default function App() {
  const [status, setStatus] = useState<'connecting' | 'alive' | 'offline'>('connecting');

  useEffect(() => {
    checkHealth().then((isAlive) => {
      setStatus(isAlive ? 'alive' : 'offline');
    });
  }, []);

  let color = theme.textSecondary;
  let text = 'Connecting...';

  if (status === 'alive') {
    color = theme.success;
    text = 'Zenox is alive';
  } else if (status === 'offline') {
    color = theme.error;
    text = 'Backend offline';
  }

  return (
    <div style={{ color: color, background: theme.background, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {text}
    </div>
  );
}
