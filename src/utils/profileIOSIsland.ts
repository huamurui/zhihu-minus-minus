// Standard portrait viewports in points. Model identifiers come from Xcode's device
// profiles; the idle island measurements are from https://safearea.info.
const islandProfiles = [
  {
    models: ['iPhone15,2', 'iPhone15,4', 'iPhone16,1', 'iPhone17,3'],
    width: 393,
    height: 852,
    safeTop: 59,
    islandWidth: 125,
  },
  {
    models: ['iPhone15,3', 'iPhone15,5', 'iPhone16,2', 'iPhone17,4'],
    width: 430,
    height: 932,
    safeTop: 59,
    islandWidth: 376 / 3,
  },
  {
    models: ['iPhone17,1', 'iPhone18,1', 'iPhone18,3'],
    width: 402,
    height: 874,
    safeTop: 62,
    islandWidth: 376 / 3,
  },
  {
    models: ['iPhone17,2', 'iPhone18,2'],
    width: 440,
    height: 956,
    safeTop: 62,
    islandWidth: 376 / 3,
  },
  {
    models: ['iPhone18,4'],
    width: 420,
    height: 912,
    safeTop: 68,
    islandWidth: 376 / 3,
  },
  {
    models: ['iPhone19,2'],
    width: 402,
    height: 874,
    safeTop: 62,
    islandWidth: 284 / 3,
  },
  {
    models: ['iPhone19,3'],
    width: 440,
    height: 956,
    safeTop: 62,
    islandWidth: 284 / 3,
  },
];

export function getProfileIOSIslandRect(
  modelId: string | null,
  windowWidth: number,
  windowHeight: number,
  safeAreaTop: number,
  isPhoneSimulator = false,
) {
  // expo-device reports the host architecture on Simulator. Matching all three
  // viewport measurements is a development-only fallback; real phones require an ID.
  const useSimulatorViewport =
    isPhoneSimulator &&
    (modelId === 'arm64' || modelId === 'x86_64' || modelId === 'i386');
  const matches = islandProfiles.filter(
    (profile) =>
      profile.width === windowWidth &&
      profile.height === windowHeight &&
      profile.safeTop === safeAreaTop &&
      (useSimulatorViewport ||
        (modelId !== null && profile.models.includes(modelId))),
  );
  if (matches.length === 0) return null;

  // Some simulated models share the same viewport but have differently sized
  // islands. The smaller outline keeps the attachment inside either one.
  const width = Math.min(...matches.map((profile) => profile.islandWidth));
  return {
    x: (windowWidth - width) / 2,
    y: safeAreaTop === 59 ? 34 / 3 : safeAreaTop - 48,
    width,
    height: 110 / 3,
  };
}
