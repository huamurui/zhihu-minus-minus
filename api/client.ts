import { useAuthStore } from '@/store/useAuthStore';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { signRequest96 } from './zse96/x';

const apiClient = axios.create({
  baseURL: 'https://www.zhihu.com/api/v4',
  timeout: 10000,
});

const ZSE_VERSION = '101_3_3.0';

function getDc0(cookie: string) {
  const match = cookie.match(/d_c0=([^;]+)/);
  return match ? match[1] : null;
}

apiClient.interceptors.request.use(async (config) => {
  // 优先从 AuthStore 获取，如果没有再尝试从 SecureStore (向下兼容)
  const cookie = useAuthStore.getState().cookies || (await SecureStore.getItemAsync('user_cookies')) || '';

  if (cookie) {
    config.headers['Cookie'] = cookie;
    const dc0 = getDc0(cookie);
    if (dc0) {
      const body = config.data ? (typeof config.data === 'string' ? config.data : JSON.stringify(config.data)) : null;
      const fullUrl = apiClient.getUri(config);
      const zse96 = signRequest96(fullUrl, body, ZSE_VERSION, dc0);
      config.headers['x-zse-96'] = zse96;
      config.headers['x-zse-93'] = ZSE_VERSION;
      config.headers['x-requested-with'] = 'fetch';
      config.headers['Referer'] = 'https://www.zhihu.com/';
      config.headers['User-Agent'] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('请登陆后再尝试');
    }
    console.error('API 请求错误:', error.response?.status, error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default apiClient;