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

export { BACKEND_URL };

