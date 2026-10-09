export interface ZhihuTopic {
  id: string | number;
  name: string;
  type?: string;
  url?: string;
  token?: string;
  description?: string;
  avatar_path?: string;
  avatar_url?: string;
  priority?: number;
}

export interface ZhihuBadge {
  type: string;
  description: string;
  topics?: ZhihuTopic[];
}

export interface ZhihuDetailBadge {
  type?: string;
  detail_type?: string;
  title?: string;
  description?: string;
  url?: string;
  icon?: string;
  night_icon?: string;
  sources?: unknown[];
}

export interface ZhihuMergedBadge {
  type?: string;
  detail_type?: string;
  title?: string;
  description?: string;
  url?: string;
  icon?: string;
  night_icon?: string;
  sources?: unknown[];
}

export interface ZhihuBadgeV2 {
  title: string;
  icon: string;
  night_icon: string;
  detail_badges?: ZhihuDetailBadge[];
  merged_badges?: ZhihuMergedBadge[];
}

export interface ZhihuVipIcon {
  id?: number;
  night_mode_url?: string;
  url?: string;
}

export interface ZhihuVipInfo {
  is_vip?: boolean;
  vip_type?: number;
  rename_days?: string;
  entrance_v2?: null;
  rename_frequency?: number;
  rename_await_days?: number;
  target_url?: string;
  vip_icon?: ZhihuVipIcon;
  widget?: ZhihuVipIcon;
}

export interface ZhihuKvipInfo {
  is_vip: boolean;
}

export interface ZhihuAuthor {
  id: string;
  name: string;
  avatar_url: string;
  avatar_url_template?: string;
  headline?: string;
  url_token?: string;
  user_type?: string;
  type: string;
  is_org?: boolean;
  gender?: number;
  url?: string;
  is_advertiser?: boolean;
  is_privacy?: boolean;
  is_followed?: boolean;
  is_following?: boolean;
  use_default_avatar?: boolean;
  vip_info?: ZhihuVipInfo;
  kvip_info?: ZhihuKvipInfo;
  badge?: ZhihuBadge[];
  badge_v2?: ZhihuBadgeV2;
}

export interface ZhihuSegmentReaction {
  like_count: number;
  comment_count: number;
  is_like: boolean;
  seg_ids?: string[] | string;
  /** 跨段反应不能提交为单段 start/end PID；保留服务端标志。 */
  is_span?: boolean | number | string;
  my_comment_count?: number;
}

export interface ZhihuSegmentMark {
  /** 当前渲染器按 JS UTF-16 下标处理，范围为 [start_index, end_index)。 */
  start_index: number;
  end_index: number;
  seg_info?: ZhihuSegmentReaction;
  master_seg_info?: ZhihuSegmentReaction;
}

export interface ZhihuSegmentInfo {
  pid: string;
  text: string;
  marks: ZhihuSegmentMark[];
}

/** Structured content labels returned by detail and feed endpoints. */
export interface ZhihuEndorsementElement {
  type?: string;
  image_key?: string;
  image_color?: Record<string, unknown>;
  width?: number;
  height?: number;
  content?: string;
  font_size?: number;
  font_color?: Record<string, unknown>;
  is_bold?: boolean;
  max_line?: number;
}

export interface ZhihuEndorsement {
  elements?: ZhihuEndorsementElement[];
  sub_elements?: unknown[];
  sub_elements_type?: string;
  background_color?: {
    alpha?: number;
    group?: string;
  };
  action_url?: string;
  za?: {
    block_text?: string;
    type?: string;
    text?: string;
  };
}

export interface ZhihuQuestion {
  id: string | number;
  title: string;
  created?: number;
  updated_time?: number;
  question_type?: string;
  type: 'question';
  url?: string;
  answer_count?: number;
  follow_num?: number;
  follower_count?: number;
  comment_count?: number;
  visit_count?: number;
  detail?: string;
  excerpt?: string;
  topics?: ZhihuTopic[];
  author?: ZhihuAuthor;
  relationship?: {
    voting?: number;
    is_following?: boolean;
    is_author?: boolean;
    is_anonymous?: boolean;
    is_thanked?: boolean;
    is_nothelp?: boolean;
    my_answer?: {
      id?: string | number;
      answer_id?: string | number;
      is_deleted?: boolean;
    } | null;
  };
}

