import axios from 'axios';
import {
  buildZhihuAuthHeaders,
  getSetCookieHeaders,
  mergeCookieHeader,
} from './client';
import type { ZhihuMeInfo } from './zhihu/me';

const SESSION_VERIFY_INCLUDE =
  'id,ad_type,email,account_status,is_bind_phone,available_message_types,default_notifications_count,follow_notifications_count,vote_thank_notifications_count,messages_count,is_org,avatar_url,name,url_token,draft_count,following_question_count,is_realname,is_force_renamed,renamed_fullname,is_destroy_waiting';

export interface VerifiedZhihuSession {
  cookies: string;
  me: ZhihuMeInfo;
}

/** Verify a candidate account without changing the currently active account. */
export async function verifyZhihuSession(
  cookies: string,
): Promise<VerifiedZhihuSession> {
  if (!cookies.trim()) throw new Error('登录 Cookie 为空');
  const url = `https://www.zhihu.com/api/v4/me?include=${SESSION_VERIFY_INCLUDE}`;
  const response = await axios.get<ZhihuMeInfo>(url, {
    timeout: 10000,
    withCredentials: false,
    headers: await buildZhihuAuthHeaders(url, cookies),
  });
  const mergedCookies = mergeCookieHeader(
    cookies,
    getSetCookieHeaders(response.headers),
  );
  return { cookies: mergedCookies || cookies, me: response.data };
}
