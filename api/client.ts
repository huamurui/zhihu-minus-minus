import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// 辅助函数：从 Cookie 字符串中提取特定的 key
const getCookieValue = (cookie: string, key: string) => {
  const match = cookie.match(new RegExp(`(^| )${key}=([^;]+)`));
  return match ? match[2] : null;
};
const apiClient = axios.create({
  baseURL: 'https://www.zhihu.com/api/v4',
  timeout: 10000,
});

apiClient.interceptors.request.use(async (config) => {
  const cookie = await SecureStore.getItemAsync('user_cookies');
  if (cookie) {
    config.headers['Cookie'] = cookie;
    const xsrf = getCookieValue(cookie, '_xsrf');
    if (xsrf) {
      config.headers['x-xsrf-token'] = xsrf; // POST 请求必备
    }
  }

  config.headers['Cookie'] = cookie || '';
  // 关键：伪装成 iOS 端的 Safari
  // 修改 User-Agent，有时模拟 Web 端比模拟 App 更管用
  config.headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
  config.headers['x-requested-with'] = 'fetch'; // 伪装成现代浏览器 fetch  // 加上知乎 web 端的一些必备头
  config.headers['Referer'] = 'https://www.zhihu.com/';
  return config;
});

// 报错的话，统一拦截打印出来，方便调试
apiClient.interceptors.response.use(response => response, error => {
  console.error('API 请求错误:', error.response?.status, error.response?.data || error.message);
  console.error('请求配置:', error.config);
  return Promise.reject(error);
});

export default apiClient;