export interface ZhihuReaction {
  statistics: {
    like_count: number;
    up_vote_count?: number;
    favorites?: number;
  };
  relation?: {
    faved?: boolean;
    liked?: boolean;
    vote?: 'UP' | 'DOWN' | 'NEUTRAL';
  };
}

export interface ZhihuAnswer {
  id: string | number;
  content: string;
  /** 原生结构化正文；是否返回取决于接口与渲染模式。 */
  structured_content?: ZhihuStructuredContent;
  excerpt: string;
  endorsements?: ZhihuEndorsement[];
  created_time: number;
  updated_time: number;
  comment_count: number;
  voteup_count?: number;
  reaction_count?: number;
  reaction?: ZhihuReaction;
  author: ZhihuAuthor;
  question: {
    id: string | number;
    title: string;
    type: 'question';
  };
  type: 'answer';
  url?: string;
  relationship?: {
    voting?: number;
    is_thanked?: boolean;
  };
}

export interface ZhihuArticle {
  id: string | number;
  title: string;
  content: string;
  excerpt: string;
  endorsements?: ZhihuEndorsement[];
  created: number;
  updated: number;
  comment_count: number;
  voteup_count?: number;
  author: ZhihuAuthor;
  type: 'article';
  url?: string;
  link_card_info?: Record<string, string>;
  relationship?: {
    voting?: number;
  };
}

export interface ZhihuPin {
  id: string | number;
  content: string;
  excerpt?: string;
  created: number;
  comment_count: number;
  like_count?: number;
  reaction_count?: number;
  reaction?: ZhihuReaction;
  virtuals?: {
    is_favorited?: boolean;
    is_liked?: boolean;
  };
  author: ZhihuAuthor;
  type: 'pin';
  url?: string;
  link_card_info?: Record<string, string>;
  relationship?: {
    voting?: number;
    is_liked?: boolean;
  };
  bottom_poll?: {
    voting?: ZhihuPinPoll;
    pk?: ZhihuPinPoll;
  };
}

export interface ZhihuPinPoll {
  id: string;
  title?: string;
  max_selections?: number;
  type?: string;
  begin_at?: number;
  end_at?: number;
  voting_count?: number;
  member_count?: number;
  is_voted?: boolean;
  is_reviewing?: boolean;
  options: ZhihuPinPollOption[];
}

export interface ZhihuPinPollOption {
  id: string;
  title: string;
  voting_count?: number;
  is_selected?: boolean;
}

/** Identifies the API namespace of a video ID before resolving playback. */
export type ZhihuVideoSourceKind = 'lens' | 'zvideo';

export interface ZhihuVideo {
  id: string | number;
  title: string;
  excerpt?: string;
  created?: number;
  comment_count?: number;
  voteup_count?: number;
  author?: ZhihuAuthor;
  type: 'zvideo' | 'video';
  url?: string;
  relationship?: {
    voting?: number;
  };
}

export type ZhihuMemberRelation =
  | ZhihuAnswer
  | ZhihuQuestion
  | ZhihuArticle
  | ZhihuPin
  | ZhihuVideo;

export interface ZhihuSearchHighlight {
  description?: string;
  title?: string;
}

export interface ZhihuColumnDetail {
  id: string;
  type: 'column';
  title: string;
  url: string;
  image_url: string;
  updated: number;
  column_type: string;
  accept_submission: boolean;
  comment_permission: string;
  intro?: string;
  excerpt?: string;
  extra?: string;
  followers?: number;
  items_count?: number;
  articles_count?: number;
  author: ZhihuAuthor;
  is_following?: boolean;
}

export interface ZhihuPaging {
  is_end: boolean;
  is_start?: boolean;
  next: string;
  previous?: string;
  totals?: number;
}

export interface ZhihuColumnItem {
  id: string | number;
  type?: 'answer' | 'article' | string;
  title?: string;
  question?: {
    id: string | number;
    title: string;
  };
  excerpt?: string;
  title_image?: string;
  thumbnail?: string;
  updated?: number;
  updated_time?: number;
  created?: number;
  created_time?: number;
  voteup_count?: number;
  comment_count?: number;
}

