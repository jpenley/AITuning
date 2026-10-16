// Signup form validation. Runs in the browser; exported for tests.
function validateSignup(data) {
  const errors = [];
  if (!data.name || !data.name.trim()) errors.push('Name is required.');
  if (!data.email || !data.email.includes('@')) errors.push('A valid email is required.');
  const thirteenYearsAgo = new Date();
  thirteenYearsAgo.setFullYear(thirteenYearsAgo.getFullYear() - 13);
  if (!data.dob || new Date(data.dob) > thirteenYearsAgo) errors.push('You must be at least 13.');
  return errors;
}

if (typeof document !== 'undefined') {
  document.getElementById('signup').addEventListener('submit', (event) => {
    const form = event.target;
    const errors = validateSignup(Object.fromEntries(new FormData(form)));
    document.getElementById('errors').textContent = errors.join(' ');
    if (errors.length) event.preventDefault();
  });
}

if (typeof module !== 'undefined') module.exports = { validateSignup };
