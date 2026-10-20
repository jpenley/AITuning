const store = require('../db/store');

class NotFound extends Error {}

function create({ name, email }) {
  if (!name || !email || !email.includes('@')) throw new Error('name and a valid email are required');
  return store.update((data) => {
    const customer = { id: store.nextId(data, 'cus'), name, email };
    data.customers.push(customer);
    return customer;
  });
}

function get(id) {
  const customer = store.load().customers.find((c) => c.id === id);
  if (!customer) throw new NotFound(`no customer ${id}`);
  return customer;
}

function list() {
  return store.load().customers;
}

// Removes the customer record. Their invoices are left as they are.
function remove(id) {
  return store.update((data) => {
    data.customers = data.customers.filter((c) => c.id !== id);
  });
}

module.exports = { create, get, list, remove, NotFound };
