import { defineConfig } from 'vitest/config';

// Tests run without the IWSDK dev plugin (it would try to start a second dev runtime).
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
