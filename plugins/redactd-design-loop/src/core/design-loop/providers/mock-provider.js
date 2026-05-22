function countAcrossPages(pages, componentType) {
  return pages.reduce((sum, page) => sum + (page.componentCounts[componentType] ?? 0), 0);
}

function hasAnyTextMatch(pages, pattern) {
  const needle = pattern.toLowerCase();

  const visit = (node) => {
    if (!node || typeof node !== 'object') return false;
    for (const value of Object.values(node.props ?? {})) {
      if (typeof value === 'string' && value.toLowerCase().includes(needle)) {
        return true;
      }
    }
    return (node.children ?? []).some(visit);
  };

  return pages.some((page) => visit(page.rootNode));
}

function collectTextValuesFromPages(pages) {
  const values = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const value of Object.values(node.props ?? {})) {
      if (typeof value === 'string' && value.trim()) {
        values.push(value.trim());
      }
    }
    for (const child of node.children ?? []) visit(child);
  };

  for (const page of pages) visit(page.rootNode);
  return values;
}

function findPlaceholderTexts(pages) {
  const patterns = [
    /\bplaceholder\b/i,
    /\blorem ipsum\b/i,
    /\bthis is a supporting description\b/i,
    /\bstands out with (its|a) unique value proposition\b/i,
    /\bsetting us apart from the rest\b/i,
    /\bwrite your\b/i,
    /\benter your\b/i
  ];

  return collectTextValuesFromPages(pages).filter((value) => patterns.some((pattern) => pattern.test(value)));
}

function cloneNode(node) {
  if (!node || typeof node !== 'object') return node;
  return {
    ...node,
    props: { ...(node.props ?? {}) },
    children: (node.children ?? []).map(cloneNode)
  };
}

function visitNode(node, fn) {
  if (!node || typeof node !== 'object') return;
  fn(node);
  for (const child of node.children ?? []) {
    visitNode(child, fn);
  }
}

function findFirstNode(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const result = findFirstNode(child, predicate);
    if (result) return result;
  }
  return null;
}

function findAllNodes(node, predicate, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  if (predicate(node)) acc.push(node);
  for (const child of node.children ?? []) {
    findAllNodes(child, predicate, acc);
  }
  return acc;
}

function cloneCanvasChildren(page) {
  return (page.canvasChildren ?? [page.rootNode]).map(cloneNode);
}

function getAvailableTypes(page) {
  return new Set(Object.keys(page.componentCounts ?? {}));
}

function pickType(availableTypes, preferred, fallbacks = []) {
  if (availableTypes.has(preferred)) return preferred;
  for (const fallback of fallbacks) {
    if (availableTypes.has(fallback)) return fallback;
  }
  return preferred;
}

function makeTextNode(id, availableTypes, text, preferredType = 'Body') {
  return {
    id,
    type: pickType(availableTypes, preferredType, ['Body', 'Heading']),
    props: { text },
    children: []
  };
}

function makeButtonNode(id, availableTypes, label) {
  return {
    id,
    type: pickType(availableTypes, 'Button'),
    props: { text: label, label },
    children: []
  };
}

function makeStackNode(id, availableTypes, children, extraProps = {}) {
  return {
    id,
    type: pickType(availableTypes, 'VStack', ['Container', 'Grid']),
    props: extraProps,
    children
  };
}

function makeCardNode(id, availableTypes, title, body, ctaLabel = null) {
  return {
    id,
    type: pickType(availableTypes, 'Card', ['Container', 'VStack']),
    props: {},
    children: [
      makeTextNode(`${id}-title`, availableTypes, title, 'Heading'),
      makeTextNode(`${id}-body`, availableTypes, body, 'Body'),
      ...(ctaLabel ? [makeButtonNode(`${id}-cta`, availableTypes, ctaLabel)] : [])
    ]
  };
}

