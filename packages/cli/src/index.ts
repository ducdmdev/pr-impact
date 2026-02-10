import { Command } from 'commander';
import { createRequire } from 'module';
import { registerAnalyzeCommand } from './commands/analyze.js';
import { registerBreakingCommand } from './commands/breaking.js';
import { registerRiskCommand } from './commands/risk.js';
import { registerImpactCommand } from './commands/impact.js';
import { registerCommentCommand } from './commands/comment.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();
program
  .name('pri')
  .description('PR Impact Analyzer — detect breaking changes, map impact, score risk')
  .version(version);

registerAnalyzeCommand(program);
registerBreakingCommand(program);
registerRiskCommand(program);
registerImpactCommand(program);
registerCommentCommand(program);

program.parse();
