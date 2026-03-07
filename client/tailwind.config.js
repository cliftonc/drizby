/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../node_modules/drizzle-cube/dist/client/**/*.{js,mjs}',
  ],
  theme: {
    extend: {
      colors: {
        'dc-surface': 'var(--dc-surface)',
        'dc-surface-secondary': 'var(--dc-surface-secondary)',
        'dc-surface-tertiary': 'var(--dc-surface-tertiary)',
        'dc-surface-hover': 'var(--dc-surface-hover)',

        'dc-text': 'var(--dc-text)',
        'dc-text-secondary': 'var(--dc-text-secondary)',
        'dc-text-muted': 'var(--dc-text-muted)',
        'dc-text-disabled': 'var(--dc-text-disabled)',

        'dc-border': 'var(--dc-border)',
        'dc-border-secondary': 'var(--dc-border-secondary)',
        'dc-border-hover': 'var(--dc-border-hover)',

        'dc-primary': 'var(--dc-primary)',
        'dc-primary-hover': 'var(--dc-primary-hover)',
        'dc-primary-content': 'var(--dc-primary-content)',

        'dc-success': 'var(--dc-success)',
        'dc-success-bg': 'var(--dc-success-bg)',
        'dc-success-border': 'var(--dc-success-border)',

        'dc-warning': 'var(--dc-warning)',
        'dc-warning-bg': 'var(--dc-warning-bg)',
        'dc-warning-border': 'var(--dc-warning-border)',

        'dc-error': 'var(--dc-error)',
        'dc-error-bg': 'var(--dc-error-bg)',
        'dc-error-border': 'var(--dc-error-border)',

        'dc-info': 'var(--dc-info)',
        'dc-info-bg': 'var(--dc-info-bg)',
        'dc-info-border': 'var(--dc-info-border)',

        'dc-danger': 'var(--dc-danger)',
        'dc-danger-hover': 'var(--dc-danger-hover)',
        'dc-danger-bg': 'var(--dc-danger-bg)',

        'dc-card-bg': 'var(--dc-card-bg)',
        'dc-card-bg-hover': 'var(--dc-card-bg-hover)',
        'dc-card-border': 'var(--dc-card-border)',
        'dc-card-border-hover': 'var(--dc-card-border-hover)',

        'dc-accent': 'var(--dc-accent)',
        'dc-accent-hover': 'var(--dc-accent-hover)',
        'dc-accent-bg': 'var(--dc-accent-bg)',
        'dc-accent-border': 'var(--dc-accent-border)',

        'dc-muted': 'var(--dc-muted)',
        'dc-muted-bg': 'var(--dc-muted-bg)',
        'dc-muted-border': 'var(--dc-muted-border)',
      },
    },
  },
  plugins: [],
}