function appendComparisonSection(children, availableTypes, mode) {
  children.push({
    id: `comparison-${mode}`,
    type: pickType(availableTypes, 'Container', ['VStack', 'Card']),
    props: {},
    children: [
      makeTextNode(`comparison-heading-${mode}`, availableTypes, 'Compare the paths', 'Heading'),
      makeStackNode(
        `comparison-grid-${mode}`,
        availableTypes,
        [
          makeCardNode(
            `comparison-starter-${mode}`,
            availableTypes,
            'Lower commitment',
            'Start with a smaller step and upgrade later.',
            'Start small'
          ),
          makeCardNode(
            `comparison-pro-${mode}`,
            availableTypes,
            'Higher conviction',
            'Choose the more complete option when you already know the value.',
            'Go all in'
          )
        ],
        availableTypes.has('Grid') ? { col: '1fr 1fr', space: 'var(--space-300)' } : { space: 'var(--space-300)' }
      )
    ]
  });
}

function ensurePrimaryCta(children, label) {
  let updated = false;
  for (const child of children) {
    visitNode(child, (node) => {
      if (!updated && node.type === 'Button') {
        node.props = { ...(node.props ?? {}), text: label, label };
        updated = true;
      }
    });
    if (updated) break;
  }
  if (!updated) {
    children.push({
      id: 'fallback-primary-cta',
      type: 'Button',
      props: { text: label, label },
      children: []
    });
  }
}

function getNodeText(node) {
  if (!node || typeof node !== 'object') return '';
  const direct = node.props?.text || node.props?.label || node.props?.title || '';
  if (typeof direct === 'string' && direct) return direct;
  for (const child of node.children ?? []) {
    const text = getNodeText(child);
    if (text) return text;
  }
  return '';
}

function findPricingCards(node, acc = []) {
  if (!node || typeof node !== 'object') return acc;

  if (node.type === 'Card') {
    const text = getNodeText(node).toLowerCase();
    if (text.includes('$') || text.includes('free') || text.includes('starter') || text.includes('professional')) {
      acc.push(node);
    }
  }

  for (const child of node.children ?? []) {
    findPricingCards(child, acc);
  }
  return acc;
}

function detectPlan(node) {
  const text = JSON.stringify(node.props ?? {}).toLowerCase() + JSON.stringify(node.children ?? []).toLowerCase();
  if (text.includes('professional')) return 'professional';
  if (text.includes('starter')) return 'starter';
  if (text.includes('"free"') || text.includes('$0.00') || text.includes('go to builder')) return 'free';
  return 'unknown';
}

function findFirstOfType(node, type) {
  return findFirstNode(node, (candidate) => candidate.type === type);
}

function prependChild(node, child) {
  node.children = Array.isArray(node.children) ? node.children : [];
  node.children.unshift(child);
}

function retitleButton(card, label) {
  const button = findFirstOfType(card, 'Button');
  if (button) {
    button.props = { ...(button.props ?? {}), text: label, label };
  }
}

function addBadgeToHeader(card, text) {
  const header = findFirstOfType(card, 'CardHeader');
  if (!header) return;
  prependChild(header, {
    id: `${card.id || 'card'}-badge`,
    type: 'Body',
    props: { text },
    children: []
  });
}

function addSupportCopyToBody(card, text) {
  const body = findFirstOfType(card, 'CardBody');
  if (!body) return;
  prependChild(body, {
    id: `${card.id || 'card'}-support-copy`,
    type: 'Body',
    props: { text },
    children: []
  });
}

function setFirstHeadingText(rootPage, text) {
  const heading = findFirstOfType(rootPage, 'Heading');
  if (heading) heading.props = { ...(heading.props ?? {}), text };
}

function setFirstBodyText(rootPage, text) {
  const body = findFirstOfType(rootPage, 'Body');
  if (body) body.props = { ...(body.props ?? {}), text };
}

function tightenGridDensity(rootPage, loopNumber) {
  const grids = findAllNodes(rootPage, (node) => node.type === 'Grid');
  for (const grid of grids) {
    grid.props = {
      ...(grid.props ?? {}),
      space: 'var(--space-300)',
      col: grid.props?.col === '1fr 1fr 1fr' && loopNumber % 2 === 0 ? '1fr 1fr' : grid.props?.col
    };
  }
}

