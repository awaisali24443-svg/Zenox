import { GithubManager } from '../github/GithubManager';
import { SandboxManager } from '../sandbox/SandboxManager';
import { RenderManager } from '../render/RenderManager';
import { LLMManager } from './LLMManager';
import { MemoryManager } from './MemoryManager';
import { TaskManager, TaskRecord } from './TaskManager';
import { LifeGraph } from './LifeGraph';

export class AgentCore {
  private github: GithubManager;
  private sandbox: SandboxManager;
  private render: RenderManager;
  private llm: LLMManager;
  private memory: MemoryManager;
  private taskManager: TaskManager;
  private lifeGraph: LifeGraph;
  private isProcessing = false;

  constructor() {
    this.github = GithubManager.getInstance();
    this.sandbox = SandboxManager.getInstance();
    this.render = RenderManager.getInstance();
    this.llm = LLMManager.getInstance();
    this.memory = MemoryManager.getInstance();
    this.taskManager = TaskManager.getInstance();
    this.lifeGraph = LifeGraph.getInstance();
  }

  /**
   * Submit a task to the agent's queue.
   */
  public async submitTask(userId: string, taskPrompt: string): Promise<string> {
    const taskId = await this.taskManager.enqueueTask(userId, taskPrompt);
    this.processQueue();
    return taskId;
  }

  /**
   * Strategy #2: Glass-Box UX & Micro-Steering
   * Allows the user to interrupt or pivot the agent mid-task.
   */
  public async pivotTask(taskId: string, newPrompt: string) {
    console.log(`[AgentCore] Pivoting task ${taskId} with new instruction: ${newPrompt}`);
    await this.taskManager.updateTaskState(taskId, 'processing', { 
      prompt: newPrompt 
    });
    // Record pivot action in memory so context is not lost
    await this.memory.addMemoryEntry('ai-tester', `[Pivot Instruction] User interrupted with: ${newPrompt}`);
    
    // For a deeper abort, we would signal the LLMManager or SandboxManager to abort their promises.
    // For now, this updates the data state and memory so subsequent actions reflect the pivot.
  }

  /**
   * Internal queue processor ensuring tasks run sequentially.
   */
  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.taskManager.getQueueLength() > 0) {
      const task = this.taskManager.dequeueTask();
      if (!task) break;

      await this.executeTaskFromQueue(task);
    }

    this.isProcessing = false;
  }

  /**
   * Phase 1 & 2 & 3: Executes an autonomous task orchestrating Memory, LLM, Sandbox, GitHub, and Render 
   * in isolated modules without exposing complexity to the user / client.
   */
  private async executeTaskFromQueue(task: TaskRecord) {
    try {
      await this.taskManager.updateTaskState(task.id, 'processing');
      
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const apiKey = import.meta.env.VITE_SYNOD_API_KEY || 'local-dev-key';
      const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      };
      
      // Load memory context
      const recentMemories = await this.memory.getRecentMemories(task.userId);
      const memoryContext = recentMemories.map(m => m.content).join('\n');
      
      // STEP 1: Classify the task
      const classRes = await fetch(`${apiUrl}/api/agent/classify`, {
        method: 'POST', headers,
        body: JSON.stringify({ prompt: task.prompt })
      });
      const classification = await classRes.json();
      const language = classification.language || 'javascript';
      const taskType = classification.type || 'general';
      
      // STEP 2: Setup project repo (using YOUR GitHub account)
      const setupRes = await fetch(`${apiUrl}/api/agent/github/setup-project`, {
        method: 'POST', headers,
        body: JSON.stringify({
          prompt: task.prompt,
          user_id: task.userId,
          task_id: task.id
        })
      });
      const setup = await setupRes.json();
      
      if (!setup.success) {
        // No GitHub token configured — still generate code, just skip GitHub
        console.warn('[AgentCore] GitHub not configured — code-only mode');
      }
      
      const repoName = setup.repo_name || `zenox-project-${task.id.slice(0,8)}`;
      
      // STEP 3: Generate code
      const generateRes = await fetch(`${apiUrl}/api/agent/generate`, {
        method: 'POST', headers,
        body: JSON.stringify({
          prompt: `${task.prompt}\n\nContext from past sessions:\n${memoryContext}`,
          language,
          task_type: taskType,
          task_id: task.id
        })
      });
      const generated = await generateRes.json();
      const generatedCode = generated.code || '';
      
      // STEP 4: Execute/test the code
      const executeRes = await fetch(`${apiUrl}/api/agent/execute`, {
        method: 'POST', headers,
        body: JSON.stringify({
          code: generatedCode,
          language,
          task_id: task.id
        })
      });
      const executed = await executeRes.json();
      
      // STEP 5: Commit to GitHub (if configured)
      let repoUrl = setup.repo_url || '';
      if (setup.success && repoName) {
        const commitRes = await fetch(`${apiUrl}/api/agent/github/commit`, {
          method: 'POST', headers,
          body: JSON.stringify({
            repo_name: repoName,
            files: [{ name: `main.${language === 'html' ? 'html' : language === 'python' ? 'py' : 'js'}`, content: generatedCode }],
            message: `Zenox: ${task.prompt.slice(0, 50)}`,
            task_id: task.id
          })
        });
      }
      
      // STEP 6: Deploy (if Render hook configured)
      const deployRes = await fetch(`${apiUrl}/api/agent/render/deploy`, {
        method: 'POST', headers,
        body: JSON.stringify({
          project_name: repoName,
          repo_url: repoUrl,
          task_id: task.id
        })
      });
      const deployed = await deployRes.json();
      const deployUrl = deployed.success ? deployed.url : '';
      
      // STEP 7: Save project record
      await fetch(`${apiUrl}/api/projects/save`, {
        method: 'POST', headers,
        body: JSON.stringify({
          user_id: task.userId,
          prompt: task.prompt,
          repo_name: repoName,
          repo_url: repoUrl,
          deploy_url: deployUrl,
          code: generatedCode,
          language
        })
      });
      
      // Save to memory
      await this.memory.addMemoryEntry(
        task.userId,
        `Built: "${task.prompt}" → ${deployUrl || 'code generated'}`
      );
      
      await this.taskManager.updateTaskState(task.id, 'completed', {
        result: { deployUrl, repoUrl, generatedCode, executionResult: executed.result }
      });

    } catch (error: any) {
      console.error('[AgentCore] Error:', error);
      await this.taskManager.updateTaskState(task.id, 'failed', {
        error: error?.message || 'Unknown error'
      });
    }
  }
}
