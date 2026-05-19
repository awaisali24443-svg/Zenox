export interface FileToCommit {
  name: string;
  content: string;
}

export class GithubManager {
  private static instance: GithubManager;
  private apiUrl: string;
  private apiKey: string;

  private constructor() {
    this.apiUrl = import.meta.env.VITE_API_URL || '';
    this.apiKey = import.meta.env.VITE_SYNOD_API_KEY || 'local-dev-key';
  }

  public static getInstance(): GithubManager {
    if (!GithubManager.instance) {
      GithubManager.instance = new GithubManager();
    }
    return GithubManager.instance;
  }

  public async createRepo(repoName: string, description?: string): Promise<{success:boolean; url:string}> {
    const res = await fetch(`${this.apiUrl}/api/agent/github/create-repo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      },
      body: JSON.stringify({ repo_name: repoName, description })
    });
    const data = await res.json();
    return { success: data.success, url: data.url || '' };
  }

  public async commitAndPush(
    repoName: string,
    files: FileToCommit[],
    message: string,
    taskId?: string
  ): Promise<boolean> {
    const res = await fetch(`${this.apiUrl}/api/agent/github/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      },
      body: JSON.stringify({
        repo_name: repoName,
        files,
        message,
        task_id: taskId
      })
    });
    const data = await res.json();
    return data.success === true;
  }
}
