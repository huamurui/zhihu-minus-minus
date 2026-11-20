import Ionicons from '@expo/vector-icons/Ionicons';
import { CommentBubbleIcon } from './CommentBubbleIcon';
import { VoteTriangle } from './VoteTriangle';

export type ActionIconName =
  | keyof typeof Ionicons.glyphMap
  | 'comment-bubble'
  | 'vote-up'
  | 'vote-up-active';

/** Shared named icons for settings, notifications and action menus. */
export function ActionIcon({
  name,
  size,
  color,
}: {
  name: ActionIconName;
  size: number;
  color: string;
}) {
  if (name === 'comment-bubble')
    return <CommentBubbleIcon size={size} color={color} />;
  if (name === 'vote-up' || name === 'vote-up-active') {
    return (
      <VoteTriangle
        size={size}
        direction="up"
        color={color}
        active={name === 'vote-up-active'}
      />
    );
  }
  return <Ionicons name={name} size={size} color={color} />;
}
