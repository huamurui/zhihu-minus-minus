import { Stack } from 'expo-router';
import { ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { GlassNavigationButton } from '@/components/navigation/GlassNavigationButton';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useThemeColor, View } from '@/components/Themed';
import { TitleTransitionTarget } from '@/features/adaptive-layout/TitleTransition';
import type { ContentDetailPreview } from '@/utils/contentDetailPreview';

/** Show known card metadata while the complete detail is requested. */
export function ContentDetailLoadingPreview({
  type,
  preview,
  onBack,
  onOpenAuthor,
}: {
  type: 'article' | 'pin';
  preview: ContentDetailPreview;
  onBack: () => void;
  onOpenAuthor: (token: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const primaryColor = useThemeColor({}, 'primary');
  const textColor = useThemeColor({}, 'text');
  const backgroundColor = useThemeColor({}, 'backgroundSecondary');
  const author = preview.author;
  const authorToken = author?.urlToken || author?.id;

  return (
    <View
      type="default"
      className="flex-1"
      style={type === 'article' ? { backgroundColor } : undefined}
    >
      <Stack.Screen
        options={
          type === 'article'
            ? { headerShown: false, title: '正文' }
            : { headerTitle: '想法详情', headerShadowVisible: false }
        }
      />
      {type === 'article' ? (
        <View
          className="absolute left-0 right-0 z-50 px-2.5 justify-center"
          style={{ paddingTop: insets.top, height: 56 + insets.top }}
          pointerEvents="box-none"
        >
          <GlassNavigationButton
            icon="back"
            accessibilityLabel="返回"
            onPress={onBack}
            size={40}
            color={textColor}
          />
        </View>
      ) : null}
      <ScrollView
        testID="content-detail-preview-scroll"
        style={{ flex: 1 }}
        contentContainerStyle={
          type === 'article' ? { paddingTop: insets.top + 60 } : undefined
        }
      >
        <View className={type === 'article' ? 'p-5 pt-[10px]' : 'p-5'}>
          {type === 'article' && preview.title ? (
            <TitleTransitionTarget id={preview.id}>
              <Text
                className="font-bold mb-5"
                style={{ fontSize: 22, lineHeight: 32 }}
              >
                {preview.title}
              </Text>
            </TitleTransitionTarget>
          ) : null}
          {author ? (
            <View
              className={`flex-row items-center bg-transparent ${type === 'article' ? 'mt-2' : ''}`}
            >
              <BouncyButton
                disabled={!authorToken}
                onPress={() => {
                  if (authorToken) onOpenAuthor(authorToken);
                }}
                className="flex-row items-center flex-1 bg-transparent"
              >
                <StableAvatar
                  uri={author.avatarUrl}
                  className="w-11 h-11 rounded-full"
                />
                <View className="ml-3 flex-1 bg-transparent">
                  <Text className="text-base font-bold">{author.name}</Text>
                  {author.headline ? (
                    <Text
                      type="secondary"
                      className="text-[13px] mt-0.5"
                      numberOfLines={1}
                    >
                      {author.headline}
                    </Text>
                  ) : null}
                </View>
              </BouncyButton>
              <View className="bg-transparent" style={{ width: 64 }} />
            </View>
          ) : null}
        </View>
        <ActivityIndicator
          size="large"
          color={primaryColor}
          style={{ marginTop: 24 }}
        />
      </ScrollView>
    </View>
  );
}
