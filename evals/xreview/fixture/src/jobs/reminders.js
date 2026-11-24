const store = require('../db/store');
const email = require('../services/email');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// Once an hour: email the customer about every open invoice that is past its due date, at most once a day per invoice.
function sendReminders(now = Date.now()) {
  store.update((data) => {
    for (const invoice of data.invoices) {
      if (invoice.status !== 'open' || !invoice.dueDate || Date.parse(invoice.dueDate) >= now) continue;
      if (invoice.lastReminderAt && now - invoice.lastReminderAt < DAY) continue;
      const customer = data.customers.find((c) => c.id === invoice.customerId);
      if (!customer) continue;
      email.send(customer.email, `Invoice ${invoice.id} is overdue`, `Your invoice ${invoice.id} was due on ${invoice.dueDate}.`);
      invoice.lastReminderAt = now;
    }
  });
}

function start() {
  return setInterval(sendReminders, HOUR);
}

module.exports = { start, sendReminders };
