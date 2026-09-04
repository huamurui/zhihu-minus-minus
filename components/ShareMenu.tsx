import { Share } from 'react-native';
import Colors from '@/constants/Colors';
import { useCollectionAction } from '@/hooks/useCollectionAction';
import { useCollectionStore } from '@/store/useCollectionStore';
import { copyToClipboard } from '@/utils/clipboard';
import { showToast } from '@/utils/toast';
import { ActionSheet } from './overlays/ActionSheet';

export type ShareContentType =
  | 'answer'
  | 'question'
  | 'pin'
  | 'article'
  | 'video';

interface ShareData {
  id: string | number;
  title?: string;
  author?: string;
  authorHeadline?: string;
  content?: string;
  url?: string;
  excerpt?: string;
}

interface ShareMenuProps {
  visible: boolean;
  onClose: () => void;
  type: ShareContentType;
  data: ShareData | null;
}

export function ShareMenu({ visible, onClose, type, data }: ShareMenuProps) {
  const isCollected = useCollectionStore((state) =>
    data ? !!state.collectedStatusMap[data.id.toString()] : false,
  );
  const { toggleCollect } = useCollectionAction();

  if (!data) return null;

  const getShareLink = () => {
    if (data.url) return data.url;
    switch (type) {
      case 'answer':
        // Note: For answers, we might need a questionId too.
        // If not provided, we just use the answer ID.
        return `https://www.zhihu.com/answer/${data.id}`;
      case 'question':
        return `https://www.zhihu.com/question/${data.id}`;
      case 'pin':
        return `https://www.zhihu.com/pin/${data.id}`;
      case 'article':
        return `https://zhuanlan.zhihu.com/p/${data.id}`;
      case 'video':
        return `https://www.zhihu.com/zvideo/${data.id}`;
      default:
        return '';
    }
  };

  const onNativeShare = async () => {
    try {
      const link = getShareLink();
      await Share.share({
        message: link,
        url: link, // iOS only
        title: data.title || '知乎分享',
      });
    } catch (_error) {
      showToast('分享失败');
    }
  };

  const onCopyLink = async () => {
    const link = getShareLink();
    const success = await copyToClipboard(link);
    if (success) {
      showToast('链接已复制');
    }
  };

  const onCopyMarkdown = async () => {
    const link = getShareLink();
    const title = data.title || '';
    const author = data.author || '知乎用户';
    const headline = data.authorHeadline ? `（${data.authorHeadline}）` : '';

    let text = '';
    switch (type) {
      case 'answer':
        text = `### ${title}\n**${author}**${headline} 的回答\n\n${link}`;
        break;
      case 'question':
        text = `### ${title}\n\n${link}`;
        break;
      case 'pin':
        text = `**${author}**${headline} 的想法\n\n${link}`;
        break;
      case 'article':
        text = `### ${title}\n**${author}**${headline} 的文章\n\n${link}`;
        break;
      case 'video':
        text = `### ${title}\n**${author}**${headline} 的视频\n\n${link}`;
        break;
    }

    const success = await copyToClipboard(text);
    if (success) {
      showToast('Markdown 已复制');
    }
  };

  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title="分享与更多操作"
      options={[
        {
          key: 'system-share',
          icon: 'share-outline',
          label: '系统分享',
          onPress: onNativeShare,
        },
        ...(type === 'answer' || type === 'article'
          ? [
              {
                key: 'collection',
                icon: isCollected
                  ? ('star' as const)
                  : ('star-outline' as const),
                label: isCollected ? '取消收藏' : '移至收藏',
                color: isCollected ? Colors.light.warningAccent : undefined,
                onPress: () => toggleCollect(data.id, type, isCollected),
              },
            ]
          : []),
        {
          key: 'copy-link',
          icon: 'link-outline',
          label: '仅复制链接',
          onPress: onCopyLink,
        },
        {
          key: 'copy-markdown',
          icon: 'logo-markdown',
          label: '复制链接与信息',
          onPress: onCopyMarkdown,
        },
      ]}
    />
  );
}
