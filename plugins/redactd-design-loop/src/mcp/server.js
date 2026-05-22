import { TOOL_DEFINITIONS } from '../tools/definitions.js';
import { callTool } from '../tools/handlers.js';

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function makeToolResult(result) {
  const text =
    result && typeof result === 'object' && typeof result.displayText === 'string'
      ? result.displayText
      : JSON.stringify(result, null, 2);
  const structuredContent =
    result && typeof result === 'object' && 'data' in result
      ? result.data
      : result;

  return {
    structuredContent,
    isError: false,
    content: [
      {
        type: 'text',
        text: text && text.trim() ? text : 'Run completed.'
      }
    ]
  };
}

export function startServer() {
  let buffer = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      let request;
      try {
        request = JSON.parse(line);
      } catch (error) {
        writeMessage({
          jsonrpc: '2.0',
          error: { code: -32700, message: `Parse error: ${error.message}` },
          id: null
        });
        continue;
      }

      try {
        if (request.method === 'initialize') {
          writeMessage({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: {
                name: 'redactd-design-loop',
                version: '0.1.0'
              },
              capabilities: {
                tools: {}
              }
            }
          });
          continue;
        }

        if (request.method === 'tools/list') {
          writeMessage({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              tools: TOOL_DEFINITIONS
            }
          });
          continue;
        }

        if (request.method === 'tools/call') {
          const result = await callTool(request.params.name, request.params.arguments || {});
          writeMessage({
            jsonrpc: '2.0',
            id: request.id,
            result: makeToolResult(result)
          });
          continue;
        }

        writeMessage({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: `Method not found: ${request.method}` }
        });
      } catch (error) {
        writeMessage({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32000,
            message: error.message
          }
        });
      }
    }
  });
}
