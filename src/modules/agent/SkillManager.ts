import { GoogleGenAI } from '@google/genai';
import { SandboxManager } from '../sandbox/SandboxManager';
import { getFirestore, collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../db/firebase';

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  jsCode: string;
  schema: Record<string, any>;
  status: 'draft' | 'testing' | 'pending_approval' | 'active' | 'failed';
  createdAt: number;
  updatedAt: number;
}

/**
 * SkillManager handles the "Self-Synthesizing" toolchain for Zenox.
 * 
 * Phase 1: Gap Detection (Agent realizes it can't do something)
 * Phase 2: Synthesis (LLM writes the tool wrapper)
 * Phase 3: Sandbox Verification (Test the generated JS code safely)
 * Phase 4: Persistence (Save as pending_approval and trigger Email)
 * Phase 5: Owner Approval (Awais checks email/dashboard and approves)
 */
export class SkillManager {
  private static instance: SkillManager;
  private sandbox: SandboxManager;
  private ownerEmail = "awaisali00000728@gmail.com";

  private constructor() {
    this.sandbox = SandboxManager.getInstance();
  }

  public static getInstance(): SkillManager {
    if (!SkillManager.instance) {
      SkillManager.instance = new SkillManager();
    }
    return SkillManager.instance;
  }

  /**
   * Generates a new script based on a capability gap.
   */
  public async synthesizeSkill(goalDescription: string): Promise<AgentSkill> {
    console.log(`[SkillManager] Initiating Synthesis for goal: ${goalDescription}`);
    
    // TODO: Connect this to LLMManager to generate the JS Code and the Gemini Function Declaration Schema
    const mockGeneratedCode = `
      export default async function execute(args) {
        console.log("Executing dynamic skill with args:", args);
        return { success: true, data: "mock data" };
      }
    `;

    // 1. Run in Sandbox to verify it compiles and doesn't hallucinate
    try {
      await this.sandbox.executeCode(mockGeneratedCode, 'javascript');
      console.log(`[SkillManager] Sandbox verification passed.`);
    } catch (e) {
      console.error(`[SkillManager] Sandbox verification failed.`, e);
      throw new Error("Synthetic code failed verification.");
    }

    // 2. Persist to Firestore as pending approval (Human-In-The-Loop)
    const newSkill: AgentSkill = {
      id: `skill_${Date.now()}`,
      name: 'DynamicSkill_' + Date.now(),
      description: goalDescription,
      jsCode: mockGeneratedCode,
      schema: { type: 'object', properties: {} },
      status: 'pending_approval',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      // Save the skill in draft/pending state
      await setDoc(doc(db, 'skills', newSkill.id), newSkill);

      // Trigger an email notification using the Firebase Trigger Email Extension pattern
      await addDoc(collection(db, 'mail'), {
        to: this.ownerEmail,
        message: {
          subject: `🤖 Zenox Needs Approval: New Skill Synthesized`,
          text: `Zenox has synthesized a new skill for: "${goalDescription}". 
It successfully passed Sandbox tests. 

Code:
${mockGeneratedCode}

Please review in your admin dashboard and approve to activate it.`,
          html: `<p>Zenox has synthesized a new skill for: <strong>"${goalDescription}"</strong>.</p>
<p>It successfully passed Sandbox tests.</p>
<pre><code>${mockGeneratedCode}</code></pre>
<p><a href="https://your-zenox-domain.com/admin/skills/${newSkill.id}">Click here to review and approve</a>.</p>`
        }
      });
      console.log(`[SkillManager] Saved as pending_approval and sent email trigger to ${this.ownerEmail}`);
    } catch (e) {
      console.error(`[SkillManager] Failed to persist skill or email trigger:`, e);
    }

    return newSkill;
  }
}
