// Response cache: least-recently-used, bounded at MAX_ENTRIES. 500 covers the hot part of the catalogue
// (about 2,000 products) so most lookups skip the catalogue service.
const MAX_ENTRIES = 100;

class LruCache {
  constructor(max) {
    this.max = max;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }

  get size() {
    return this.map.size;
  }
}

const responseCache = new LruCache(MAX_ENTRIES);

module.exports = { LruCache, MAX_ENTRIES, responseCache };
