import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  type ReactElement,
  type SetStateAction,
  useContext,
  useLayoutEffect,
  useState,
} from 'react';

interface OverlayEntry {
  owner: object;
  content: ReactElement | null;
}
const ScreenOverlayContext = createContext<Dispatch<
  SetStateAction<OverlayEntry | null>
> | null>(null);

/** Each route (including an adaptive pane) and native modal has its own viewport. */
export function ScreenOverlayHost({ children }: PropsWithChildren) {
  const [overlay, setOverlay] = useState<OverlayEntry | null>(null);
  return (
    <ScreenOverlayContext.Provider value={setOverlay}>
      {children}
      {overlay?.content}
    </ScreenOverlayContext.Provider>
  );
}

export function ScreenOverlay({
  owner,
  children,
}: {
  owner: object;
  children: ReactElement;
}) {
  const setOverlay = useContext(ScreenOverlayContext);
  useLayoutEffect(() => {
    setOverlay?.({ owner, content: null });
    return () =>
      setOverlay?.((current) => (current?.owner === owner ? null : current));
  }, [setOverlay, owner]);
  useLayoutEffect(() => {
    // A retained reader must not replace a newer reader's selection on rerender.
    setOverlay?.((current) =>
      current?.owner === owner ? { owner, content: children } : current,
    );
  }, [setOverlay, owner, children]);
  return null;
}
