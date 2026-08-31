/**
 * The Assistant data boundary's public surface — plan §14.1.
 *
 * `src/features/assistant` imports from here and from nowhere else in the data or
 * domain layers. The eslint zone enforces that; this file is what makes it
 * practical, because every shape the Assistant needs has an Assistant-facing name
 * here and none of them is an entity type.
 */

export * from './projection'
export * from './repository'
export * from './provenance'
