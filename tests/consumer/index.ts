import { createPuntjes, ErrorCode, NotFoundError } from '@puntjes/sdk';

const puntjes = createPuntjes({
  clientId: 'client-id',
  clientSecret: 'client-secret',
  baseUrl: 'https://shop.test',
  fetch: async (request) =>
    new URL(request.url).pathname === '/api/v1/health'
      ? Response.json({ status: 'ok' })
      : Response.json({ error: { code: 'CUSTOMER_NOT_FOUND', message: 'No.', status: 404, request_id: 'r' } }, { status: 404 }),
});

const { data } = await puntjes.checkHealth();
const missing = await puntjes.showCustomer({ path: { customer: '1' } }).catch((error: unknown) => error);

if (JSON.stringify(data) !== '{"status":"ok"}' || !(missing instanceof NotFoundError) || missing.code !== ErrorCode.CustomerNotFound) {
  throw new Error('The packed SDK did not behave.');
}

console.log('The packed SDK installs, type-checks and runs.');
