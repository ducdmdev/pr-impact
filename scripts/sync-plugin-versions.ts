import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const skillPkg = JSON.parse(
  readFileSync(resolve(rootDir, 'packages/skill/package.json'), 'utf-8'),
);
const version: string = skillPkg.version;

// Sync packages/skill/.claude-plugin/plugin.json
const pluginJsonPath = resolve(rootDir, 'packages/skill/.claude-plugin/plugin.json');
const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf-8'));
pluginJson.version = version;
writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2) + '\n', 'utf-8');

// Sync .claude-plugin/marketplace.json
const marketplacePath = resolve(rootDir, '.claude-plugin/marketplace.json');
const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf-8'));
marketplace.metadata.version = version;
marketplace.plugins[0].version = version;
writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\n', 'utf-8');

console.log(`Synced plugin versions to ${version}`);
