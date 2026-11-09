import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative assets keep the build working under any GitHub Pages project path.
  base: './',
  // Keep module IDs on the drive letter used to launch Vite. On Windows, the
  // WSL share resolves to a UNC path via realpath, which vite-node mishandles.
  resolve: {
    preserveSymlinks: true,
  },
  // The project may live on a Windows network drive / WSL share, where
  // native fs.watch can fail. Polling keeps `npm run dev` portable.
  server: {
    // Bind IPv4 explicitly. Vite's default host resolves to IPv6 ::1 on
    // Windows, which browsers / WSL port forwarding may not reach.
    host: '127.0.0.1',
    watch: {
      usePolling: true,
      interval: 150,
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
