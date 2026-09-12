import client, { type ApiRequestOptions } from '../client';

export interface ChatParticipant {
  type: string;
  message_user_type: string;
  id: string;
  url: string;
  name: string;
  url_token: string;
  user_type: string;
  headline: string;
  avatar_url: string;
}

export interface InboxThread {
  id: string;
  type: string;
  snippet: string;
  url: string;
  participant: ChatParticipant;
  updated_time: number;
  unread_count: number;
}

export interface InboxResponse {
  data: InboxThread[];
  paging: {
    is_end: boolean;
    next: string;
    previous: string;
  };
  new_count: number;
}

export interface ChatMessageInfo {
  id: string;
  type: string;
  url: string;
  text: string;
  created_time: number;
  content_type: number;
  user_type: 'receiver' | 'sender' | 'normal';
}

export interface ChatMessage {
  info: ChatMessageInfo;
  receiver: ChatParticipant;
  sender: ChatParticipant;
}

export interface ChatMessagesResponse {
  data: ChatMessage[];
  paging: {
    is_end: boolean;
    next: string;
    previous: string;
  };
}

export const getInbox = async (
  nextUrl?: string,
  options: ApiRequestOptions = {},
) => {
  const url = nextUrl || 'https://www.zhihu.com/api/v4/inbox';
  const { data } = await client.get<InboxResponse>(url, {
    signal: options.signal,
  });
  return data;
};

export const getMessages = async (
  senderId: string,
  nextUrl?: string,
  options: ApiRequestOptions = {},
) => {
  const url =
    nextUrl ||
    `https://www.zhihu.com/api/v4/chat?sender_id=${senderId}&limit=20`;
  const { data } = await client.get<any>(url, { signal: options.signal });

  // 转换数据结构，使其与 POST 返回的单条消息结构一致，方便统一渲染
  const messages = data?.data?.messages || [];
  const sender = data?.data?.sender || {};
  const receiver = data?.data?.receiver || {};

  return {
    data: messages.map((msg: any) => ({
      info: msg,
      sender: sender,
      receiver: receiver,
    })),
    paging: data?.paging,
  };
};

export const sendMessage = async (receiverId: string, text: string) => {
  const { data } = await client.post<ChatMessage>(
    'https://www.zhihu.com/api/v4/chat',
    {
      content_type: 0,
      receiver_id: receiverId,
      text: text,
    },
  );
  return data;
};
