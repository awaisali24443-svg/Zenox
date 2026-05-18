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
      
      console.log('[AgentCore] Starting processing task:', task.id);
      
      // Load Memory Context
      const recentMemories = await this.memory.getRecentMemories(task.userId);
      const memoryContextString = recentMemories.map(m => m.content).join('\n');
      
      // Load Semantic Graph
      const graph = await this.lifeGraph.getGraph(task.userId);
      const graphEdges = graph.edges.map(e => `${e.sourceId} -> ${e.relation} -> ${e.targetId}`).join(', ');

      // 0. LLM Phase (Generate Code)
      const promptContext = `Context from past memory:\n${memoryContextString}\n\nRelationships:\n${graphEdges}\n\nTask: ${task.prompt}`;
      const generatedCode = await this.llm.generateCode(
         `Write a JavaScript function that implements the following feature completely. Include console.log at the end to demonstrate output.\n${promptContext}`,
         'javascript'
      );
      console.log('[AgentCore] LLM generated code length:', generatedCode.length);

      // 1. Sandbox Phase (Test / Gen Code)
      const codeResult = await this.sandbox.executeCode(generatedCode, 'javascript');
      console.log('[AgentCore] Sandbox execution completed:', codeResult);

      // Extract new semantic relationship in background
      this.lifeGraph.extractAndStoreFact(task.userId, task.prompt).catch(console.error);

      // 2. Github Phase (Commit / Version Control)
      const committed = await this.github.commitAndPush('user-project-repo', [{ name: 'feature.js', content: generatedCode }], 'Auto-update by Zenox Agent');
      if (committed) {
        console.log('[AgentCore] Code successfully pushed to version control.');
      }

      // 3. Render Phase (Deployment)
      const deployUrl = await this.render.deployProject('proj_xyz', 'https://github.com/auto/user-project-repo');
      console.log('[AgentCore] Project successfully deployed to:', deployUrl);

      // Add to Short-Term Memory
      await this.memory.addMemoryEntry(task.userId, `Executed prompt: ${task.prompt} | Result: ${codeResult}`);

      // Finalize Task State
      await this.taskManager.updateTaskState(task.id, 'completed', {
        result: {
          deployUrl,
          executionResult: codeResult,
          generatedCode
        }
      });
      console.log(`[AgentCore] Task ${task.id} completed successfully.`);

    } catch (error: any) {
      console.error(`[AgentCore] Error processing task ${task.id}:`, error);
      await this.taskManager.updateTaskState(task.id, 'failed', { error: error?.message || 'Unknown error' });
    }
  }
}
