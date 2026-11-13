import { defineConfig } from 'vite'
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

export default defineConfig({
  plugins: [react(), brandingPlugin()],
})
