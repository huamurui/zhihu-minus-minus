/** Explicit opt-in permits a Release build to expose the real-content experiment. */
export const richContentExperimentEnabled =
  __DEV__ || process.env.EXPO_PUBLIC_RICH_CONTENT_EXPERIMENT === '1';
