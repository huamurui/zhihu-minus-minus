/**
 * 喜欢（收藏到「喜欢」）相关接口占位实现。
 *
 * 当前后端尚未接入真实的喜欢接口，这里先保留稳定的函数签名，调用方依赖
 * `useLikeStore` 做本地乐观更新。接入真实接口时只需替换函数体，签名不变。
 */

export const likeAnswer = async (
  _answerId: string | number,
): Promise<unknown> => {
  // TODO: 接入真实喜欢回答接口
  return undefined;
};

export const likeArticle = async (
  _articleId: string | number,
): Promise<unknown> => {
  // TODO: 接入真实喜欢文章接口
  return undefined;
};
