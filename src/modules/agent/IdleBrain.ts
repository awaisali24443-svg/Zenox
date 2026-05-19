import { MemoryManager } from './MemoryManager';

export class IdleBrain {
  private static instance: IdleBrain;
  private memory: MemoryManager;
  private intervalId: any;
  private onProactiveMessage: (msg: string) => void = () => {};

  private constructor() {
    this.memory = MemoryManager.getInstance();
  }

  public static getInstance(): IdleBrain {
    if (!IdleBrain.instance) {
      IdleBrain.instance = new IdleBrain();
    }
    return IdleBrain.instance;
  }

  public setCallback(callback: (msg: string) => void) {
    this.onProactiveMessage = callback;
  }

  public start(userId: string) {
    // Check periodically. For demo, check every 45 secs.
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.analyzeIdle(userId), 45000);
  }

  public stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async analyzeIdle(userId: string) {
    const recent = await this.memory.getRecentMemories(userId, 5);
    if (recent.length === 0) return;
    
    // 25% chance to trigger — don't annoy user
    if (Math.random() > 0.25) return;
    
    const apiUrl = import.meta.env.VITE_API_URL || '';
    const apiKey = import.meta.env.VITE_SYNOD_API_KEY || 'local-dev-key';
    
    const memoryText = recent
      .map(m => m.content)
      .join('\n');
    
    try {
      const res = await fetch(`${apiUrl}/api/agent/proactive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({ memories: memoryText })
      });
      
      if (!res.ok) return;
      const data = await res.json();
      
      if (data.suggestion && data.suggestion.length > 10) {
        this.onProactiveMessage(data.suggestion);
      }
    } catch {
      // Silently fail — proactive messages are not critical
    }
  }
}
