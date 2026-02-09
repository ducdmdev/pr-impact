import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAnalyzeDiffTool } from './tools/analyze-diff.js';
import { registerGetBreakingChangesTool } from './tools/get-breaking-changes.js';
import { registerGetRiskScoreTool } from './tools/get-risk-score.js';
import { registerGetImpactGraphTool } from './tools/get-impact-graph.js';

const server = new McpServer({
  name: 'pr-impact',
  version: '0.1.0',
});

registerAnalyzeDiffTool(server);
registerGetBreakingChangesTool(server);
registerGetRiskScoreTool(server);
registerGetImpactGraphTool(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
