import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? '/spacehub/' : '/',
  build: {
    rollupOptions: {
      // index.html = the dashboard; house.html = the bot's house on its own
      input: {
        main: 'index.html',
        house: 'house.html',
        house3d: 'house3d.html',
        lab: 'lab.html',
      },
    },
  },
})
