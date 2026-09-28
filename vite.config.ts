import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Pré-otimiza tudo de uma vez: evita re-otimização no meio da sessão (telas lazy
  // com Leaflet), que serviria duas cópias do React ao navegador.
  optimizeDeps: {
    include: ['react', 'react-dom/client', 'react-router', 'firebase/app', 'firebase/auth', 'firebase/firestore', 'leaflet', 'lucide-react', 'sonner', 'date-fns', 'date-fns/locale', 'clsx'],
  },
  // Chaves de conta de serviço ficam na raiz só para scripts locais; o servidor não as observa
  server: {
    watch: { ignored: ['**/*-firebase-adminsdk-*.json', '**/serviceAccountKey*.json'] },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
    // Testes nunca tocam o projeto real, independentemente do .env
    env: {
      VITE_USE_EMULATORS: 'true',
      VITE_FIREBASE_PROJECT_ID: 'demo-fuba',
      VITE_FIREBASE_API_KEY: 'demo-key',
    },
  },
})
