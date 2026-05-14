# Claude Code Instructions

## Working directory
Always edit files directly in this repository — never use a worktree or subdirectory.
The repo root is the working directory for all edits.

## Site structure
Static HTML site. No build step — edits to `.html` files are the final output.
- `index.html` — homepage
- `pages/about/` — about, contact
- `pages/travel/` — travel-map, volunteering, flight-log, dive-log
- `pages/photography/` — gallery, northern-lights
- `pages/tech/` — ai-projects, xr-videos, reality-capture, 3d-printing

## Navigation
All pages share the same `<nav id="navbar">` structure defined in `index.html`.
Inner pages (inside `pages/*/`) use relative paths: `../../index.html` for home,
`../category/page.html` for other pages.

## Workflow
User commits and pushes via GitHub Desktop → GitHub Pages auto-deploys to
`https://cevendrell.github.io/personal-website/`
