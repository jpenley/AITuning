// Live worker config. reload() swaps it in and tells every subscriber.
const { EventEmitter } = require('node:events');

const bus = new EventEmitter();
bus.setMaxListeners(0); // several modules subscribe to reloads

let current = { currency: 'USD', priceMultiplier: 1 };

module.exports = {
  bus,
  get: () => current,
  reload(next) {
    current = { ...current, ...next };
    bus.emit('reload', current);
  },
};
