import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRequire } from 'module';
import { registerAnalyzeDiffTool } from './tools/analyze-diff.js';
import { registerGetBreakingChangesTool } from './tools/get-breaking-changes.js';
import { registerGetRiskScoreTool } from './tools/get-risk-score.js';
import { registerGetImpactGraphTool } from './tools/get-impact-graph.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const server = new McpServer({
  name: 'pr-impact',
  version,
});

registerAnalyzeDiffTool(server);
registerGetBreakingChangesTool(server);
registerGetRiskScoreTool(server);
registerGetImpactGraphTool(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch(console.error);
