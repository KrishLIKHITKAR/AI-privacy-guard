import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
    base: './', // ensure relative paths in extension
    plugins: [
        react(),
        viteStaticCopy({
            targets: [
                { src: 'manifest.json', dest: '.' },
                { src: 'background.js', dest: '.' },
                { src: 'content.js', dest: '.' },
                { src: 'options.html', dest: '.' },
                { src: 'options.js', dest: '.' },
                { src: 'assets/*', dest: 'assets' }
            ]
        })
    ],
    build: {
        // These two lines fix the security error for Chrome extensions
        target: 'esnext',
        modulePreload: {
            polyfill: false
        },
        // This part is from your original file to define the entry point
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html')
            }
        }
    }
})