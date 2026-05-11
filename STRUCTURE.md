# Site Structure

Clean, organized folder structure for easy editing.

## Root Files
- **index.html** — Homepage with navigation and overview cards.
- **README.md** — Project info.
- **STRUCTURE.md** — This file.

## Folders

### `/pages/` — All content pages organized by category

#### **`/pages/about/`** — Personal & contact
- `about.html` — About page with background, career, and philosophy
- `contact.html` — Contact & connection

#### **`/pages/travel/`** — Travel & adventure
- `travel-map.html` — Interactive travel map
- `flight-log.html` — Flight log & aviation experiences
- `dive-log.html` — Dive log & underwater adventures
- `volunteering.html` — Volunteering & community work

#### **`/pages/photography/`** — Visual & artistic collections
- `gallery.html` — Photography gallery
- `northern-lights.html` — Northern lights photography & stories

#### **`/pages/tech/`** — Technology & professional work
- `ai-projects.html` — AI projects & experiments
- `xr-videos.html` — XR & video content
- `reality-capture.html` — Reality capture work

### `/css/` — Stylesheets
- **style.css** — Main stylesheet (shared styles)

### `/media/` — Image and asset storage
- Add your images and media files here
- Reference them as `../media/filename.ext` from pages

### `/images/` — Legacy image folder (Squarespace CDN references)

### `/js/` — JavaScript files
- Ready for custom scripts

### `/universal/` — Shared SVG and design assets

---

## How to Edit

1. **Edit a page**: Open the HTML file in the appropriate `/pages/[category]/` folder
2. **Update navigation**: Change header nav links in `index.html`
3. **Add images**: Place in `/media/` and reference with `<img src="../../media/..."`
4. **Style changes**: Edit `/css/style.css`

## Deleted Files
- ✓ Removed cevendrell-clone backup folder
- ✓ Merged pages/work → pages/tech
- ✓ Merged pages/media → pages/photography
- ✓ Moved volunteering.html to pages/travel/
- ✓ Created pages/about/about.html


