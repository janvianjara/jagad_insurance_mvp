# Brand assets

Expected file: `logo.svg` in this folder.

`src/ui/BrandMark` resolves it through a glob, so the build succeeds while the asset
is missing — it renders a wordmark fallback and prints a console warning naming this
path (plan §1 flags the logo as the one missing input). Drop the supplied Jagad logo
in here as `logo.svg` (SVG preferred, otherwise a transparent PNG at 3x) and the real
mark appears with no code change.

`public/favicon.svg` carries a brand mark derived from the same palette; refresh it
from the real logo once that lands.
