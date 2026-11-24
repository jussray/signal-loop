export const SIGNAL_LOOP_VERSION = '0.1.0';

export const SIGNAL_LOOP_STAGES = Object.freeze([
  'signal',
  'evidence',
  'claim',
  'experiment',
  'draft',
  'review',
  'measured-result',
  'next-signal',
]);

const NEXT_STAGE = Object.freeze({
  signal: 'evidence',
  evidence: 'claim',
  claim: 'experiment',
  experiment: 'draft',
  draft: 'review',
  review: 'measured-result',
  'measured-result': 'next-signal',
  'next-signal': 'signal',
});

export const SIGNAL_LOOP_CAPABILITIES = Object.freeze({
  product: 'SignalLoop',
  purpose: 'Social Content Intelligence for Founders',
  loop: [...SIGNAL_LOOP_STAGES],
  authority: {
    mode: 'read-only',
    canPublish: false,
    canMerge: false,
    canDeploy: false,
    canMutateProviders: false,
  },
  integration: {
    founderControlRoom: 'governed evidence/continuity federation only',
    implementationOwner: 'SignalLoop',
  },
});

export function explainStage(stage) {
  const explanations = {
    signal: 'A noteworthy observation, event, result, request, or change worth investigating.',
    evidence: 'Receipts or source material that support, constrain, or contradict the signal.',
    claim: 'A bounded statement that follows from the available evidence and can still be challenged.',
    experiment: 'A reversible test designed to learn whether the claim produces a useful outcome.',
    draft: 'A channel-native communication artifact derived from the claim and experiment intent.',
    review: 'A human or governed review gate before anything is treated as approved or publishable.',
    'measured-result': 'Observed outcome data kept separate from the original claim and draft.',
    'next-signal': 'The new observation produced by the measured result, closing the learning loop.',
  };

  if (!Object.hasOwn(explanations, stage)) {
    return null;
  }

  return {
    stage,
    description: explanations[stage],
    nextStage: NEXT_STAGE[stage],
  };
}

export function validateTransition(fromStage, toStage) {
  const knownFrom = SIGNAL_LOOP_STAGES.includes(fromStage);
  const knownTo = SIGNAL_LOOP_STAGES.includes(toStage);
  const expectedNext = knownFrom ? NEXT_STAGE[fromStage] : null;
  return {
    fromStage,
    toStage,
    allowed: Boolean(knownFrom && knownTo && expectedNext === toStage),
    expectedNext,
    reason: !knownFrom
      ? 'unknown-from-stage'
      : !knownTo
        ? 'unknown-to-stage'
        : expectedNext === toStage
          ? 'canonical-next-transition'
          : 'transition-skips-or-reorders-the-canonical-loop',
  };
}
