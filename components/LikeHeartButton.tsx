import { Ionicons } from '@expo/vector-icons';
import { BouncyButton } from '@/components/BouncyButton';
import { useThemeColor } from '@/components/Themed';
import { useLikeAction } from '@/hooks/useLikeAction';
import { useLikeStore } from '@/store/useLikeStore';

export const LikeHeartButton = ({
  id,
  type,
  liked,
}: {
  id: string | number;
  type: 'answer' | 'article';
  liked?: boolean;
}) => {
  const storeLiked = useLikeStore(
    (state) => state.likedStatusMap[id.toString()],
  );
  const activeLiked = storeLiked ?? liked ?? false;
  const { toggleLike, isPending } = useLikeAction();
  const dangerColor = useThemeColor({}, 'danger');
  const secondaryColor = useThemeColor({}, 'textSecondary');

  return (
    <BouncyButton
      className="items-center justify-center ml-3 p-2 flex-row bg-transparent"
      style={{ borderRadius: 99 }}
      onPress={() => toggleLike(id, type, activeLiked)}
      disabled={isPending}
    >
      <Ionicons
        name={activeLiked ? 'heart' : 'heart-outline'}
        size={24}
        color={activeLiked ? dangerColor : secondaryColor}
      />
    </BouncyButton>
  );
};
