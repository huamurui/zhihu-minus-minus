import rawTokens from './designTokens.json';

/**
 * The single source of truth for app-level visual decisions.
 *
 * Keep component-specific colors (for example, colors received from Zhihu's
 * API) at the feature boundary. Everything describing this app's own chrome
 * should come from these tokens.
 */
export const designTokens = rawTokens;
export const colors = rawTokens.colors;
export const typography = rawTokens.typography;
export const radii = rawTokens.radii;
export const opacity = rawTokens.opacity;
export const effects = {
  ...rawTokens.effects,
  gradientMask: {
    light: rawTokens.effects.gradientMask.light as [string, string],
    dark: rawTokens.effects.gradientMask.dark as [string, string],
  },
};

export type ColorScheme = keyof typeof colors;
export type ColorToken = keyof (typeof colors)['light'];
