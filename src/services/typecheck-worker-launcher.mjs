import { register } from 'module';
// Register tsx ESM hook in this worker thread before importing the .ts worker
// Pass empty data object to satisfy tsx's initialize check
register('tsx/esm', { parentURL: import.meta.url, data: {} });
// Now import the actual TypeScript worker
await import('./typecheck-worker.ts');
