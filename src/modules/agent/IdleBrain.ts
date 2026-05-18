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
    console.log("[IdleBrain] Scanning past tasks and context...");
    // Mocking an insight generation for demonstration of the Proactive Reverse Prompting Strategy (#3)
    const recent = await this.memory.getRecentMemories(userId);
    
    // In a real system, we'd send memory to LLM and ask "Does the user need something proactively based on this?"
    // For this demo, if they have memories, we generate a proactive mock prompt if random check passes.
    
    // 30% chance to trigger proactively during idle hook to not annoy user
    if (Math.random() > 0.3) return;

    const proactiveMessages = [
      "I noticed you've been working on UI components recently. I took the liberty of searching for the latest modular design trends. Should I draft a summary?",
      "It looks like you usually review deployment logs around this time. Should I run a diagnostic on your latest GitHub commits?",
      "I've been analyzing your recent memory context in the background. There's a chance you'll need the deployment script run next. Want me to trigger it?"
    ];

    const message = proactiveMessages[Math.floor(Math.random() * proactiveMessages.length)];
    this.onProactiveMessage(message);
  }
}
