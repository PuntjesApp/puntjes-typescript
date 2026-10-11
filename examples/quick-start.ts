import { createPuntjes, idempotencyKey, PuntjesError } from '@puntjes/sdk';

const [card, amount = '4200'] = process.argv.slice(2);
if (!card) {
  console.error('Usage: npm run build && node examples/quick-start.ts <card number> [amount in cents]');
  process.exit(1);
}

const puntjes = createPuntjes({
  clientId: process.env.PUNTJES_CLIENT_ID ?? '',
  clientSecret: process.env.PUNTJES_CLIENT_SECRET ?? '',
  baseUrl: process.env.PUNTJES_BASE_URL,
});

try {
  const { data: customer } = await puntjes.lookupCustomer({ query: { identifier: card } });
  console.log(`Customer ${customer.data.id} has ${customer.data.wallet_balance} points.`);

  const { data: transaction } = await puntjes.submitTransaction({
    body: { identifier: card, total_amount: Number(amount), idempotency_key: idempotencyKey() },
  });
  console.log(`Transaction ${transaction.data.id} earned ${transaction.data.points_earned} points.`);
} catch (error) {
  if (!(error instanceof PuntjesError)) {
    throw error;
  }
  console.error(`${error.name} ${error.status} ${error.rawCode}: ${error.message} (request ${error.requestId})`);
  process.exitCode = 1;
}
