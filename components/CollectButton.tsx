import { Ionicons } from '@expo/vector-icons';
import { BouncyButton } from '@/components/BouncyButton';
import { useThemeColor } from '@/components/Themed';
import { useCollectionAction } from '@/hooks/useCollectionAction';
import { useCollectionStore } from '@/store/useCollectionStore';

export const CollectButton = ({
  id,
  type,
  collected,
}: {
  id: string | number;
  type: 'answer' | 'article';
  collected?: boolean;
}) => {
  const storeCollected = useCollectionStore(
    (state) => state.collectedStatusMap[id.toString()],
  );
  const activeCollected = storeCollected ?? collected ?? false;
  const { toggleCollect, isPending } = useCollectionAction();
  const warningColor = useThemeColor({}, 'warning');
  const secondaryColor = useThemeColor({}, 'textSecondary');

  return (
    <BouncyButton
      className="items-center justify-center ml-3 p-2 flex-row bg-transparent"
      style={{ borderRadius: 99 }}
      onPress={() => toggleCollect(id, type, activeCollected)}
      disabled={isPending}
    >
      <Ionicons
        name={activeCollected ? 'star' : 'star-outline'}
        size={24}
        color={activeCollected ? warningColor : secondaryColor}
      />
    </BouncyButton>
  );
};
