import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss(), {
 name:'production-security-policy',apply:'build',transformIndexHtml(){
  // Build-only HTML policy avoids Netlify dev reading a previous dist/_headers.
  // Frame protection remains in netlify.toml via X-Frame-Options: DENY.
  return [{tag:'meta',attrs:{'http-equiv':'Content-Security-Policy',content:"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'"},injectTo:'head-prepend'}];
 }
}] });