function reorderPricingCards(rootPage, orderedPlans) {
  visitNode(rootPage, (node) => {
    if (node.type !== 'Grid' || !Array.isArray(node.children)) return;
    const cards = node.children.filter((child) => child?.type === 'Card');
    if (cards.length < 2) return;

    const cardMap = new Map(cards.map((card) => [detectPlan(card), card]));
    const reordered = orderedPlans.map((plan) => cardMap.get(plan)).filter(Boolean);
    const leftovers = cards.filter((card) => !reordered.includes(card));
    if (reordered.length > 0) node.children = [...reordered, ...leftovers];
  });
}

function emphasizePlan(rootPage, plan, badgeText, ctaText) {
  const cards = findPricingCards(rootPage);
  for (const card of cards) {
    if (detectPlan(card) !== plan) continue;
    addBadgeToHeader(card, badgeText);
    retitleButton(card, ctaText);
    card.props = { ...(card.props ?? {}), variant: 'highlight', emphasis: 'strong' };
  }
}

function retitleAllCardButtons(rootPage, labelsByPlan) {
  const cards = findPricingCards(rootPage);
  for (const card of cards) {
    const label = labelsByPlan[detectPlan(card)];
    if (label) retitleButton(card, label);
  }
}

function addPlanSupportCopy(rootPage, loopNumber) {
  const cards = findPricingCards(rootPage);
  for (const card of cards) {
    const plan = detectPlan(card);
    if (plan === 'free') {
      addSupportCopyToBody(card, loopNumber % 2 === 0 ? 'Explore before committing.' : 'A low-risk place to explore before upgrading.');
    } else if (plan === 'starter') {
      addSupportCopyToBody(card, loopNumber % 2 === 0 ? 'The clearest step up for most buyers.' : 'Best balance of value and commitment.');
    } else if (plan === 'professional') {
      addSupportCopyToBody(card, loopNumber % 2 === 0 ? 'Built for teams that already know they need more.' : 'Highest capability for broader usage.');
    }
  }
}

function getLoopLens(modeKey, loopNumber) {
  if (modeKey === 'safe') return ['clarity', 'trust', 'cta', 'density'][(loopNumber - 1) % 4];
  if (modeKey === 'crazy') return ['reorder', 'contrast', 'compare', 'commitment'][(loopNumber - 1) % 4];
  return ['provocation', 'hero-plan', 'contrast', 'decision'][(loopNumber - 1) % 4];
}

function transformPricingCards(rootPage, modeKey) {
  const cards = findPricingCards(rootPage);

  for (const card of cards) {
    const plan = detectPlan(card);

    if (modeKey === 'safe') {
      if (plan === 'starter') {
        addBadgeToHeader(card, 'Best for most teams');
        retitleButton(card, 'Choose Starter');
      } else if (plan === 'professional') {
        retitleButton(card, 'Choose Professional');
      } else if (plan === 'free') {
        retitleButton(card, 'Start Free');
      }
    }

    if (modeKey === 'crazy') {
      if (plan === 'starter') {
        addBadgeToHeader(card, 'Recommended path');
        retitleButton(card, 'Pick Starter');
      } else if (plan === 'professional') {
        addBadgeToHeader(card, 'Power option');
        retitleButton(card, 'Go Professional');
      } else if (plan === 'free') {
        retitleButton(card, 'Try Free First');
      }
    }

    if (modeKey === 'out_of_this_world') {
      if (plan === 'starter') {
        addBadgeToHeader(card, 'Momentum pick');
        retitleButton(card, 'Move Fast');
      } else if (plan === 'professional') {
        addBadgeToHeader(card, 'Full send');
        retitleButton(card, 'Go All In');
      } else if (plan === 'free') {
        retitleButton(card, 'Explore Free');
      }
    }
  }
}

