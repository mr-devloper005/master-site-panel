/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        "primary-blue": "#3B82F6",
        "primary-blue-dark": "#1D4ED8",
        "panel-light": "#F1F5F9",
        "panel-dark": "#0F172A"
      },
      borderRadius: {
        panel: "12px"
      },
      boxShadow: {
        panel: "0 4px 6px -1px rgba(0,0,0,0.1)"
      },
      transitionTimingFunction: {
        smooth: "ease-in-out"
      }
    }
  },
  plugins: []
};
