import React, { useState } from 'react';
import { theme } from '../../../global/theme';
import { register } from '../../../global/api';

export function Register({ onGoToLogin }: { onGoToLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setIsLoading(true);
    try {
      const res = await register(email, password);
      if (res.success) {
        setSuccess('Registration successful. You can now sign in.');
        setTimeout(() => {
          onGoToLogin();
        }, 2000);
      } else {
        setError(res.message || 'Registration failed');
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
        <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Register</h2>
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
          <input 
            type="password" 
            placeholder="Confirm Password" 
            value={confirmPassword} 
            onChange={e => setConfirmPassword(e.target.value)} 
            style={{ padding: '0.75rem', background: theme.background, border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: '6px' }}
            required
          />
          <button 
            type="submit" 
            disabled={isLoading}
            style={{ padding: '0.75rem', background: theme.primary, border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            {isLoading ? 'Registering...' : 'Register'}
          </button>
        </form>
        {error && <div style={{ color: theme.error, marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>{error}</div>}
        {success && <div style={{ color: theme.success, marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>{success}</div>}
        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
          <span style={{ color: theme.textSecondary }}>Already have an account? </span>
          <button onClick={onGoToLogin} style={{ background: 'none', border: 'none', color: theme.primary, cursor: 'pointer', textDecoration: 'underline' }}>Sign In</button>
        </div>
      </div>
    </div>
  );
}