function transformSafePage(page, critique, loopNumber) {
  const children = cloneCanvasChildren(page);
  const rootPage = children[0];
  if (!rootPage || !Array.isArray(rootPage.children)) {
    return { fileName: page.fileName, canvasChildren: children };
  }

  const lens = getLoopLens('safe', loopNumber);
  ensurePrimaryCta(rootPage.children, lens === 'cta' ? 'Choose your plan' : 'Continue confidently');
  transformPricingCards(rootPage, 'safe');
  addPlanSupportCopy(rootPage, loopNumber);

  if (lens === 'clarity') {
    setFirstHeadingText(rootPage, 'Choose the plan that fits');
    setFirstBodyText(rootPage, 'Compare the options quickly and move forward with confidence.');
    emphasizePlan(rootPage, 'starter', 'Most balanced option', 'Choose Starter');
  } else if (lens === 'trust') {
    setFirstBodyText(rootPage, 'Transparent pricing and a low-risk way to get started.');
    retitleAllCardButtons(rootPage, {
      free: 'Explore Free',
      starter: 'Start Starter',
      professional: 'Contact Sales'
    });
  } else if (lens === 'cta') {
    retitleAllCardButtons(rootPage, {
      free: 'Try Free',
      starter: 'Start Now',
      professional: 'Upgrade Now'
    });
    emphasizePlan(rootPage, 'starter', 'Recommended', 'Start Now');
  } else if (lens === 'density') {
    tightenGridDensity(rootPage, loopNumber);
    setFirstBodyText(rootPage, 'A simpler comparison for faster scanning on smaller screens.');
  }

  return { fileName: page.fileName, canvasChildren: children };
}

function transformCrazyPage(page, critique, loopNumber) {
  const children = cloneCanvasChildren(page);
  const rootPage = children[0];
  const availableTypes = getAvailableTypes(page);
  if (!rootPage || !Array.isArray(rootPage.children)) {
    return { fileName: page.fileName, canvasChildren: children };
  }

  const lens = getLoopLens('crazy', loopNumber);
  ensurePrimaryCta(rootPage.children, 'Pick the best fit');
  transformPricingCards(rootPage, 'crazy');
  addPlanSupportCopy(rootPage, loopNumber);

  if (lens === 'reorder') {
    reorderPricingCards(rootPage, ['starter', 'professional', 'free']);
  } else if (lens === 'contrast') {
    emphasizePlan(rootPage, 'starter', 'Fastest path', 'Pick Starter');
    setFirstBodyText(rootPage, 'A sharper comparison for buyers who want to decide quickly.');
  } else if (lens === 'compare') {
    appendComparisonSection(rootPage.children, availableTypes, `crazy-${loopNumber}`);
  } else if (lens === 'commitment') {
    retitleAllCardButtons(rootPage, {
      free: 'Browse Free',
      starter: 'Commit to Starter',
      professional: 'Go Professional'
    });
    reorderPricingCards(rootPage, ['professional', 'starter', 'free']);
  }

  return { fileName: page.fileName, canvasChildren: children };
}

function transformOutOfThisWorldPage(page, critique, loopNumber) {
  const children = cloneCanvasChildren(page);
  const rootPage = children[0];
  const availableTypes = getAvailableTypes(page);
  if (!rootPage || !Array.isArray(rootPage.children)) {
    return { fileName: page.fileName, canvasChildren: children };
  }

  const lens = getLoopLens('out_of_this_world', loopNumber);
  ensurePrimaryCta(rootPage.children, 'Commit to the bold path');
  transformPricingCards(rootPage, 'out_of_this_world');
  addPlanSupportCopy(rootPage, loopNumber);

  if (lens === 'provocation') {
    setFirstHeadingText(rootPage, 'Stop comparing. Pick a path.');
    setFirstBodyText(rootPage, 'A bolder decision model for higher-conviction buyers.');
    reorderPricingCards(rootPage, ['professional', 'starter', 'free']);
  } else if (lens === 'hero-plan') {
    emphasizePlan(rootPage, 'professional', 'Most complete', 'Go All In');
    appendComparisonSection(rootPage.children, availableTypes, `wild-${loopNumber}`);
  } else if (lens === 'contrast') {
    setFirstBodyText(rootPage, 'Lean into stronger plan separation and a clearer commitment ladder.');
    retitleAllCardButtons(rootPage, {
      free: 'Explore',
      starter: 'Move Fast',
      professional: 'Go All In'
    });
  } else if (lens === 'decision') {
    reorderPricingCards(rootPage, ['professional', 'free', 'starter']);
    appendComparisonSection(rootPage.children, availableTypes, `wild-${loopNumber}`);
  }

  return { fileName: page.fileName, canvasChildren: children };
}

