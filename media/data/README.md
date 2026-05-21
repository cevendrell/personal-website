# Data sources

This folder holds the **editable source files** that drive parts of the site.
The site itself doesn't read these CSVs at runtime — the data gets compiled
into the HTML — but they live here so updates are obvious and traceable.

## flight-log.csv

- **Used by:** `pages/travel/flight-log.html` (the lifetime flight ledger,
  hero stats, breakdowns, year chart, and globe routes)
- **Source:** export from <https://my.flightradar24.com/carlosebrahim>
  (My Flight Diary → Export CSV)
- **Format:** the FlightRadar24 default — one row per flight, columns include
  `Date, Flight number, From, To, Dep time, Arr time, Duration, Airline,
  Aircraft, Registration, Seat number, Seat type, Flight class, Flight reason,
  Note, ...`

### How to update

1. Re-export from FlightRadar24, replace this file (keep the name
   `flight-log.csv`).
2. Ask Claude to "regenerate the flight log JSON from
   `media/data/flight-log.csv`" — the embedded JSON inside
   `pages/travel/flight-log.html` (in the `<script id="flightData">` tag)
   needs to be regenerated to reflect the new data. The hero-stat numbers
   (176 flights, 491 hours, 40 countries, 71 airports, 43 airlines,
   36 aircraft types) also live in that file and may need adjusting.

Future improvement: load the CSV at runtime via `fetch()` so updates only
require swapping this file. Worth doing if you find yourself re-exporting
often.
