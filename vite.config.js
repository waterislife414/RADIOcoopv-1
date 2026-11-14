import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import branding from './branding.config.json' with { type: 'json' }

// Injects branding into index.html at build time: page title, meta
// description, theme color, PWA title, and the :root CSS variables that
// index.css uses for brand-specific colors. Rebrand = edit branding.config.json.
function brandingPlugin() {
  const c = branding.colors
  const stops = c.chromeGradient
  const rootVars = `:root{--brand-glow:${c.glowRGB};--chrome-1:${stops[0]};--chrome-2:${stops[1]};--chrome-3:${stops[2]};--chrome-4:${stops[3]};--chrome-5:${stops[4]};}`
  return {
    name: 'branding-inject',
    transformIndexHtml(html) {
      return html
        .replace(/<title>.*?<\/title>/, `<title>${branding.copy.metaTitle}</title>`)
        .replace(/(<meta name="description" content=").*?(")/, `$1${branding.copy.metaDescription}$2`)
        .replace(/(<meta name="theme-color" content=").*?(")/, `$1${c.themeColor}$2`)
        .replace(/(<meta name="apple-mobile-web-app-title" content=").*?(")/, `$1${branding.company.name}$2`)
        .replace('</head>', `  <style>${rootVars}</style>\n  </head>`)
    },
  }
}

// Demo build (`npm run build:demo`): the same app, with the cloud services
// swapped for in-browser stand-ins from src/demo so it runs with no Firebase
// billing and no Stripe account. The normal build never touches src/demo.
const demo = (f) => path.resolve(import.meta.dirname, 'src/demo', f)
const demoAliases = [
  { find: /^firebase\/app$/, replacement: demo('shims/app.js') },
  { find: /^firebase\/auth$/, replacement: demo('shims/auth.js') },
  { find: /^firebase\/firestore$/, replacement: demo('shims/firestore.js') },
  { find: /^firebase\/storage$/, replacement: demo('shims/storage.js') },
  { find: /^firebase\/functions$/, replacement: demo('shims/functions-client.js') },
  { find: /^@stripe\/stripe-js$/, replacement: demo('shims/stripe-js.js') },
  { find: /^@stripe\/react-stripe-js$/, replacement: demo('shims/react-stripe.jsx') },
  { find: /^firebase-admin$/, replacement: demo('shims/admin.js') },
  { find: /^firebase-admin\/functions$/, replacement: demo('shims/admin-functions.js') },
  { find: /^firebase-functions\/(v2\/(https|scheduler|firestore|tasks)|params)$/, replacement: demo('shims/functions-runtime.js') },
  { find: /^stripe$/, replacement: demo('shims/stripe-server.js') },
  { find: /^\.\/geocode$/, replacement: demo('geocode.js') },
]
function demoEntryPlugin() {
  return {
    name: 'demo-entry',
    transformIndexHtml: { order: 'pre', handler: (html) => html.replace('/src/main.jsx', '/src/demo/main.jsx') },
  }
}

export default defineConfig(({ mode }) => {
  const isDemo = mode === 'demo'
  return {
    plugins: [react(), brandingPlugin(), ...(isDemo ? [demoEntryPlugin()] : [])],
    ...(isDemo
      ? {
          resolve: { alias: demoAliases },
          define: { 'process.env': '{}' },
          build: { outDir: 'dist-demo', target: 'es2022' },
        }
      : {}),
  }
})
