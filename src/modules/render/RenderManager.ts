export interface DeployResult {
  success: boolean;
  url: string;
  message: string;
  note?: string;
}

export class RenderManager {
  private static instance: RenderManager;
  private apiUrl: string;
  private apiKey: string;

  private constructor() {
    this.apiUrl = import.meta.env.VITE_API_URL || '';
    this.apiKey = import.meta.env.VITE_SYNOD_API_KEY || 'local-dev-key';
  }

  public static getInstance(): RenderManager {
    if (!RenderManager.instance) {
      RenderManager.instance = new RenderManager();
    }
    return RenderManager.instance;
  }

  public async deployProject(projectId: string, repoUrl: string, taskId?: string): Promise<string> {
    try {
      const res = await fetch(`${this.apiUrl}/api/agent/render/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({ project_name: projectId, repo_url: repoUrl, task_id: taskId })
      });
      
      const data: DeployResult = await res.json();
      
      if (data.success) {
        return data.url || 'Deploying...';
      } else {
        console.warn('[RenderManager] Deploy failed:', data.message);
        return `Deploy failed: ${data.message}`;
      }
    } catch (e: any) {
      return `Deploy error: ${e.message}`;
    }
  }

  public async getDeployStatus(): Promise<string> {
    try {
      const res = await fetch(`${this.apiUrl}/api/agent/render/status`, {
        headers: { 'X-API-Key': this.apiKey }
      });
      const data = await res.json();
      return data.status || 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
