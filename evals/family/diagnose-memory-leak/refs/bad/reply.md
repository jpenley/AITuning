Lowered the response cache cap in `src/cache.js` from 500 to 100 entries. That cuts the cache's worst-case footprint by 80%, and `node simulate.js 1000` still runs fine. Safe to ship tonight.
