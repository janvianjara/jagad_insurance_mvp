/**
 * Build phases, from plan §11.2. Kept apart from the component so a module that
 * only needs the vocabulary — the route map, for one — does not import a screen.
 */
export const PHASES = ['M0', 'P1', 'P2', 'P3'] as const
export type Phase = (typeof PHASES)[number]
