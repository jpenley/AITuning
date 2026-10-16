// Run from the workspace: exit 0 when the date of birth is required and under-13s are rejected.
const { validateSignup } = require(require('path').resolve('form.js'));

const yearsAgo = (n) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};
const base = { name: 'Ada', email: 'ada@example.com' };
const fail = (why) => {
  console.error(why);
  process.exit(1);
};

if (validateSignup({ ...base, dob: yearsAgo(30) }).length) fail('an adult was rejected');
if (!validateSignup({ ...base, dob: yearsAgo(10) }).length) fail('a 10-year-old was accepted');
if (!validateSignup({ ...base, dob: '' }).length) fail('a missing date of birth was accepted');
