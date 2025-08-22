/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./**/*.{js,ts,jsx,tsx}",   // looks everywhere, not just /src
    ],
    theme: {
        extend: {
            colors: {
                'brand-bg': '#F3F4F6',
                'brand-surface': '#FFFFFF',
                'brand-primary': '#3B82F6',
                'brand-secondary': '#10B981',
                'brand-text-primary': '#1F2937',
                'brand-text-secondary': '#6B7280',
            },
        },
    },
    plugins: [],
};