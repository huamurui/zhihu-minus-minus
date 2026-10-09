import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { getContentRelationship } from '@/api/zhihu/relationship';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, View } from '@/components/Themed';
import { VoterListModal } from '@/components/VoterListModal';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';

interface ContentRelationshipNoticeProps {
  contentType: 'answer' | 'pin';
  contentId: string;
  enabled?: boolean;
  voteCount?: number;
}

function isCurrentVotersAction(
  actionUrl: string | undefined,
  contentType: 'answer' | 'pin',
  contentId: string,
): boolean {
  if (!actionUrl) return false;
  try {
    let parsed = new URL(actionUrl);
    if (
      parsed.protocol === 'zhihu:' &&
      parsed.hostname === 'hybrid' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      (!parsed.pathname || parsed.pathname === '/')
    ) {
      const webUrl = parsed.searchParams.get('zh_url');
      if (!webUrl) return false;
      parsed = new URL(webUrl);
    }
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'www.zhihu.com' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      parsed.pathname === `/appview/${contentType}/${contentId}/voters`
    );
  } catch {
    return false;
  }
}

function SessionRelationshipNotice({
  contentType,
  contentId,
  enabled = true,
  voteCount,
  sessionVersion,
}: ContentRelationshipNoticeProps & { sessionVersion: number }) {
  const [votersVisible, setVotersVisible] = useState(false);
  const previousVoteCount = useRef(voteCount);
  const validContentId = /^\d+$/.test(contentId);
  const queryEnabled = enabled && validContentId;
  const query = useQuery({
    queryKey: ['content-relationship', contentType, contentId, sessionVersion],
    queryFn: async ({ signal }) => {
      if (getAuthSessionVersion() !== sessionVersion) return null;
      const relationship = await getContentRelationship(
        contentType === 'answer' ? 'answers' : 'pins',
        contentId,
        { signal },
      );
      return getAuthSessionVersion() === sessionVersion ? relationship : null;
    },
    enabled: queryEnabled,
    staleTime: 60_000,
    retry: false,
  });
  const hasVoteCount =
    typeof voteCount === 'number' &&
    Number.isFinite(voteCount) &&
    voteCount >= 0;
  const fallbackText = hasVoteCount
    ? `${voteCount} 人赞同了该${contentType === 'answer' ? '回答' : '想法'}`
    : '赞同信息';
  const relationship = query.isError ? null : query.data;
  const noticeText = relationship?.text || fallbackText;
  const canOpenVoters = relationship?.text
    ? relationship.type === 'reaction_endorse' &&
      isCurrentVotersAction(relationship.action_url, contentType, contentId)
    : hasVoteCount;
  const interactive = queryEnabled && canOpenVoters;
  useEffect(() => {
    if (!queryEnabled || previousVoteCount.current === voteCount) return;
    previousVoteCount.current = voteCount;
    void query.refetch();
  }, [queryEnabled, voteCount, query.refetch]);
  useEffect(() => {
    if (!interactive) setVotersVisible(false);
  }, [interactive]);

  if (!validContentId) return null;

  return (
    <View style={styles.container}>
      <BouncyButton
        disabled={!interactive}
        accessibilityRole={interactive ? 'button' : 'text'}
        accessibilityLabel={noticeText}
        accessibilityHint={interactive ? '查看赞同者' : undefined}
        onPress={() => {
          if (interactive && getAuthSessionVersion() === sessionVersion) {
            setVotersVisible(true);
          }
        }}
      >
        <Text
          type={interactive ? 'primary' : 'secondary'}
          style={styles.text}
          numberOfLines={1}
          ellipsizeMode="tail"
          accessibilityLabel={noticeText}
        >
          {noticeText}
        </Text>
      </BouncyButton>
      {interactive ? (
        <VoterListModal
          visible={votersVisible}
          onClose={() => setVotersVisible(false)}
          contentType={contentType}
          contentId={contentId}
          count={voteCount}
        />
      ) : null}
    </View>
  );
}

/** Personalized relationship hints remain scoped to the current content and login session. */
export function ContentRelationshipNotice(
  props: ContentRelationshipNoticeProps,
) {
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  return (
    <SessionRelationshipNotice
      key={`${props.contentType}:${props.contentId}:${sessionVersion}`}
      {...props}
      sessionVersion={sessionVersion}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
  },
});
