/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand & Status
        primary: '#0084ff',
        danger: '#ff4d4f',
        success: '#2ecc71',
        warning: { DEFAULT: '#ff9800', dark: '#ffcf40' },

        // Text
        foreground: { DEFAULT: '#1a1a1a', dark: '#ffffff' },
        secondary: { DEFAULT: '#666666', dark: '#888888' },
        tertiary: { DEFAULT: '#999999', dark: '#cccccc' },

        // Backgrounds & Surface
        base: { DEFAULT: '#f6f6f6', dark: '#121212' },
        surface: { DEFAULT: '#ffffff', dark: '#1a1a1a' },
        'surface-tertiary': { DEFAULT: '#f3f3f3', dark: '#333333' },

        // Borders & Dividers
        border: { DEFAULT: '#eeeeee', dark: '#333333' },
        divider: { DEFAULT: 'rgba(0,0,0,0.05)', dark: 'rgba(255,255,255,0.1)' },

        // Legacy tints
        'tab-icon': { DEFAULT: '#cccccc', dark: '#cccccc' },
        'tab-icon-active': { DEFAULT: '#0084ff', dark: '#ffffff' },
      },
    },
  },
  plugins: [],
};
