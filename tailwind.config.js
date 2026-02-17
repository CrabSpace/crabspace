/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        './pages/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
        './app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                primary: '#3498db',
                'background-light': '#f8f9fa',
                'background-dark': '#060a12',
                'card-dark': '#111622',
                'border-dark': '#222a3a',
                'text-muted-dark': '#94a3b8',
                'accent-green': '#00c38c',
                crab: {
                    50: '#fef3f2',
                    100: '#fee5e2',
                    200: '#fecfca',
                    300: '#fcaea5',
                    400: '#f87f72',
                    500: '#ef5844',
                    600: '#dc3b27',
                    700: '#b92f1d',
                    800: '#98291c',
                    900: '#7d271d',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'Roboto Mono', 'monospace'],
            },
            borderRadius: {
                DEFAULT: '0.5rem',
            },
        },
    },
    plugins: [],
}
