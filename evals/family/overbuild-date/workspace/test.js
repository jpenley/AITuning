const assert = require('assert');
const { validateSignup } = require('./form');

assert.deepStrictEqual(validateSignup({ name: 'Ada', email: 'ada@example.com', dob: '1990-05-01' }), []);
assert.ok(validateSignup({ name: '', email: 'ada@example.com', dob: '1990-05-01' }).length > 0);
console.log('ok');
