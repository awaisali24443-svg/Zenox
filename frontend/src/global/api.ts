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

async function fetchWithAuth(
  endpoint: string, 
  options: RequestInit = {}
) {
  const token = localStorage.getItem('zenox_token');
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  options.headers = headers;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  let res;
  try {
    res = await fetch(`${BACKEND_URL}${endpoint}`, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return {
        success: false,
        message: 'Request timed out after 90 seconds. Please try again.'
      };
    }
    throw error;
  }

  if (res.status === 401) {
    localStorage.removeItem('zenox_token');
    localStorage.removeItem('zenox_user_id');
    window.location.reload();
    return { success: false, message: 'Session expired. Please log in again.' };
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    return { 
      success: false, 
      message: errorData.detail || `Server error: ${res.status}` 
    };
  }

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

export async function getMessages(sessionId: string) {
  return fetchWithAuth(`/chat/sessions/${sessionId}/messages`);
}

export { BACKEND_URL };

