import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AgentCore } from './modules/agent/AgentCore';

// Expose the AgentCore to window for testing in the browser console
// This keeps the main UI untouched as requested
(window as any).awaisAgent = new AgentCore();
console.log('🧪 Zenox Agent is ready! To test it, open the browser console and run:');
console.log('awaisAgent.submitTask("testUser1", "Write a function that calculates the nth Fibonacci number and then logs the 10th one.")');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
