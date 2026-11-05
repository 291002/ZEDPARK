# ZED Park Management Dashboard

Operations dashboard for ZED Park covering visitors and tickets, rides and the Ferris wheel, revenue, food & retail tenants, events, guest experience, safety and maintenance, utilities, and landscape & lighting.

All figures are **demo data** from a seeded model (`data.js`). The dashboard is not yet connected to live systems.

## Run it

No build step. Either open `index.html` directly, or serve it:

```
start-dashboard.bat        # Windows: serves on http://localhost:5185 and opens the browser
python serve.py            # any OS: same server (no-cache headers)
```

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell, icon sprite, landing video |
| `styles.css` | Theme tokens (dark default, light option) and layout |
| `data.js` | `window.ZP` — deterministic demo data model |
| `charts.js` | `window.CH` — SVG charts with table view |
| `app.js` | Tabs, filters, drawers, ride performance view |
| `assets/` | Landing video, poster, ride photos |

Ride photos are representative Wikimedia Commons images (CC licences, credited in the app), not photos of ZED Park.
