/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      colors: {
        primary:     '#1E1B4B',
        'on-primary':'#FFFFFF',
        secondary:   '#312E81',
        accent:      'rgb(var(--accent) / <alpha-value>)',
        bg:          'rgb(var(--bg) / <alpha-value>)',
        fg:          'rgb(var(--fg) / <alpha-value>)',
        muted:       'rgb(var(--muted) / <alpha-value>)',
        border:      'rgb(var(--border) / <alpha-value>)',
        destructive: 'rgb(var(--destructive) / <alpha-value>)',
        success:     'rgb(var(--success) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Rubik', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Rubik', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite',
        'fade-in':    'fade-in 200ms ease-out',
        'slide-up':   'slide-up 250ms ease-out',
      },
      keyframes: {
        'pulse-ring': {
          '0%':   { transform: 'scale(1)',    opacity: '0.8' },
          '80%,100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'fade-in':  { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
