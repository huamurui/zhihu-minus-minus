import { Modal, type ModalProps } from 'react-native';
import { ScreenOverlayHost } from '@/components/overlays/ScreenOverlay';
import {
  ModalOriginPaneContext,
  PaneContext,
  PaneVisibilityContext,
  useOriginPane,
  usePaneVisible,
} from './PaneContext';

/** Hide retained routes' native portals without changing their open state. */
export function PaneModal({ visible = true, children, ...props }: ModalProps) {
  const paneVisible = usePaneVisible();
  const origin = useOriginPane();
  const presented = visible && paneVisible;
  return (
    <Modal {...props} visible={presented}>
      <PaneVisibilityContext.Provider value={presented}>
        <ModalOriginPaneContext.Provider value={origin}>
          <PaneContext.Provider value={null}>
            <ScreenOverlayHost>{children}</ScreenOverlayHost>
          </PaneContext.Provider>
        </ModalOriginPaneContext.Provider>
      </PaneVisibilityContext.Provider>
    </Modal>
  );
}
