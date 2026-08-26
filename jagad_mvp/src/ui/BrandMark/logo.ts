/**
 * Resolves the brand logo asset.
 *
 * The logo is the one input the plan flags as missing (§1), so it is resolved
 * through a glob rather than a static import: an absent file degrades to the
 * wordmark fallback instead of failing the build. Drop the SVG at the path below
 * and the real mark appears with no code change.
 */
export const LOGO_PATH = 'src/assets/brand/logo.svg'

const logoModules = import.meta.glob('../../assets/brand/logo.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export const logoUrl: string | undefined = Object.values(logoModules)[0]

if (!logoUrl) {
  console.warn(
    `BrandMark: no logo at ${LOGO_PATH} — rendering the wordmark fallback. ` +
      'Add the Jagad logo (SVG preferred, else transparent PNG at 3x) to that path.',
  )
}
