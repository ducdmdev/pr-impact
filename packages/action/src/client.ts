import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFS } from '@pr-impact/tools-core';
import { executeTool } from './tools.js';
import { SYSTEM_PROMPT, REPORT_TEMPLATE } from './generated/templates.js';

export interface AnalysisOptions {
  apiKey: string;
  repoPath: string;
  baseBranch: string;
  headBranch: string;
  model: string;
}

const MAX_ITERATIONS = 30;
const TIMEOUT_MS = 180_000; // 180 seconds

// Build Anthropic tool definitions from the shared canonical definitions.
// repoPath is omitted here — it is injected at runtime in the tool execution loop.
const TOOL_DEFINITIONS: Anthropic.Tool[] = TOOL_DEFS.map((def) => ({
  name: def.name,
  description: def.description,
  input_schema: {
    type: 'object' as const,
    properties: def.properties,
    required: def.required,
  },
}));

export async function runAnalysis(options: AnalysisOptions): Promise<string> {
  const client = new Anthropic({ apiKey: options.apiKey });

  const userMessage = [
    `Analyze the PR comparing branch \`${options.baseBranch}\` to \`${options.headBranch}\`.`,
    `Repository path: ${options.repoPath}`,
    '',
    'Follow all 6 analysis steps. Produce the report using this template:',
    '',
    REPORT_TEMPLATE,
  ].join('\n');

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  const startTime = Date.now();
  let lastTextOutput = '';

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Check wall-clock timeout
    if (Date.now() - startTime > TIMEOUT_MS) {
      if (lastTextOutput) {
        return lastTextOutput;
      }
      throw new Error(`Analysis timed out after ${TIMEOUT_MS / 1000} seconds`);
    }

    const response = await client.messages.create({
      model: options.model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
      temperature: 0,
    });

    // Collect text blocks from this response for partial extraction
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    if (textBlocks.length > 0) {
      lastTextOutput = textBlocks.map((b) => b.text).join('\n');
    }

    // Collect tool use blocks
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      if (!lastTextOutput) {
        throw new Error('Analysis completed without producing a report');
      }
      return lastTextOutput;
    }

    // Execute all tool calls and build tool results
    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (toolUse): Promise<Anthropic.ToolResultBlockParam> => {
        try {
          // Inject repoPath into all tool calls (spread-clone to avoid mutating the API response)
          const input = { ...(toolUse.input as Record<string, unknown>), repoPath: options.repoPath };
          const result = await executeTool(toolUse.name, input);
          return {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          };
        } catch (error) {
          return {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            is_error: true,
          };
        }
      }),
    );

    messages.push({ role: 'user', content: toolResults });
  }

  // Iteration limit hit — return whatever text we have
  if (lastTextOutput) {
    return lastTextOutput;
  }
  throw new Error('Analysis exceeded maximum iterations without producing output');
}
