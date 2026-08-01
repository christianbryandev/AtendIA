/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // brand-500 e a cor da logo: ICONES E FUNDOS APENAS.
        // Texto branco sobre ela tem contraste 2,6:1 (reprova WCAG AA).
        // Botoes e qualquer elemento com texto usam brand-700 (5,6:1).
        brand: { 50: '#ECFDF5', 500: '#10B981', 700: '#047857', 900: '#064E3B' },
        ink: { 600: '#57534E', 800: '#292524' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
