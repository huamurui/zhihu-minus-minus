import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { generateZse96, getDc0, ZSE_VERSION } from './crypto';

const apiClient = axios.create({
  baseURL: 'https://www.zhihu.com',
  timeout: 10000,
});

apiClient.interceptors.request.use(async (config) => {
  const cookie = (await SecureStore.getItemAsync('user_cookies')) || '';

  if (cookie) {
    config.headers['Cookie'] = cookie;

    // 计算签名所需的 Path
    // 注意：需要包含 query params
    let url = config.url || '';

    // 处理 baseURL
    if (config.baseURL && url.startsWith(config.baseURL)) {
      url = url.substring(config.baseURL.length);
    }

    // 确保以 / 开头
    if (!url.startsWith('/')) {
      url = '/' + url;
    }

    // 拼接参数
    if (config.params) {
      const params = new URLSearchParams(config.params).toString();
      if (params) {
        url += (url.includes('?') ? '&' : '?') + params;
      }
    }

    const dc0 = getDc0(cookie);

    if (dc0) {
      const zse96 = await generateZse96(url, dc0);
      config.headers['x-zse-96'] = zse96;
      config.headers['x-zse-93'] = ZSE_VERSION;
    }
    config.headers['x-requested-with'] = 'fetch'; // 伪装成现代浏览器 fetch  // 加上知乎 web 端的一些必备头
  }

  config.headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
  config.headers['x-requested-with'] = 'fetch';
  config.headers['Referer'] = 'https://www.zhihu.com/';
  return config;
});

apiClient.interceptors.response.use(response => response, error => {
  console.error('API 请求错误:', error.response?.status, error.response?.data || error.message);
  console.error('请求配置:', error.config);
  return Promise.reject(error);
});

export default apiClient;