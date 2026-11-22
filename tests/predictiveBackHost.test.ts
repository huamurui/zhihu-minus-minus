const mockPlatform = { OS: 'android', Version: 34 };
const mockSystemBackModule = {
  setTarget: jest.fn(),
  setBackHandlerEnabled: jest.fn(),
  releaseSurface: jest.fn(),
};
const mockOptionalModule = jest.fn();
const mockRequireView = jest.fn();
const mockViewConfig = jest.fn();

jest.mock('expo', () => ({
  requireOptionalNativeModule: (...args: unknown[]) =>
    mockOptionalModule(...args),
  requireNativeView: (...args: unknown[]) => mockRequireView(...args),
}));

jest.mock('react-native', () => ({ Platform: mockPlatform, View: 'View' }));

const originalViewConfig = globalThis.expo.getViewConfig;
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockPlatform, { OS: 'android', Version: 34 });
  globalThis.expo.getViewConfig = mockViewConfig;
  mockOptionalModule.mockReturnValue(mockSystemBackModule);
  mockRequireView.mockReturnValue('BackSwipeHost');
  mockViewConfig.mockReturnValue({ validAttributes: {}, directEventTypes: {} });
});
afterAll(() => {
  globalThis.expo.getViewConfig = originalViewConfig;
});

test.each([
  ['android', 34, true, true, 'BackSwipeHost'],
  ['android', 34, true, false, 'View'],
  ['android', 34, false, false, 'View'],
  ['android', 33, true, true, 'View'],
  ['ios', 34, true, true, 'View'],
] as const)(
  'on %s %i with native module %s and native view %s the route renders %s',
  (os, version, hasModule, hasView, host) => {
    Object.assign(mockPlatform, { OS: os, Version: version });
    if (!hasModule) mockOptionalModule.mockReturnValue(null);
    if (!hasView) mockViewConfig.mockReturnValue(null);
    jest.isolateModules(() => {
      const bridge = jest.requireActual<
        typeof import('../modules/predictive-back')
      >('../modules/predictive-back');
      expect(bridge.BackSwipeHost).toBe(host);
      if (host === 'BackSwipeHost') {
        expect(mockRequireView).toHaveBeenCalledWith('ZhihuPredictiveBack');
      } else {
        expect(mockRequireView).not.toHaveBeenCalled();
      }
      bridge.setPredictiveBackTarget('route');
      const canPreview = os === 'android' && version >= 34 && hasModule;
      expect(bridge.supportsPredictiveBack).toBe(canPreview);
      expect(mockSystemBackModule.setTarget).toHaveBeenCalledTimes(
        canPreview ? 1 : 0,
      );
    });
  },
);

test('a module using the older progress protocol keeps hardware Back and cannot navigate on a drag', () => {
  const listeners = new Set<(event: object) => void>();
  const legacy = {
    setTarget: jest.fn(),
    setBackHandlerEnabled: jest.fn(),
    addListener: (_name: string, listener: (event: object) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  mockOptionalModule.mockReturnValue(legacy);
  mockViewConfig.mockReturnValue(null);
  jest.isolateModules(() => {
    const bridge = jest.requireActual<
      typeof import('../modules/predictive-back')
    >('../modules/predictive-back');
    const navigate = jest.fn();
    const subscription = bridge.addPredictiveBackListener(navigate);
    bridge.setPredictiveBackTarget('source');
    bridge.setAndroidBackHandlerEnabled(true, false);
    for (const phase of ['start', 'progress', 'cancel']) {
      for (const listener of listeners) {
        listener({ phase, routeKey: 'source', gestureId: 1 });
      }
    }
    expect(bridge.supportsPredictiveBack).toBe(false);
    expect(bridge.BackSwipeHost).toBe('View');
    expect(legacy.setTarget).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(legacy.setBackHandlerEnabled).toHaveBeenCalledWith(true, false);
    bridge.releasePredictiveBackSurface(1);
    subscription.remove();
  });
});
