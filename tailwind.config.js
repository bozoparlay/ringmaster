/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          850: '#1f1f23',
          900: '#18181b',
          950: '#0f0f12',
        },
        accent: {
          DEFAULT: '#f59e0b',
          hover: '#d97706',
          muted: '#92400e',
        },
        priority: {
          critical: '#ef4444',
          high: '#f97316',
          medium: '#eab308',
          low: '#22c55e',
          someday: '#6b7280',
        }
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'glow-amber': '0 0 20px -5px rgba(245, 158, 11, 0.3)',
        'glow-amber-sm': '0 0 10px -3px rgba(245, 158, 11, 0.2)',
        'card': '0 2px 8px -2px rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.2)',
        'card-hover': '0 8px 24px -4px rgba(0, 0, 0, 0.4), 0 2px 8px -2px rgba(0, 0, 0, 0.3)',
        'card-dragging': '0 20px 40px -8px rgba(0, 0, 0, 0.5), 0 8px 16px -4px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(245, 158, 11, 0.15), 0 0 30px -5px rgba(245, 158, 11, 0.2)',
        'panel': '-8px 0 32px -4px rgba(0, 0, 0, 0.5)',
        'glow-red': '0 0 24px -4px rgba(239, 68, 68, 0.4), 0 0 48px -8px rgba(239, 68, 68, 0.2)',
        'trash-zone': '0 4px 16px -4px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255,255,255,0.05)',
      },
      animation: {
        'slide-in': 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-out': 'slideOut 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fadeIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
        'spotlight': 'spotlight 3s ease-in-out infinite',
        'card-lift': 'cardLift 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'card-drop': 'cardDrop 0.25s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'ai-gradient': 'aiGradient 8s ease infinite',
        'ai-pulse': 'aiPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ai-orbit': 'aiOrbit 3s linear infinite',
        'ai-orbit-reverse': 'aiOrbitReverse 4s linear infinite',
        'ai-float': 'aiFloat 3s ease-in-out infinite',
        'ai-shimmer': 'aiShimmer 2s linear infinite',
        'ai-text-cycle': 'aiTextCycle 0.5s ease-in-out',
        'trash-appear': 'trashAppear 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'trash-pulse': 'trashPulse 1.5s ease-in-out infinite',
      },
      keyframes: {
        slideIn: {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        slideOut: {
          from: { transform: 'translateX(0)', opacity: '1' },
          to: { transform: 'translateX(100%)', opacity: '0' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        scaleIn: {
          from: { transform: 'scale(0.95)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        spotlight: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '0.8' },
        },
        cardLift: {
          '0%': {
            transform: 'scale(1) rotate(0deg)',
            boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.3)',
          },
          '50%': {
            transform: 'scale(1.06) rotate(1.5deg)',
          },
          '100%': {
            transform: 'scale(1.04) rotate(1deg)',
            boxShadow: '0 20px 40px -8px rgba(0, 0, 0, 0.5), 0 8px 16px -4px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(245, 158, 11, 0.15), 0 0 30px -5px rgba(245, 158, 11, 0.2)',
          },
        },
        cardDrop: {
          '0%': {
            transform: 'scale(1.04) rotate(1deg)',
          },
          '60%': {
            transform: 'scale(0.98) rotate(-0.5deg)',
          },
          '100%': {
            transform: 'scale(1) rotate(0deg)',
          },
        },
        aiGradient: {
          '0%, 100%': {
            backgroundPosition: '0% 50%',
          },
          '50%': {
            backgroundPosition: '100% 50%',
          },
        },
        aiPulse: {
          '0%, 100%': {
            opacity: '1',
            transform: 'scale(1)',
          },
          '50%': {
            opacity: '0.7',
            transform: 'scale(0.95)',
          },
        },
        aiOrbit: {
          '0%': {
            transform: 'rotate(0deg) translateX(24px) rotate(0deg)',
          },
          '100%': {
            transform: 'rotate(360deg) translateX(24px) rotate(-360deg)',
          },
        },
        aiOrbitReverse: {
          '0%': {
            transform: 'rotate(0deg) translateX(32px) rotate(0deg)',
          },
          '100%': {
            transform: 'rotate(-360deg) translateX(32px) rotate(360deg)',
          },
        },
        aiFloat: {
          '0%, 100%': {
            transform: 'translateY(0px)',
          },
          '50%': {
            transform: 'translateY(-6px)',
          },
        },
        aiShimmer: {
          '0%': {
            backgroundPosition: '-200% 0',
          },
          '100%': {
            backgroundPosition: '200% 0',
          },
        },
        aiTextCycle: {
          '0%': {
            opacity: '0',
            transform: 'translateY(8px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        fadeSlideIn: {
          '0%': {
            opacity: '0',
            transform: 'translateY(-4px) scale(0.95)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0) scale(1)',
          },
        },
        trashAppear: {
          '0%': {
            opacity: '0',
            transform: 'scale(0.8) translateY(8px)',
          },
          '100%': {
            opacity: '1',
            transform: 'scale(1) translateY(0)',
          },
        },
        trashPulse: {
          '0%, 100%': {
            opacity: '0.4',
            transform: 'scale(1)',
          },
          '50%': {
            opacity: '0',
            transform: 'scale(1.5)',
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
