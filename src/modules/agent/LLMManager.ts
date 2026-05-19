export class LLMManager {
  private static instance: LLMManager;
  private apiUrl: string;
  private apiKey: string;

  private constructor() {
    // BUG FIX: Never call Gemini from frontend - use our backend
    this.apiUrl = import.meta.env.VITE_API_URL || '';
    this.apiKey = import.meta.env.VITE_SYNOD_API_KEY || 'local-dev-key';
  }

  public static getInstance(): LLMManager {
    if (!LLMManager.instance) {
      LLMManager.instance = new LLMManager();
    }
    return LLMManager.instance;
  }

  public async generateCode(
    prompt: string, 
    language: string = 'javascript',
    taskType: string = 'code',
    taskId?: string
  ): Promise<string> {
    const res = await fetch(`${this.apiUrl}/api/agent/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      },
      body: JSON.stringify({ prompt, language, task_type: taskType, task_id: taskId })
    });
    
    if (!res.ok) {
      throw new Error(`LLM backend error: ${res.status}`);
    }
    
    const data = await res.json();
    return data.code || '';
  }
}
