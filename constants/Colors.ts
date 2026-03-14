// constants/Colors.ts

// Semantic color palettes
export default {
  light: {
    // Brand & Status
    primary: '#0084ff',
    danger: '#ff4d4f',
    success: '#2ecc71',
    warning: '#ff9800', // unified warning/orange color
    
    // Text
    text: '#1a1a1a',
    textSecondary: '#666666',
    textTertiary: '#999999',
    
    // Backgrounds & Surface
    background: '#f6f6f6',
    backgroundSecondary: '#ffffff', // Formerly just 'surface', cards & panels
    backgroundTertiary: '#f3f3f3',  // Search bars, inactive elements
    surface: '#ffffff', // Kept for backwards compatibility
    
    // Borders & Dividers
    border: '#eeeeee',
    divider: 'rgba(0,0,0,0.05)',
    
    // Legacy tints
    tint: '#0084ff',
    tabIconDefault: '#cccccc',
    tabIconSelected: '#0084ff',

    // Transparents & Overlays
    primaryTransparent: 'rgba(0, 132, 255, 0.1)',
    blackTransparent: 'rgba(0,0,0,0.5)',
    whiteTransparent: 'rgba(255,255,255,0.85)',
  },
  dark: {
    // Brand & Status
    primary: '#0084ff', // Usually blue retains vibrancy but could be dialed slightly in dark mode. Keeping standard for now.
    danger: '#ff4d4f',
    success: '#2ecc71',
    warning: '#ffcf40', // slightly different yellow/orange for dark mode from ProfileView
    
    // Text
    text: '#ffffff',
    textSecondary: '#888888',
    textTertiary: '#cccccc',
    
    // Backgrounds & Surface
    background: '#121212', // Less harsh than #000000
    backgroundSecondary: '#1a1a1a', 
    backgroundTertiary: '#333333',
    surface: '#1a1a1a', // Kept for backwards compatibility
    
    // Borders & Dividers
    border: '#333333',
    divider: 'rgba(255,255,255,0.1)',
    
    // Legacy tints
    tint: '#0084ff',
    tabIconDefault: '#cccccc',
    tabIconSelected: '#ffffff',

    // Transparents & Overlays
    primaryTransparent: 'rgba(0, 132, 255, 0.15)',
    blackTransparent: 'rgba(0,0,0,0.6)',
    whiteTransparent: 'rgba(26,26,26,0.8)', // from app/answer/[id].tsx blur view fallback
  },
};