export interface ZhihuCollectionSummary {
  id: string | number;
  title: string;
  url?: string;
  description?: string;
  is_public?: boolean;
  type?: 'collection' | string;
  creator?: ZhihuAuthor;
  is_following?: boolean;
  follower_count?: number;
  answer_count?: number;
  item_count?: number;
  like_count?: number;
  view_count?: number;
  comment_count?: number;
  is_liking?: boolean;
  is_default?: boolean;
  created_time?: number;
  updated_time?: number;
}

export interface ZhihuCollectionContent {
  id: string | number;
  type: 'answer' | 'article' | 'pin' | 'question' | string;
  answer_type?: string;
  url?: string;
  title?: string;
  content?: string | ZhihuContentSegment[];
  excerpt?: string;
  author?: ZhihuAuthor;
  question?: ZhihuQuestion;
  thumbnail?: string;
  thumbnail_info?: {
    count?: number;
    type?: string;
    thumbnails?: Array<{ url?: string; width?: number; height?: number }>;
  };
  is_collapsed?: boolean;
  is_copyable?: boolean;
  is_visible?: boolean;
  is_normal?: boolean;
  is_mine?: boolean;
  comment_count?: number;
  voteup_count?: number;
  thanks_count?: number;
  like_count?: number;
  reaction_count?: number;
  image_count?: number;
  favlists_count?: number;
  created_time?: number;
  updated_time?: number;
  created?: number;
  updated?: number;
  comment_permission?: string;
  reshipment_settings?: string;
  suggest_edit?: {
    reason?: string;
    status?: boolean;
    tip?: string;
    title?: string;
    url?: string;
    unnormal_details?: {
      status?: string;
      description?: string;
      reason?: string;
      reason_id?: number;
      note?: string;
    };
  };
  attached_info?: string;
  relationship?: {
    is_author?: boolean;
    is_authorized?: boolean;
    is_nothelp?: boolean;
    is_thanked?: boolean;
    voting?: number;
  };
  attachment?: {
    type?: string;
    attachment_id?: string;
  };
  is_deleted?: boolean;
  virtuals?: {
    is_liked?: boolean;
    is_favorited?: boolean;
  };
}

export interface ZhihuContentSegment {
  type: string;
  content?: string;
  own_text?: string;
  fold_type?: string;
  text_link_type?: string;
  title?: string;
  data_content_id?: string;
  data_content_type?: string;
  data_draft_title?: string;
  data_draft_cover?: string;
  url?: string;
  duration?: number;
  height?: number;
  width?: number;
  is_custom_thumbnail?: boolean;
  is_long?: boolean;
  status?: string;
  thumbnail?: string;
  video_bo_id?: string;
  video_id?: string;
}

export interface ZhihuCollectionItem {
  content: ZhihuCollectionContent;
  created: string;
}

export interface ZhihuCollectionItemsResponse {
  data: ZhihuCollectionItem[];
  paging: ZhihuPaging;
}

export interface ZhihuCollectionDetailResponse {
  collection: ZhihuCollectionSummary;
  status: number;
  message: string;
}

export interface ZhihuCollectionStatusItem extends ZhihuCollectionSummary {
  is_favorited: boolean;
}

export interface ZhihuCollectionStatusResponse {
  data: ZhihuCollectionStatusItem[];
  paging?: ZhihuPaging;
}

export interface ZhihuCollectionMutationResponse {
  status?: number;
  message?: string;
  success?: boolean;
  id?: string | number;
  title?: string;
  description?: string;
  collection?: ZhihuCollectionSummary;
}

export interface ZhihuActionResponse {
  status?: number;
  message?: string;
  success?: boolean;
}

export interface ZhihuNotificationActor {
  link?: string;
  type?: string;
  url_token?: string;
  name?: string;
  avatar_url?: string;
}

export interface ZhihuNotificationTarget {
  id?: string | number;
  type?: string;
  text?: string;
  link?: string;
  title?: string;
  is_collapsed?: boolean;
  allow_reply?: boolean;
  collapsed?: boolean;
  can_collapse?: boolean;
  featured?: boolean;
  reviewing?: boolean;
  created_time?: number;
  allow_like?: boolean;
  allow_vote?: boolean;
  is_author?: boolean;
  can_recommend?: boolean;
  is_delete?: boolean;
  url?: string;
  content?: string;
  allow_delete?: boolean;
  reply_root_id?: number;
  voting?: boolean;
  resource_type?: string;
  author?: {
    member?: ZhihuAuthor;
    role?: string;
  };
  question?: {
    question_type?: string;
    title?: string;
    url?: string;
    created?: number;
    type?: string;
    id?: string | number;
    updated_time?: number;
  };
}