function resolveVariationProfile(variationMode, loopNumber) {
  if (variationMode === 'safe') {
    return {
      strategy: 'Safe',
      whyThisExists: `Produce a conservative refinement with a ${getLoopLens('safe', loopNumber)} lens.`
    };
  }

  if (variationMode === 'crazy') {
    return {
      strategy: 'Crazy',
      whyThisExists: `Push to more surprising alternatives with a ${getLoopLens('crazy', loopNumber)} lens.`
    };
  }

  if (variationMode === 'out_of_this_world') {
    return {
      strategy: 'Out of this world',
      whyThisExists: `Generate a deliberately bold exploration with a ${getLoopLens('out_of_this_world', loopNumber)} lens.`
    };
  }

  if (loopNumber === 1) {
    return {
      strategy: 'Safe',
      whyThisExists: 'Start with a grounded refinement before widening the search.'
    };
  }

  if (loopNumber % 2 === 0) {
    return {
      strategy: 'Crazy',
      whyThisExists: 'Explore a broader alternative instead of repeating the conservative path.'
    };
  }

  return {
    strategy: 'Out of this world',
    whyThisExists: 'Keep at least one provocative option in the set for inspiration.'
  };
}

export class MockProvider {
  constructor() {
    this.name = 'mock';
    this.model = 'heuristic-offline';
  }

