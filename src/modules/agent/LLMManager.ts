import { GoogleGenAI } from '@google/genai';

export class LLMManager {
  private static instance: LLMManager;
  private ai: GoogleGenAI;

  private constructor() {
    // In a real production app, you might route this through your backend to protect the key.
    // For this module design, we use VITE_GEMINI_API_KEY which the client can provide,
    // or fallback to the Awais Codex default if available.
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_SYNOD_API_KEY || '';
    this.ai = new GoogleGenAI({ apiKey });
  }

  public static getInstance(): LLMManager {
    if (!LLMManager.instance) {
      LLMManager.instance = new LLMManager();
    }
    return LLMManager.instance;
  }

  /**
   * Generates code for a specific task using the Gemini model.
   */
  public async generateCode(prompt: string, language: string = 'javascript'): Promise<string> {
    console.log(`[LLMManager] Generating ${language} code for prompt: ${prompt}`);
    
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are an expert developer. Generate ONLY valid, executable ${language} code for the following task. Do not include markdown blocks or explanations, just the raw code.\n\nTask: ${prompt}`,
      });

      const generatedCode = response.text || '';
      
      // Clean up markdown code blocks if the model still outputs them
      const cleanedCode = generatedCode.replace(/```(javascript|js|python|py|ts|typescript)?/gi, '').replace(/```/g, '').trim();
      
      console.log('[LLMManager] Code generation completed successfully.');
      return cleanedCode;
    } catch (error) {
      console.error('[LLMManager] Code generation failed:', error);
      throw new Error('Failed to generate code via LLM.');
    }
  }
}
