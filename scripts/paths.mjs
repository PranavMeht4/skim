import { homedir } from 'node:os';
import { join } from 'node:path';

// One place for the log location, shared by the Stop hook and /skim-stats.
export const dataDir = () => process.env.SKIM_DATA_DIR || join(homedir(), '.claude', 'skim');
