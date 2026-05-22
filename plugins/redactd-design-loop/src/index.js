import { startServer } from './mcp/server.js';

if (process.argv.includes('--smoke')) {
  process.stdout.write('redactd-design-loop smoke ok\n');
  process.exit(0);
}

startServer();
