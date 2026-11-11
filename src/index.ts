import { loadConfig } from './config.ts';
import { runLoop } from './engine.ts';

const config = await loadConfig();
await runLoop(config);
