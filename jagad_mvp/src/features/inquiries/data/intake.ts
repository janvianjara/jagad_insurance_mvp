/**
 * Capture — the seam `/inquiries/new` writes through.
 *
 * This module used to be a decorator. `InquiryRepository` (plan §7) was
 * read-plus-transitions with no `create`, so capture kept its own rows, merged
 * them into every read and ran its own copy of the machine to move them. All of
 * that has gone: the repository creates inquiries now, and a captured inquiry is
 * an ordinary row in the same table as every seeded one — which is what the merge
 * logic existed to fake.
 *
 * What is left is the name. Four screens import `intake` and `IntakeRepository`,
 * and `capture` reads better on a capture form than `create` does, so the seam
 * stays as a delegate: one method that forwards, and the repository's own
 * refusal sentences coming back unedited.
 */

import type {
  CreateInquiryCommand,
  Inquiry,
  InquiryRepository,
  MutationResult,
  Repositories,
} from '../../../data/repo'

/** Canvas 1.6: a name and a mobile number alone are enough. */
export type CaptureInquiryCommand = CreateInquiryCommand

export type IntakeRepository = InquiryRepository & {
  /** Records a new inquiry in `new`, ready for routing. */
  capture(command: CaptureInquiryCommand): Promise<MutationResult<Inquiry>>
}

/**
 * One intake per underlying repository, so a screen that re-renders hands the
 * same object to the same hooks rather than a new one each pass.
 */
const CACHE = new WeakMap<InquiryRepository, IntakeRepository>()

export function inquiryIntake(repositories: Repositories): IntakeRepository {
  const base = repositories.inquiries
  const existing = CACHE.get(base)
  if (existing) return existing

  const built: IntakeRepository = {
    // Spread rather than eleven hand-written forwards: a method added to
    // `InquiryRepository` reaches the screens without being copied out here.
    ...base,
    async capture(command) {
      return base.create(command)
    },
  }

  CACHE.set(base, built)
  return built
}
