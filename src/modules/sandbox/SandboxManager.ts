export class SandboxManager {
  private static instance: SandboxManager;
  private apiUrl: string;
  private apiKey: string;

  private constructor() {
    this.apiUrl = import.meta.env.VITE_API_URL || '';
    this.apiKey = import.meta.env.VITE_SYNOD_API_KEY || 'local-dev-key';
  }

  public static getInstance(): SandboxManager {
    if (!SandboxManager.instance) {
      SandboxManager.instance = new SandboxManager();
    }
    return SandboxManager.instance;
  }

  public async executeCode(code: string, language: string, taskId?: string): Promise<string> {
    try {
      const res = await fetch(`${this.apiUrl}/api/agent/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({ code, language, task_id: taskId })
      });
      const data = await res.json();
      return data.result || 'No output';
    } catch (e: any) {
      return `Execution failed: ${e.message}`;
    }
  }
}
