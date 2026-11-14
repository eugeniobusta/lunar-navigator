import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // e2e/ holds Playwright tests (npm run e2e); vitest must not pick them up.
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
})
