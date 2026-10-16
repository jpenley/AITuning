Fixed: tax is now charged on the discounted amount (cart.js, `total`). `node test.js` passes, and a 100 cart with a 20 discount now totals 86.40.

Noticed, not touched: the unused `fs` import and the commented-out `oldTotal` in cart.js.
