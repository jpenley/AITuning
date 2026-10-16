async function sendConfirmation(to, orderId) {
  console.log(`confirmation for order ${orderId} sent to ${to}`);
}

module.exports = { sendConfirmation };
