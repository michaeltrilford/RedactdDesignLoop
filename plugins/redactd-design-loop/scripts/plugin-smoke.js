import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const sampleArtifact = {
  type: 'Container',
  props: {
    center: true,
    size: 'large'
  },
  children: [
    {
      type: 'VStack',
      props: {
        space: 'var(--space-400)',
        alignX: 'stretch'
      },
      children: [
        {
          type: 'Heading',
          props: {
            level: '1',
            size: '1',
            text: 'Choose Your Plan'
          }
        },
        {
          type: 'Grid',
          props: {
            col: '1fr 1fr'
          },
          children: [
            {
              type: 'Card',
              children: [
                {
                  type: 'Heading',
                  props: {
                    level: '3',
                    size: '3',
                    text: 'Starter'
                  }
                },
                {
                  type: 'Button',
                  props: {
                    variant: 'secondary',
                    text: 'Subscribe'
                  }
                }
              ]
            },
            {
              type: 'Card',
              children: [
                {
                  type: 'Heading',
                  props: {
                    level: '3',
                    size: '3',
                    text: 'Professional'
                  }
                },
                {
                  type: 'Button',
                  props: {
                    variant: 'secondary',
                    text: 'Subscribe'
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

function onceLine(proc) {
  return new Promise((resolve, reject) => {
    let buffer = '';

    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const index = buffer.indexOf('\n');
      if (index === -1) return;

      const line = buffer.slice(0, index);
      proc.stdout.off('data', onData);
      resolve(JSON.parse(line));
    };

    proc.stdout.on('data', onData);
    proc.once('error', reject);
    proc.once('exit', (code) => {
      reject(new Error(`Plugin server exited early with code ${code}`));
    });
  });
}

async function rpc(proc, id, method, params = {}) {
  proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  const response = await onceLine(proc);
  if (response.error) {
    throw new Error(`${method} failed: ${response.error.message}`);
  }
  return response.result;
}

async function main() {
  const proc = spawn('node', ['./src/index.js'], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: {
      ...process.env,
      REDACTD_DEV_PROVIDER: 'mock'
    }
  });

  try {
    await rpc(proc, 1, 'initialize', {});
    const tools = await rpc(proc, 2, 'tools/list', {});

    const requiredTools = [
      'run_design_loop',
      'run_design_loop_users',
      'run_design_loop_stakeholders',
      'run_design_loop_all',
      'save_design_loop_output'
    ];

    for (const toolName of requiredTools) {
      if (!tools.tools.some((tool) => tool.name === toolName)) {
        throw new Error(`Missing required tool: ${toolName}`);
      }
    }

    const callResult = await rpc(proc, 3, 'tools/call', {
      name: 'run_design_loop_all',
      arguments: {
        outputRoot: process.env.REDACTD_SMOKE_OUTPUT_ROOT || path.join(os.tmpdir(), 'redactd-design-loop-plugin-smoke'),
        initialPages: [
          {
            fileName: 'sample.json',
            document: sampleArtifact
          }
        ]
      }
    });

    const text = callResult?.content?.[0]?.text ?? '';
    if (!text.includes('No direction provided')) {
      throw new Error('Expected default no-direction fallback text in tool content.');
    }
    if (!text.includes('Execution: Codex workflow')) {
      throw new Error('Expected Codex workflow text in tool content.');
    }
    if (!text.includes('Run folder:')) {
      throw new Error('Expected run folder path in tool content.');
    }
    if (!text.includes('Review path: all')) {
      throw new Error('Expected default review path to be all.');
    }
    if (!text.includes('Depth: 8')) {
      throw new Error('Expected default exploration depth to be 8.');
    }
    if (!text.includes('Mode: Safe')) {
      throw new Error('Expected default variation mode to be Safe.');
    }

    process.stdout.write('plugin smoke ok\n');
  } finally {
    proc.kill();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
