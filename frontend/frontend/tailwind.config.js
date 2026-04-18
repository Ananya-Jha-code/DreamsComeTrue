/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        night: {
          900: "#0b0f1a",
          800: "#121a2e",
          700: "#1a2744",
        },
        amber: {
          glow: "#d4a574",
          soft: "#e8c9a8",
        },
      },
    },
  },
  plugins: [],
};
