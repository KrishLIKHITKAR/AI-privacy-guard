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
        // Define multiple entry points so service modules are built to predictable paths
        rollupOptions: {
            input: {
                popup: resolve(__dirname, 'popup.html'),
                background: resolve(__dirname, 'background.ts'),
                'services/textDetection': resolve(__dirname, 'services/textDetection.ts'),
                'services/policyAnalyzer': resolve(__dirname, 'services/policyAnalyzer.ts'),
                'services/readabilityExtract': resolve(__dirname, 'services/readabilityExtract.ts'),
            },
            output: {
                entryFileNames: (chunk) => {
                    // keep service paths stable for dynamic import
                    return `${chunk.name}.js`;
                },
                chunkFileNames: 'chunks/[name].js',
                assetFileNames: 'assets/[name][extname]'
            }
        }
    }
})