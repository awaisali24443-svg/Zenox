import React, { useState } from 'react';
import { theme } from '../../../global/theme';
import { login } from '../../../global/api';
import { useStore } from '../../../global/store';

export function Login({ onGoToRegister }: { onGoToRegister: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login: storeLogin } = useStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      const res = await login(email, password);
      if (res.success && res.access_token && res.user_id) {
        storeLogin(res.access_token, res.user_id);
      } else {
        setError(res.message || 'Login failed');
      }
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ background: theme.background, color: theme.textPrimary, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: theme.surface, padding: '2rem', borderRadius: '12px', width: '350px', border: `1px solid ${theme.border}` }}>
        <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Sign In</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input 
            type="email" 
            placeholder="Email" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            style={{ padding: '0.75rem', background: theme.background, border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: '6px' }}
            required
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            style={{ padding: '0.75rem', background: theme.background, border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: '6px' }}
            required
          />
          <button 
            type="submit" 
            disabled={isLoading}
            style={{ padding: '0.75rem', background: theme.primary, border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        {error && <div style={{ color: theme.error, marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>{error}</div>}
        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
          <span style={{ color: theme.textSecondary }}>Don't have an account? </span>
          <button onClick={onGoToRegister} style={{ background: 'none', border: 'none', color: theme.primary, cursor: 'pointer', textDecoration: 'underline' }}>Register</button>
        </div>
      </div>
    </div>
  );
}
