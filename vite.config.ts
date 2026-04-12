import os from 'node:os'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** First non-internal IPv4; used so HMR WebSocket matches LAN URL when using --host. */
function getLanIPv4(): string | undefined {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return undefined
}

const hmrHost =
  process.env.VITE_HMR_HOST ||
  (process.env.VITE_REMOTE === '1' ? getLanIPv4() : undefined)

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    // LAN / `vite --host`: HMR must use the same host the browser opened (not localhost).
    // Override with VITE_HMR_HOST if you have multiple NICs or the auto IP is wrong.
    hmr: hmrHost ? { host: hmrHost, protocol: 'ws' } : undefined,
    // Disable file watching when VITE_NO_WATCH=1 (e.g. on Raspberry Pi to reduce load)
    watch: process.env.VITE_NO_WATCH ? null : undefined,
  },
})
