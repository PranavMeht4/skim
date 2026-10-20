import { readFileSync } from 'node:fs';
import { startScheduler } from './scheduler.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

startScheduler({ intervalMs: config.tickSeconds * 1000, formatter: config.formatter });
console.log(`scheduler running, tick every ${config.tickSeconds}s, formatter "${config.formatter}"`);
