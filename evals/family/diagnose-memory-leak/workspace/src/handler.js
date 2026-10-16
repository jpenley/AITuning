// Prices one product for one request.
const config = require('./config');
const { responseCache } = require('./cache');
const { lookupProduct } = require('./catalog');

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function handleRequest(req) {
  const ctx = { id: req.id, body: req.body, config: config.get(), startedAt: Date.now() };
  // A config reload while the request is in flight applies to the rest of it.
  const onReload = (next) => {
    ctx.config = next;
  };
  config.bus.on('reload', onReload);

  let product = responseCache.get(req.productId);
  if (!product) {
    await tick(); // the catalogue call
    product = lookupProduct(req.productId);
    responseCache.set(req.productId, product);
  }
  await tick();

  const price = Math.round(product.basePrice * ctx.config.priceMultiplier * 100) / 100;
  return { requestId: ctx.id, productId: product.id, name: product.name, price, currency: ctx.config.currency };
}

module.exports = { handleRequest };
