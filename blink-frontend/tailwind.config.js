/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            keyframes: {
                slideInRight: {
                    '0%': { transform: 'translateX(100%)' },
                    '100%': { transform: 'translateX(0)' },
                },
                slideInBottom: {
                    '0%': { transform: 'translateY(100%)' },
                    '100%': { transform: 'translateY(0)' },
                },
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
            },
            animation: {
                'drawer-right': 'slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'drawer-bottom': 'slideInBottom 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'fade-in': 'fadeIn 0.4s ease-out forwards',
            },
        },
    },
    plugins: [],
};