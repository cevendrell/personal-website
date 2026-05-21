# Media folder

Everything used by the site lives here, organised by page. Drop a replacement
file in the right folder using the same filename and the site picks it up
automatically.

```
media/
├── data/          ← Source CSVs and structured data files
│                    (replace these when you have new data to import)
├── shared/        ← Assets reused across multiple pages
│   ├── headshot.png         (home + about)
│   ├── grundfos-logo.png    (home career section)
│   └── earth-marble.jpg     (flight-log globe texture)
│
├── home/          ← index.html
│   ├── career.jpg
│   ├── passion-travel.jpg
│   ├── passion-photography.jpg
│   └── passion-tech.jpg
│
├── travel/        ← pages/travel/*
│   ├── travel-hero.jpg              (travel-map.html banner)
│   ├── dive-hero.jpg                (dive-log.html banner)
│   ├── photos/                      ← full-resolution travel gallery
│   │   └── {City}.jpg               (lightbox opens these)
│   ├── thumbs/                      ← matching thumbnails
│   │   └── {City}.jpg               (gallery grid uses these)
│   └── volunteering/                (volunteering.html)
│
└── photography/   ← pages/photography/*
    ├── northern-lights.mp4          (modern browsers)
    └── northern-lights.mov          (QuickTime fallback)
```

## Adding a new travel photo

1. Save the full-res image as `media/travel/photos/{City Name}.jpg`
2. Save a thumbnail (or the same image scaled down) as
   `media/travel/thumbs/{City Name}.jpg` — same filename.
3. Add a `<div class="gallery-item" ...>` entry in
   `pages/travel/travel-map.html`.

## Replacing a hero or passion tile

Just overwrite the file with the same name. No HTML changes needed.

## Updating data (flight log, etc.)

See `media/data/README.md`.
