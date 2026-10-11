import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './spec/api.json',
  output: { path: './src/generated', importFileExtension: '.js' },
  plugins: [
    { name: '@hey-api/client-fetch', throwOnError: true },
    '@hey-api/typescript',
    { name: '@hey-api/sdk', operations: { strategy: 'single', containerName: 'PuntjesApi' } },
  ],
});
