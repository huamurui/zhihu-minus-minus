import axios from 'axios';

export const getDailyLatest = async () => {
  const res = await axios.get('https://news-at.zhihu.com/api/4/news/latest');
  return res.data;
};

export const getDailyBefore = async (date: string) => {
  const res = await axios.get(
    `https://news-at.zhihu.com/api/4/news/before/${date}`,
  );
  return res.data;
};

export const getDailyDetail = async (id: string | number) => {
  const res = await axios.get(`https://news-at.zhihu.com/api/4/news/${id}`);
  return res.data;
};
