/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme colors
        background: {
          DEFAULT: '#0f172a', // slate-900
          light: '#1e293b', // slate-800
          lighter: '#334155', // slate-700
        },
        card: {
          DEFAULT: '#1e293b',
          hover: '#334155',
        },
        border: {
          DEFAULT: '#475569', // slate-600
          light: '#64748b', // slate-500
        },
        text: {
          DEFAULT: '#f1f5f9', // slate-100
          muted: '#cbd5e1', // slate-300
          subtle: '#94a3b8', // slate-400
        },
        primary: {
          DEFAULT: '#3b82f6', // blue-500
          hover: '#2563eb', // blue-600
          light: '#60a5fa', // blue-400
        },
        success: {
          DEFAULT: '#10b981', // green-500
          hover: '#059669', // green-600
        },
        danger: {
          DEFAULT: '#ef4444', // red-500
          hover: '#dc2626', // red-600
        },
        warning: {
          DEFAULT: '#f59e0b', // amber-500
          hover: '#d97706', // amber-600
        },
      },
    },
  },
  plugins: [],
}
