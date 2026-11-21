import CookieManager, {
  type Cookies,
} from '@preeternal/react-native-cookie-manager';
import { useCallback, useEffect, useRef } from 'react';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import { showToast } from '@/utils/toast';

// The homepage redirect can precede the native cookie store update.
const RETRY_DELAYS_MS = [200, 500, 1000, 2000];

interface CookieCheck {
  timer?: ReturnType<typeof setTimeout>;
}

export function useLoginCookieCapture(onCapture: (cookies: string) => void) {
  const pending = useRef<CookieCheck | null>(null);

  const cancel = useCallback(() => {
    clearTimeout(pending.current?.timer);
    pending.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const start = () => {
    if (pending.current) return;
    const check: CookieCheck = {};
    pending.current = check;
    const version = getAuthSessionVersion();
    const isCurrent = () =>
      pending.current === check && getAuthSessionVersion() === version;

    async function read(attempt: number) {
      if (!isCurrent()) return;
      let cookies: Cookies;
      try {
        cookies = await CookieManager.get('https://www.zhihu.com', true);
      } catch {
        if (isCurrent()) {
          cancel();
          showToast('读取登录状态失败，请稍后重试');
        }
        return;
      }
      if (!isCurrent()) return;
      if (cookies.z_c0?.value) {
        cancel();
        onCapture(
          Object.values(cookies)
            .map(({ name, value }) => `${name}=${value}`)
            .join('; '),
        );
        return;
      }
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        cancel();
        return;
      }
      check.timer = setTimeout(() => void read(attempt + 1), delay);
    }

    void read(0);
  };

  return { start, cancel };
}
