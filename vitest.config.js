import { defineConfig } from 'vitest/config';

// Unit tests only (pure JS modules, node environment). The CRA leftover src/App.test.js is not a
// vitest test and stays excluded.
export default defineConfig({
  test: {
    include: ['src/test/**/*.test.js'],
    environment: 'node',
  },
});