export interface ZhihuNotificationContent {
  verb?: string;
  text?: string;
  title?: string;
  sub_text?: string;
  actors?: ZhihuNotificationActor[];
  target?: ZhihuNotificationTarget;
  extend?: {
    text?: string;
    icon?: string;
  };
}

export interface ZhihuNotificationItem {
  id: string | number;
  type: string;
  create_time: number;
  attach_info?: string;
  merge_count?: number;
  is_read?: boolean;
  content?: ZhihuNotificationContent | string;
  actors?: ZhihuNotificationActor[];
  target?: ZhihuNotificationTarget;
}

export interface ZhihuNotificationResponse {
  data: ZhihuNotificationItem[];
  paging: ZhihuPaging;
}

export interface ZhihuSearchSuggestItem {
  query: string;
}

export interface ZhihuSearchSuggestResponse {
  suggest: ZhihuSearchSuggestItem[];
}

export interface ZhihuSearchResultObject {
  id: string | number;
  type: string;
  name?: string;
  title?: string;
  headline?: string;
  avatar_url?: string;
  url_token?: string;
  user_type?: string;
  gender?: number;
  is_org?: boolean;
  badge?: ZhihuBadge[];
  excerpt?: string;
  content?: string;
  endorsements?: ZhihuEndorsement[];
  url?: string;
  excerpt_title?: string;
  thumbnail_info?: {
    thumbnails?: Array<{ url?: string }>;
  };
  question?: {
    id?: string | number;
    title?: string;
    name?: string;
  };
  author?: ZhihuAuthor;
  relationship?: {
    voting?: number;
  };
  voteup_count?: number;
  comment_count?: number;
  follower_count?: number;
  answer_count?: number;
  is_following?: boolean;
}

export interface ZhihuSearchResultItem {
  type: 'search_result';
  highlight: ZhihuSearchHighlight;
  object: ZhihuSearchResultObject;
  index: number;
}

export interface ZhihuSearchResponse {
  paging: ZhihuPaging;
  data: ZhihuSearchResultItem[];
}

export interface ZhihuCreatorQuestionSearchResponse {
  data: ZhihuQuestion[];
  paging?: ZhihuPaging;
}

export interface ZhihuInvitationContent {
  title?: string;
  sub_title?: string;
  text?: string;
  target_link?: string;
}

export interface ZhihuInvitationQuestion extends ZhihuQuestion {
  follow_num?: number;
}

export interface ZhihuInvitationItem {
  content?: ZhihuInvitationContent;
  question?: ZhihuInvitationQuestion;
  target?: ZhihuInvitationQuestion;
  extra?: { data?: ZhihuInvitationQuestion };
  reaction?: {
    pv?: number;
    follow_num?: number;
    answer_num?: number;
  };
  target_source?: { sub_text?: string };
}

export interface ZhihuInvitationResponse {
  data: ZhihuInvitationItem[];
  paging?: ZhihuPaging;
}

export interface ZhihuTopicDetail extends ZhihuTopic {
  introduction?: string;
  questions_count?: number;
  best_answers_count?: number;
  followers_count?: number;
  is_following?: boolean;
  header_card?: string;
}

export interface ZhihuTopicFeedEnvelope {
  target: ZhihuTopicFeedTarget;
  id?: string | number;
  type?: string;
  verb?: string;
  created_time?: number;
}

export interface ZhihuTopicFeedTarget {
  id: string | number;
  type: 'answer' | 'article' | 'pin' | 'question' | string;
  title?: string;
  excerpt?: string;
  excerpt_title?: string;
  thumbnail?: string;
  topic_thumbnails?: string[];
  content_img?: string[];
  content?: Array<{ type?: string; content?: string; url?: string }>;
  endorsements?: ZhihuEndorsement[];
  question?: { id?: string | number; title?: string };
  author?: ZhihuAuthor;
  comment_count?: number;
  voteup_count?: number;
  relationship?: { voting?: number; is_author?: boolean };
}

