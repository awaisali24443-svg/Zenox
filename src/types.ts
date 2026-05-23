export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  imageUrl?: string;
  taskId?: string; // link to task for rendering execution details
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  status?: 'idle' | 'running' | 'completed' | 'failed';
}

export type MsgStatus = 'idle' | 'sending' | 'thinking' | 'streaming';
export type ResponseStyle = 'balanced' | 'concise' | 'detailed' | 'creative';

export interface BgTaskData {
  status: 'pending' | 'running' | 'complete' | 'failed';
  plan?: {
    goal?: string;
    [key: string]: any;
  };
  progress?: Array<{
    step: string;
    detail?: string;
    status: 'pending' | 'running' | 'done' | 'failed';
  }>;
  result?: any;
  error?: string;
}
