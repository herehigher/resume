import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './node_modules/.cache/resume-studio/playwright-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['line']] : [['list']],
  use: {
    baseURL,
    locale: 'ja-JP',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'desktop-chromium',
      grepInvert: /@mobile/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 }
      }
    },
    {
      name: 'mobile-chromium',
      grep: /@mobile/,
      use: devices['Pixel 7']
    }
  ],
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000
  }
});
