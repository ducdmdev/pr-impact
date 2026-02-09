import { Command } from 'commander';
import { registerAnalyzeCommand } from './commands/analyze.js';
import { registerBreakingCommand } from './commands/breaking.js';
import { registerRiskCommand } from './commands/risk.js';
import { registerImpactCommand } from './commands/impact.js';

const program = new Command();
program
  .name('pri')
  .description('PR Impact Analyzer — detect breaking changes, map impact, score risk')
  .version('0.1.0');

registerAnalyzeCommand(program);
registerBreakingCommand(program);
registerRiskCommand(program);
registerImpactCommand(program);

program.parse();
