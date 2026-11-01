import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env['CI'];
const port = 4173;

export default defineConfig({
  testDir: 'e2e',
  // The real-network spec only runs when REAL_NETWORK=1 (CI job with internet access).
  testIgnore: process.env['REAL_NETWORK'] ? [] : ['**/real-network.spec.ts'],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${port}${process.env['BASE_PATH'] ?? '/'}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    geolocation: { latitude: 45.7640, longitude: 4.8270 },
    permissions: ['geolocation'],
    locale: 'fr-FR',
  },
  projects: [
    // Local: Chromium with iPhone viewport (WebKit cannot be downloaded in the dev sandbox).
    { name: 'iphone-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium', isMobile: false } },
    // CI: real WebKit (iPhone 13, 390x844).
    ...(isCI ? [{ name: 'iphone-webkit', use: { ...devices['iPhone 13'] } }] : []),
  ],
  webServer: {
    command: `npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}${process.env['BASE_PATH'] ?? '/'}`,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
