const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/`);
    const data = await response.json();
    return data.status === 'alive';
  } catch {
    return false;
  }
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('zenox_token');
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  options.headers = headers;
  const res = await fetch(`${BACKEND_URL}${endpoint}`, options);
  return res.json();
}

export async function register(email: string, password: string) {
  return fetchWithAuth('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
}

export async function login(email: string, password: string) {
  return fetchWithAuth('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
}

export async function logout() {
  return fetchWithAuth('/auth/logout', { method: 'POST' });
}

export async function getMe() {
  return fetchWithAuth('/auth/me');
}

export async function sendMessage(
  sessionId: string,
  content: string,
  history: Array<{role: string, content: string}>
) {
  return fetchWithAuth('/chat/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, content, history })
  });
}

export async function createSession(title: string) {
  return fetchWithAuth('/chat/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
}

export async function getSessions() {
  return fetchWithAuth('/chat/sessions');
}

export { BACKEND_URL };