export type ZhihuTopicFeedItem = ZhihuTopicFeedTarget | ZhihuTopicFeedEnvelope;

export interface ZhihuTopicFeedResponse {
  data: ZhihuTopicFeedItem[];
  paging: ZhihuPaging;
}

export interface ZhihuTopicStructureResponse {
  data: ZhihuTopic[];
}

export interface ZhihuBestAnswerer {
  member: ZhihuAuthor;
  answer_count: number;
  answer_votes: number;
}

export interface ZhihuBestAnswerersResponse {
  data: ZhihuBestAnswerer[];
}

/**
 * `/next-render` 的 structured_content 观测结构，独立于应用的 ZhihuDocument。
 *
 * 以下联合仅覆盖已提供样本中的段与标记。HTTP 边界仍接收 unknown，
 * 未观测到的 type 或未经验证的字段不能直接断言为这些类型。
 */
export interface ZhihuStructuredContent {
  /** 序列化的 JSON 字符串，解析、验证后才是 ZhihuStructuredContentPaging。 */
  paging: string;
  segments: ZhihuStructuredContentSegment[];
}

/** structured_content.paging 解码后的结构；与外层回答列表分页分别维护。 */
export interface ZhihuStructuredContentPaging {
  /** 以此字段判断是否需要续取；next 非空本身不足以证明存在下一页。 */
  is_end: boolean;
  /** 样本指向 /next-content-render，应按返回链接续取，不能重构为 /next-render。 */
  next: string;
  is_start: boolean;
  previous: string;
  /** 样本中全部为 0，即使已返回多个 segments；不能当作已返回段数。 */
  totals: number;
}

/** 所有 segment 的 id 都是字符串；paragraph 的 id 与其 pid 在样本中不同。 */
export interface ZhihuStructuredContentSegmentIdentity {
  id: string;
}

/** 文字与范围标记；marks 可为空，也可包含重叠范围。 */
export interface ZhihuStructuredContentTextPayload {
  text: string;
  marks: ZhihuStructuredContentMark[];
}

export interface ZhihuStructuredContentParagraphPayload
  extends ZhihuStructuredContentTextPayload {
  /** 段落源身份，不应以外层 segment.id 代替。 */
  pid: string;
}

export interface ZhihuStructuredContentHeadingPayload
  extends ZhihuStructuredContentTextPayload {
  /** 样本仅出现 2，不能据此认定其他标题级别不存在。 */
  level: number;
}

export interface ZhihuStructuredContentListItemPayload
  extends ZhihuStructuredContentTextPayload {
  /** 样本仅出现 1，缩进层级的完整取值范围尚未验证。 */
  indent_level: number;
}

export interface ZhihuStructuredContentListPayload {
  /** 已观测无序和有序列表；缩进项沿用所属列表的编号方式。 */
  type: 'unordered' | 'ordered';
  items: ZhihuStructuredContentListItemPayload[];
}

/** 正文 card 的显示字段；不透明业务元数据不参与正文解析。 */
export interface ZhihuStructuredContentCardPayload {
  title: string;
  url: string;
  cover: string;
}

export interface ZhihuStructuredContentImagePayload {
  /** 可为空字符串。 */
  description: string;
  height: number;
  /** 样本全部为 false，不据此排除 GIF。 */
  is_gif: boolean;
  /** normal、small 仅为已观测布局，完整服务器枚举未知。 */
  layout: 'normal' | 'small';
  original_token: string;
  original_urls: string[];
  /** normal 仅为已观测状态，完整服务器枚举未知。 */
  status: 'normal';
  token: string;
  urls: string[];
  width: number;
}

export interface ZhihuStructuredContentParagraphSegment
  extends ZhihuStructuredContentSegmentIdentity {
  type: 'paragraph';
  paragraph: ZhihuStructuredContentParagraphPayload;
}

export interface ZhihuStructuredContentHeadingSegment
  extends ZhihuStructuredContentSegmentIdentity {
  type: 'heading';
  heading: ZhihuStructuredContentHeadingPayload;
}

export interface ZhihuStructuredContentListSegment
  extends ZhihuStructuredContentSegmentIdentity {
  type: 'list_node';
  list_node: ZhihuStructuredContentListPayload;
}

export interface ZhihuStructuredContentImageSegment
  extends ZhihuStructuredContentSegmentIdentity {
  type: 'image';
  image: ZhihuStructuredContentImagePayload;
}

