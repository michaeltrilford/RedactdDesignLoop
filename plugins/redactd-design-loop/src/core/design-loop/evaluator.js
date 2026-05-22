function normalizeProviderResult(result) {
  return {
    taskSuccess: Boolean(result.taskSuccess),
    csat: Number(result.csat),
    frictionScore: Number(result.frictionScore),
    clarityScore: Number(result.clarityScore),
    frictionPoints: Array.isArray(result.frictionPoints) ? result.frictionPoints : [],
    confusionPoints: Array.isArray(result.confusionPoints) ? result.confusionPoints : [],
    recommendations: Array.isArray(result.recommendations) ? result.recommendations : []
  };
}

export async function evaluatePersona(project, persona, provider) {
  const task = 'Review the flow and determine whether the primary task can be completed clearly and confidently.';
  const result = normalizeProviderResult(await provider.evaluate({ project, persona, task }));

  return {
    persona: {
      id: persona.id,
      name: persona.name,
      type: persona.type,
      role: persona.role
    },
    task,
    provider: provider.name,
    model: provider.model,
    pagesReviewed: project.pages.map((page) => page.fileName),
    ...result
  };
}
