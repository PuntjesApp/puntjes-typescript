import type { PuntjesApi } from './generated/sdk.gen.js';

/** Downloads a customer's wallet pass file. The generated client knows only the JSON answer of this call. */
export const walletPass = {
  async apple(puntjes: PuntjesApi, customer: string): Promise<Uint8Array> {
    const { data } = await puntjes.downloadWalletPass({
      path: { customer },
      query: { platform: 'apple' },
      headers: { Accept: 'application/vnd.apple.pkpass' },
      parseAs: 'arrayBuffer',
    });

    return new Uint8Array(data as unknown as ArrayBuffer);
  },
};
