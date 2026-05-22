function buildRunInputSchema() {
  const properties = {
    prompt: {
      type: 'string',
      description: 'Optional user guidance about what to change, improve, or preserve.'
    },
    constraints: { type: 'array', items: { type: 'string' } },
    targetSystem: { type: 'string' },
    artifactPath: { type: 'string', description: 'Path to a single saved JSON artifact file.' },
    projectPath: { type: 'string' },
    outputRoot: { type: 'string' },
    initialPages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fileName: { type: 'string' },
          document: { type: 'object' }
        },
        required: ['document']
      }
    },
    explorationDepth: {
      type: 'number',
      enum: [2, 4, 6, 8],
      description: '2 = focused refinement, 4 = broader exploration, 6 = strong variation sweep, 8 = crazy eights mode.'
    },
    variationMode: {
      type: 'string',
      enum: ['safe', 'crazy', 'out_of_this_world'],
      description: 'Choose how far the iterations should push: Safe, Crazy, or Out of this world.'
    },
    personaIds: { type: 'array', items: { type: 'string' } }
  };

  properties.personaPath = {
    type: 'string',
    enum: ['users', 'stakeholders', 'all'],
    description: 'Choose who should review the artifact.'
  };

  return {
    type: 'object',
    anyOf: [
      { required: ['artifactPath'] },
      { required: ['projectPath'] },
      { required: ['initialPages'] }
    ],
    properties,
    required: []
  };
}

export const TOOL_DEFINITIONS = [
  {
    name: 'run_design_loop',
    description: 'Run the Redactd critique and iteration engine against supplied JSON artifacts with manual review-path control.',
    inputSchema: buildRunInputSchema()
  },
  {
    name: 'run_design_loop_users',
    description: 'Run the Redactd critique and iteration engine using the Users review path.',
    inputSchema: buildRunInputSchema()
  },
  {
    name: 'run_design_loop_stakeholders',
    description: 'Run the Redactd critique and iteration engine using the Stakeholders review path.',
    inputSchema: buildRunInputSchema()
  },
  {
    name: 'run_design_loop_all',
    description: 'Run the Redactd critique and iteration engine using the All review path.',
    inputSchema: buildRunInputSchema()
  },
  {
    name: 'get_run_outputs',
    description: 'Load critique and iteration outputs for a previous Redactd Design Loop run.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' }
      },
      required: ['projectPath']
    }
  },
  {
    name: 'save_design_loop_output',
    description: 'Save Codex-selected final Redactd JSON files back into a prepared Design Loop run.',
    inputSchema: {
      type: 'object',
      properties: {
        runRoot: { type: 'string' },
        notes: { type: 'string' },
        finalJson: { type: 'array', items: { type: 'object' } }
      },
      required: ['runRoot', 'finalJson']
    }
  },
  {
    name: 'write_loop_artifacts',
    description: 'Write Codex-authored critique and iteration artifacts into a prepared Loop run.',
    inputSchema: {
      type: 'object',
      properties: {
        runRoot: { type: 'string' },
        critique: {
          type: 'object',
          properties: {
            summary: {
              type: 'object',
              properties: {
                strongestFrictionFindings: { type: 'array', items: { type: 'string' } },
                strongestConfusionFindings: { type: 'array', items: { type: 'string' } },
                topRecommendations: { type: 'array', items: { type: 'string' } },
                consensusFindings: { type: 'array', items: { type: 'string' } },
                userOnlyFindings: { type: 'array', items: { type: 'string' } },
                stakeholderOnlyFindings: { type: 'array', items: { type: 'string' } },
                outlierFindings: { type: 'array', items: { type: 'string' } }
              }
            },
            scores: { type: 'object' },
            reports: { type: 'array', items: { type: 'object' } }
          },
          required: ['scores', 'reports']
        },
        iteration: {
          type: 'object',
          properties: {
            loops: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  loopNumber: { type: 'number' },
                  strategy: { type: 'string' },
                  whyThisExists: { type: 'string' },
                  summary: { type: 'string' },
                  changes: { type: 'array', items: { type: 'string' } },
                  retained: { type: 'array', items: { type: 'string' } },
                  risks: { type: 'array', items: { type: 'string' } },
                  pages: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        fileName: { type: 'string' },
                        document: { type: 'object' }
                      },
                      required: ['fileName', 'document']
                    }
                  }
                },
                required: ['loopNumber', 'summary', 'pages']
              }
            },
            recommendedLoopNumber: { type: 'number' }
          },
          required: ['loops']
        }
      },
      required: ['runRoot', 'critique', 'iteration']
    }
  },
  {
    name: 'prepare_redactd_import',
    description: 'Shape final loop output into a reviewable Redactd import payload.',
    inputSchema: {
      type: 'object',
      properties: {
        targetSystem: { type: 'string' },
        finalJson: { type: 'array', items: { type: 'object' } }
      },
      required: ['finalJson']
    }
  }
];