  async evaluate({ project, persona }) {
    const pages = project.pages;
    const buttons = countAcrossPages(pages, 'Button');
    const inputs = countAcrossPages(pages, 'Input');
    const headings = countAcrossPages(pages, 'Heading');
    const cards = countAcrossPages(pages, 'Card');
    const frictionPoints = [];
    const confusionPoints = [];
    const recommendations = [];

    const pricingVisible = hasAnyTextMatch(pages, '$');
    const trustVisible =
      hasAnyTextMatch(pages, 'secure') ||
      hasAnyTextMatch(pages, 'trust') ||
      hasAnyTextMatch(pages, 'guarantee');
    const planDifferentiationVisible =
      hasAnyTextMatch(pages, 'everything in') ||
      hasAnyTextMatch(pages, 'unlimited') ||
      hasAnyTextMatch(pages, 'most popular');
    const commitmentCtas =
      hasAnyTextMatch(pages, 'start') ||
      hasAnyTextMatch(pages, 'choose') ||
      hasAnyTextMatch(pages, 'upgrade');
    const placeholderTexts = findPlaceholderTexts(pages);

    if (inputs >= 8) {
      frictionPoints.push('The flow asks for a large amount of input.');
      recommendations.push('Reduce or stage required inputs across the flow.');
    }

    if (buttons === 0) {
      confusionPoints.push('No explicit button actions were detected.');
      recommendations.push('Represent the primary action clearly in the component tree.');
    }

    if (headings < pages.length) {
      confusionPoints.push('Some screens may lack strong heading structure.');
      recommendations.push('Add clear screen-level headings for orientation.');
    }

    if (persona.focus.includes('upfront pricing clarity') && !pricingVisible) {
      frictionPoints.push('Pricing does not appear clearly represented in the flow.');
      recommendations.push('Expose total cost or pricing earlier.');
    }

    if (persona.focus.includes('trust signals') && !trustVisible) {
      confusionPoints.push('The flow does not show obvious trust or reassurance language.');
      recommendations.push('Add trust and safety reassurance near sensitive actions.');
    }

    if (persona.focus.includes('mobile clarity') && cards >= 6) {
      frictionPoints.push('A dense card-heavy layout may feel crowded on mobile.');
      recommendations.push('Reduce visual density for smaller screens.');
    }

    if (cards >= 3 && !planDifferentiationVisible) {
      confusionPoints.push('Plan differences may be hard to compare at a glance.');
      recommendations.push('Sharpen plan differentiation with clearer positioning and CTA language.');
    }

    if (cards >= 3 && buttons > 1 && !commitmentCtas) {
      frictionPoints.push('Calls to action feel neutral rather than helping the user decide.');
      recommendations.push('Make CTA labels more specific to the decision.');
    }

    if (placeholderTexts.length > 0) {
      frictionPoints.push('Some visible copy still reads like placeholder text instead of product-ready content.');
      confusionPoints.push('Generic placeholder copy weakens trust and makes the page feel unfinished.');
      recommendations.push('Replace placeholder copy with concrete, context-specific language before iterating on layout.');
    }

    if (frictionPoints.length === 0) {
      frictionPoints.push('No major friction was obvious from the artifact structure alone.');
    }

    if (confusionPoints.length === 0) {
      confusionPoints.push('No major confusion point was obvious from the artifact structure alone.');
    }

    const frictionScore = Math.min(10, 2 + frictionPoints.length);
    const clarityScore = Math.max(1, 9 - confusionPoints.length);
    const csat = Number(
      Math.max(1, Math.min(10, 8.4 - frictionPoints.length * 0.6 - confusionPoints.length * 0.5)).toFixed(1)
    );

    return {
      taskSuccess: clarityScore >= 5,
      csat,
      frictionScore,
      clarityScore,
      frictionPoints,
      confusionPoints,
      recommendations
    };
  }

  async iterate({ project, critique, loopNumber, prompt, constraints, targetSystem, variationMode }) {
    const profile = resolveVariationProfile(variationMode, loopNumber);
    const modeKey =
      profile.strategy === 'Safe'
        ? 'safe'
        : profile.strategy === 'Crazy'
          ? 'crazy'
          : 'out_of_this_world';

    const pages = project.pages.map((page) => {
      if (modeKey === 'safe') return transformSafePage(page, critique, loopNumber);
      if (modeKey === 'crazy') return transformCrazyPage(page, critique, loopNumber);
      return transformOutOfThisWorldPage(page, critique, loopNumber);
    });

    const emphasis =
      modeKey === 'safe'
        ? 'preserve the current structure while reducing friction'
        : modeKey === 'crazy'
          ? 'explore stronger contrast, comparison, and alternative framing'
          : 'push into provocative restructuring and bolder decision framing';

    return {
      strategy: profile.strategy,
      whyThisExists: profile.whyThisExists,
      summary: `${profile.strategy} loop ${loopNumber} addresses the strongest critique themes for ${targetSystem || 'the selected system'} and aims to ${emphasis}.`,
      changes:
        critique.topRecommendations.length > 0
          ? critique.topRecommendations.slice(0, 3).map((item) => `${profile.strategy}: ${item}`)
          : [`${profile.strategy}: tighten clarity around the primary path.`],
      retained: [
        ...(prompt ? [`Preserve the main intent of the prompt: ${prompt}`] : []),
        ...(constraints ?? []).slice(0, 1)
      ].filter(Boolean),
      risks: [
        modeKey === 'safe'
          ? 'This option may under-explore bolder alternatives.'
          : modeKey === 'crazy'
            ? 'This option may introduce stronger tradeoff framing than the current artifact supports.'
            : 'This option may drift furthest from the current information architecture.',
        'Review the changes before import.'
      ],
      pages
    };
  }
}
