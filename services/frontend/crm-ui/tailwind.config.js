/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        "background-light": "var(--background-light)",
        "background-lighter": "var(--background-lighter)",

        card: "var(--card)",
        "card-hover": "var(--card-hover)",

        border: "var(--border)",
        "border-light": "var(--border-light)",

        text: "var(--text)",
        "text-muted": "var(--text-muted)",
        "text-subtle": "var(--text-subtle)",

        primary: "var(--primary)",
        "primary-hover": "var(--primary-hover)",
        "primary-light": "var(--primary-light)",

        success: "var(--success)",
        "success-hover": "var(--success-hover)",

        danger: "var(--danger)",
        "danger-hover": "var(--danger-hover)",

        warning: "var(--warning)",
        "warning-hover": "var(--warning-hover)",
      },
    },
  },
  plugins: [],
};