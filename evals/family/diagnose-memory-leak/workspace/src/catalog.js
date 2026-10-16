// Stand-in for the catalogue service: a product record built from its id.
function lookupProduct(id) {
  const n = Number(id.slice(2));
  return {
    id,
    name: `Product ${n}`,
    description: `Product ${n}: `.padEnd(1500, 'lorem ipsum '),
    basePrice: 5 + (n % 95),
  };
}

module.exports = { lookupProduct };
