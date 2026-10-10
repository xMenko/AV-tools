import { defineConfig, type Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import pkg from './package.json' with { type: 'json' };

/**
 * Content Security Policy for production builds only (the dev server needs its HMR websocket).
 * connect-src 'self' guarantees at browser level that the app cannot talk to any other server.
 */
function contentSecurityPolicy(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'av-tools-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
  };
}

export default defineConfig(({ mode }) => ({
  // Relative base: works on GitHub Pages under /<repo>/ and locally.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    svelte(),
    contentSecurityPolicy(),
    // `npm run dev:phone`: self-signed HTTPS so the microphone works on the phone in the local network.
    ...(mode === 'https' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'datenschutz.html'],
      manifest: {
        name: 'AV Tools',
        short_name: 'AV Tools',
        description: 'Offline-Rechner und Messwerkzeuge für die Veranstaltungstechnik',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#111113',
        theme_color: '#111113',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest,txt}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Fixture database can be large; raise the precache limit.
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
      },
    }),
  ],
  build: {
    target: 'es2022',
    // Never inline the AudioWorklet as data: URL – the CSP (script-src 'self') and Safari would block it.
    assetsInlineLimit: (file: string) => (file.endsWith('.js') ? false : undefined),
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
