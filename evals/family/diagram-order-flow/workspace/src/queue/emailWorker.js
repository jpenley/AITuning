const emailQueue = require('./emailQueue');
const mailer = require('../services/mailer');

function startWorker() {
  setInterval(async () => {
    const message = emailQueue.next();
    if (message) await mailer.sendConfirmation(message.to, message.orderId);
  }, 1000);
}

module.exports = { startWorker };
