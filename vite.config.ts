import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    // Disable file watching when VITE_NO_WATCH=1 (e.g. on Raspberry Pi to reduce load)
    watch: process.env.VITE_NO_WATCH ? null : undefined,
  },
})
