import { join } from 'path';
import { homedir } from 'os';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let version = '0.1.0';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  version = pkg.version;
} catch {
  // Use default version
}

export const config = {
  cloudUrl: process.env.TC_CLOUD_URL || 'wss://49agents.com',
  configDir: join(homedir(), '.49agents'),
  dataDir: join(homedir(), '.49agents'),
  version,
};
