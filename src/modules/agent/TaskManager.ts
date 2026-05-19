import { db } from '../db/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'queued';

export interface TaskRecord {
  id: string;
  userId: string;
  prompt: string;
  status: TaskStatus;
  result?: any;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export class TaskManager {
  private static instance: TaskManager;
  private isProcessingQueue = false;
  private queue: string[] = [];
  private taskMap: Map<string, TaskRecord> = new Map();

  private constructor() {}

  public static getInstance(): TaskManager {
    if (!TaskManager.instance) {
      TaskManager.instance = new TaskManager();
    }
    return TaskManager.instance;
  }

  /**
   * Enqueues a new task, saving it to Firestore
   */
  public async enqueueTask(userId: string, prompt: string): Promise<string> {
    const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const taskRecord: TaskRecord = {
      id: taskId,
      userId,
      prompt,
      status: 'queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      this.taskMap.set(taskId, taskRecord);
      this.queue.push(taskId);
      
      if (!!import.meta.env.VITE_FIREBASE_API_KEY) {
        const taskRef = doc(db, 'tasks', taskId);
        await setDoc(taskRef, taskRecord);
      }
      
      console.log(`[TaskManager] Enqueued task: ${taskId}`);
      
      return taskId;
    } catch (e) {
      console.error('[TaskManager] Failed to enqueue task:', e);
      throw e;
    }
  }

  /**
   * Retrieves the next task from the queue
   */
  public dequeueTask(): TaskRecord | null {
    if (this.queue.length > 0) {
      const taskId = this.queue.shift();
      if (taskId && this.taskMap.has(taskId)) {
        return this.taskMap.get(taskId)!;
      }
    }
    return null;
  }

  /**
   * Updates a task's status in Firestore
   */
  public async updateTaskState(taskId: string, status: TaskStatus, additionalData: Partial<TaskRecord> = {}): Promise<void> {
    const task = this.taskMap.get(taskId);
    if (task) {
      this.taskMap.set(taskId, { ...task, status, updatedAt: Date.now(), ...additionalData });
    }
    
    if (!import.meta.env.VITE_FIREBASE_API_KEY) return;
    
    try {
      const taskRef = doc(db, 'tasks', taskId);
      await updateDoc(taskRef, {
        status,
        updatedAt: Date.now(),
        ...additionalData
      });
      console.log(`[TaskManager] Updated task ${taskId} to status: ${status}`);
    } catch (e) {
      console.error(`[TaskManager] Failed to update state for task ${taskId}:`, e);
    }
  }
  
  public getTask(taskId: string): TaskRecord | undefined {
    return this.taskMap.get(taskId);
  }

  public getQueueLength(): number {
    return this.queue.length;
  }
}
