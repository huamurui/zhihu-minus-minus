import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  type ModalProps,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { ScreenOverlayHost } from '@/components/overlays/ScreenOverlay';
import { useSettingsStore } from '@/store/useSettingsStore';
import { shouldUseTwoPanes } from './layout';
import {
  ModalOriginPaneContext,
  PaneContext,
  PaneVisibilityContext,
  useOriginPane,
  usePaneVisible,
} from './PaneContext';

/** Hide retained routes' portals without changing their open state. */
export function PaneModal({
  visible = true,
  windowOverlayInTwoPanes = false,
  children,
  ...props
}: ModalProps & { windowOverlayInTwoPanes?: boolean }) {
  const paneVisible = usePaneVisible();
  const origin = useOriginPane();
  const presented = visible && paneVisible;
  const content = (
    <PaneVisibilityContext.Provider value={presented}>
      <ModalOriginPaneContext.Provider value={origin}>
        <PaneContext.Provider value={null}>
          <ScreenOverlayHost>{children}</ScreenOverlayHost>
        </PaneContext.Provider>
      </ModalOriginPaneContext.Provider>
    </PaneVisibilityContext.Provider>
  );
  if (Platform.OS === 'ios' && windowOverlayInTwoPanes) {
    return (
      <IOSPaneSheet {...props} visible={visible} presented={presented}>
        {content}
      </IOSPaneSheet>
    );
  }
  return (
    <Modal {...props} visible={presented}>
      {content}
    </Modal>
  );
}

function IOSPaneSheet({
  visible = true,
  presented,
  children,
  onDismiss,
  ...props
}: ModalProps & { presented: boolean }) {
  const origin = useOriginPane();
  const { width } = useWindowDimensions();
  const layoutMode = useSettingsStore((s) => s.largeScreenLayoutMode);
  // The collection picker and double-tap sheet are mounted outside the stack.
  const prefersWindowOverlay = origin
    ? !!origin.twoPane
    : shouldUseTwoPanes(layoutMode, width);
  // Keep one host through dismissal even if the window is resized in the meantime.
  const [presentation, setPresentation] = useState({
    visible,
    windowOverlay: prefersWindowOverlay,
  });
  if (visible !== presentation.visible) {
    setPresentation({
      visible,
      windowOverlay: visible
        ? prefersWindowOverlay
        : presentation.windowOverlay,
    });
  }
  const { windowOverlay } = presentation;
  const wasWindowOverlayPresented = useRef(false);
  useEffect(() => {
    // A covered route can temporarily hide a sheet during its exit animation.
    // Deliver onDismiss when the owner has actually closed it, even if hidden.
    if (windowOverlay && presented) {
      wasWindowOverlayPresented.current = true;
    } else if (!visible && wasWindowOverlayPresented.current) {
      wasWindowOverlayPresented.current = false;
      onDismiss?.();
    }
  }, [onDismiss, presented, visible, windowOverlay]);

  // An in-app sheet already animates itself. Keep UIKit's presenting view
  // controller in place while showing the sheet across both panes.
  if (windowOverlay) {
    return presented ? (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal>
        {children}
      </FullWindowOverlay>
    ) : null;
  }
  return (
    <Modal {...props} visible={presented} onDismiss={onDismiss}>
      {children}
    </Modal>
  );
}