export interface ZhihuStructuredContentCardSegment
  extends ZhihuStructuredContentSegmentIdentity {
  type: 'card';
  card: ZhihuStructuredContentCardPayload;
}

/** 样本中的分隔线没有额外 payload。 */
export interface ZhihuStructuredContentHorizontalRuleSegment
  extends ZhihuStructuredContentSegmentIdentity {
  type: 'hr';
}

/** 未识别块只在具有明确正文文字时提供可见 fallback。 */
export interface ZhihuStructuredContentUnsupportedSegment
  extends ZhihuStructuredContentSegmentIdentity {
  type: 'unsupported';
  sourceType: string;
  fallbackText: string;
}

export type ZhihuStructuredContentSegment =
  | ZhihuStructuredContentParagraphSegment
  | ZhihuStructuredContentHeadingSegment
  | ZhihuStructuredContentListSegment
  | ZhihuStructuredContentImageSegment
  | ZhihuStructuredContentCardSegment
  | ZhihuStructuredContentHorizontalRuleSegment
  | ZhihuStructuredContentUnsupportedSegment;

/**
 * 标记作用于同一文字 payload.text 的半开范围 [start_index, end_index)。
 * 非 BMP 段落样本的完整范围确认采用 UTF-16 code unit。
 * 附加标记无效时保留原文；业务动作还须通过真实段落身份与源切片验证。
 * 范围不互斥，已观测到 bold 与 entity_word 重叠。
 */
export interface ZhihuStructuredContentMarkRange {
  start_index: number;
  end_index: number;
}

export interface ZhihuStructuredContentLinkPayload {
  href: string;
  /** member_mention 样本为空字符串，普通文字链接样本为图标名。 */
  icon_name: string;
  /** 仅为已观测链接类型，完整服务器枚举未知。 */
  link_type: 'member_mention' | 'text';
}

export interface ZhihuStructuredContentEntityWordPayload {
  /**
   * 不透明附加信息。样本字符串可 Base64 解码，但结果为非 UTF-8 二进制，
   * 协议未知；不能视为 JSON 文本。
   */
  attach_info_bytes: string;
  id: string;
  /** search 仅为已观测词条类型，完整服务器枚举未知。 */
  type: 'search';
  url: string;
  word: string;
}

export interface ZhihuStructuredContentFormulaPayload {
  /** 公式源码，部分包含 LaTeX 命令；不能以 text 中的 [公式] 占位符代替。 */
  content: string;
  height: number;
  /** 公式图片资源 URL；与 url 的来源页语义不同。 */
  img_url: string;
  /** 样本全部指向所属回答的网页地址，不是公式图片地址。 */
  url: string;
  width: number;
}

export interface ZhihuStructuredContentBoldMark
  extends ZhihuStructuredContentMarkRange {
  type: 'bold';
}

export interface ZhihuStructuredContentLinkMark
  extends ZhihuStructuredContentMarkRange {
  type: 'link';
  link: ZhihuStructuredContentLinkPayload;
}

export interface ZhihuStructuredContentEntityWordMark
  extends ZhihuStructuredContentMarkRange {
  type: 'entity_word';
  entity_word: ZhihuStructuredContentEntityWordPayload;
}

/** 样本中范围对应固定四字符 [公式]，应消费 formula payload 渲染。 */
export interface ZhihuStructuredContentFormulaMark
  extends ZhihuStructuredContentMarkRange {
  type: 'formula';
  formula: ZhihuStructuredContentFormulaPayload;
}

export interface ZhihuStructuredContentSegmentLikePayload {
  comment_count: number;
  count: number;
  is_like: boolean;
  is_span: boolean;
  my_comment_count: number;
  seg_ids: string[];
}

export interface ZhihuStructuredContentSegmentLikeMark
  extends ZhihuStructuredContentMarkRange {
  type: 'seg_like';
  seg_like: ZhihuStructuredContentSegmentLikePayload;
}

export type ZhihuStructuredContentMark =
  | ZhihuStructuredContentBoldMark
  | ZhihuStructuredContentLinkMark
  | ZhihuStructuredContentEntityWordMark
  | ZhihuStructuredContentFormulaMark
  | ZhihuStructuredContentSegmentLikeMark;
