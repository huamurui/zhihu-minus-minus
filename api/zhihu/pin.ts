import client from '../client';

export const getPin = async (id: string | number) => {
  const include = 'author,content,content_html,created,like_count,comment_count,relationship.voting';
  const res = await client.get(`/pins/${id}?include=${include}`);
  return res.data;
};
