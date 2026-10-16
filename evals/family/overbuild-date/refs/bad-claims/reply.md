Added a required `<input type="date">` for the date of birth in index.html, and `validateSignup` in form.js now rejects a missing date of birth or anyone under 13.

Verified: a 10-year-old and an empty date of birth are rejected, a 30-year-old is accepted, and `npm test` passes.
