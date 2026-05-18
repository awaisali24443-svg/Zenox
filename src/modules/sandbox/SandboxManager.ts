export type EnvironmentType = 'e2b-sandbox' | 'local-fallback';

export class SandboxManager {
  private static instance: SandboxManager;
  private currentEnv: EnvironmentType = 'e2b-sandbox';
  private e2bApiKey: string;

  private constructor() {
    this.e2bApiKey = import.meta.env.VITE_E2B_API_KEY || '';
  }

  public static getInstance(): SandboxManager {
    if (!SandboxManager.instance) {
      SandboxManager.instance = new SandboxManager();
    }
    return SandboxManager.instance;
  }

  /**
   * Strategically selects execution environment: E2B sandbox (free tier) 
   * fallback to local client execution (user phone/browser fallback) if limits exceeded.
   */
  public async executeCode(code: string, language: string): Promise<string> {
    console.log(`[SandboxManager] Executing ${language} code via ${this.currentEnv}`);
    
    try {
      if (this.currentEnv === 'e2b-sandbox' && this.e2bApiKey) {
        return await this.runInE2B(code, language);
      } else {
        if (!this.e2bApiKey) {
           console.log('[SandboxManager] E2B API Key missing. Defaulting to local fallback.');
           this.currentEnv = 'local-fallback';
        }
        return await this.runInLocalFallback(code, language);
      }
    } catch (error: any) {
      console.warn(`[SandboxManager] E2B execution failed (${error?.message || 'Unknown error'}). Switching to local fallback strategy.`);
      this.currentEnv = 'local-fallback';
      return await this.runInLocalFallback(code, language);
    }
  }

  private async runInE2B(code: string, language: string): Promise<string> {
    console.log('[SandboxManager] Running in E2B...');
    
    try {
      // 1. Create a Sandbox session
      const createRes = await fetch('https://api.e2b.dev/sandboxes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.e2bApiKey
        },
        body: JSON.stringify({ templateID: 'base' }) // simple base environment
      });

      if (createRes.status === 429) {
         throw new Error('E2B limit exceeded');
      }

      if (!createRes.ok) {
         throw new Error('Failed to create E2B sandbox');
      }

      const sandboxData = await createRes.json();
      const sandboxID = sandboxData.sandboxID;

      // 2. Execute code in the Sandbox via bash/node command
      // Assuming Node.js for Javascript
      const command = language === 'javascript' || language === 'js'
         ? `node -e ${JSON.stringify(code)}`
         : `python -c ${JSON.stringify(code)}`;

      // Execute command inside the sandbox
      const execRes = await fetch(`https://api.e2b.dev/sandboxes/${sandboxID}/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.e2bApiKey
        },
        body: JSON.stringify({ cmd: command })
      });

      if (!execRes.ok) {
         throw new Error('Execution in E2B failed');
      }

      const execData = await execRes.json();
      
      // 3. Kill the sandbox to save resources
      await fetch(`https://api.e2b.dev/sandboxes/${sandboxID}`, {
        method: 'DELETE',
        headers: {
           'X-Api-Key': this.e2bApiKey
        }
      });

      const stdout = execData.stdout || '';
      const stderr = execData.stderr || '';

      if (stderr) console.warn('[SandboxManager] E2B Stderr:', stderr);
      
      return stdout || stderr || 'Execution complete (No output).';

    } catch (e: any) {
      console.error('[SandboxManager] E2B connection failed:', e);
      throw e;
    }
  }

  private async runInLocalFallback(code: string, language: string): Promise<string> {
    console.log('[SandboxManager] Running in native/local client fallback...');
    
    if (language !== 'javascript' && language !== 'js') {
       return `Unsupported language for local fallback: ${language}. Only JavaScript is supported in browser fallback.`;
    }

    return new Promise((resolve) => {
      // We use a Blob-based Web Worker to execute untested code safely off the main UI thread.
      const workerCode = `
        self.onmessage = async function(e) {
          try {
            // Hijack console.log to capture output
            let output = [];
            const originalLog = console.log;
            console.log = (...args) => {
               output.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
            };

            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const runCode = new AsyncFunction(e.data.code);
            const result = await runCode();
            console.log = originalLog;
            
            self.postMessage({ success: true, output: output.length ? output.join('\\n') : String(result) });
          } catch (error) {
            self.postMessage({ success: false, error: error.toString() });
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      // Setup a safety timeout for infinite loops (e.g., 5 seconds)
      const timeoutId = setTimeout(() => {
         worker.terminate();
         URL.revokeObjectURL(workerUrl);
         resolve('Error: Local execution timed out (Infinite loop?)');
      }, 5000);

      worker.onmessage = (e) => {
        clearTimeout(timeoutId);
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        
        if (e.data.success) {
           resolve(e.data.output || 'Execution complete (No output).');
        } else {
           resolve(`Error during local execution: ${e.data.error}`);
        }
      };

      worker.onerror = (e) => {
        clearTimeout(timeoutId);
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        resolve(`Fatal Worker Error: ${e.message}`);
      };

      // Send the code to execute
      worker.postMessage({ code });
    });
  }
}
