import {
  createContext,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import {
  ScrollView,
  type ScrollViewInstance,
  type ScrollViewProps,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  type SharedValue,
  useAnimatedRef,
  useScrollOffset,
} from 'react-native-reanimated';

interface SheetScrollGestures {
  pan: ReturnType<typeof Gesture.Pan>;
  scrollOwnsTouch: SharedValue<boolean>;
}

export const SheetScrollContext = createContext<SheetScrollGestures | null>(
  null,
);
type Props = ScrollViewProps & { ref?: Ref<ScrollViewInstance> };

/** Also used as the underlying scroll view for virtualized lists inside a sheet. */
export function SheetScrollView(props: Props) {
  const sheet = useContext(SheetScrollContext);
  return sheet ? (
    <SheetScroller {...props} sheet={sheet} />
  ) : (
    <ScrollView {...props} />
  );
}

function SheetScroller({
  sheet: { pan, scrollOwnsTouch },
  ref,
  ...props
}: Props & { sheet: SheetScrollGestures }) {
  const scrollRef = useAnimatedRef<ScrollViewInstance>();
  // Observe the native offset separately so the list keeps its own onScroll and ref.
  const offset = useScrollOffset(scrollRef);
  const setRef = useCallback(
    (node: ScrollViewInstance | null) => {
      scrollRef(node);
      if (typeof ref === 'function') return ref(node);
      if (ref) ref.current = node;
    },
    [scrollRef, ref],
  );
  useEffect(
    () => () => {
      scrollOwnsTouch.value = false;
    },
    [scrollOwnsTouch],
  );
  const scrollEnabled = props.scrollEnabled !== false;
  const native = useMemo(
    () =>
      Gesture.Native()
        .requireExternalGestureToFail(pan)
        .onTouchesDown(() => {
          // A swipe that starts inside a scrolled list belongs to it until lift.
          scrollOwnsTouch.value = scrollEnabled && offset.value > 1;
        })
        .onFinalize(() => {
          scrollOwnsTouch.value = false;
        })
        .onTouchesCancelled(() => {
          scrollOwnsTouch.value = false;
        })
        .onTouchesUp(() => {
          scrollOwnsTouch.value = false;
        }),
    [pan, scrollOwnsTouch, scrollEnabled, offset],
  );
  return (
    <GestureDetector gesture={native} touchAction="pan-y">
      <ScrollView scrollEventThrottle={16} {...props} ref={setRef} />
    </GestureDetector>
  );
}
