import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgUri } from 'react-native-svg';
import { useThemeColor } from '@/components/Themed';
import {
  isRichTextNativeAvailable,
  type RichContentRenderer,
  ZhihuContent,
  ZhihuNativeContent,
  type ZhihuNativeContentSelection,
  type ZhihuNativeSegmentAction,
  type ZhihuNativeTypographyOptions,
} from '@/features/rich-content';
import { richContentPrototypeCases } from '@/features/rich-content/dev/prototypeCases';

type DecorationKind = NonNullable<
  ZhihuNativeTypographyOptions['decorationKind']
>;
const rendererChoices: readonly { id: RichContentRenderer; title: string }[] = [
  { id: 'native-v2', title: 'tiqian-super-mini' },
  { id: 'webview', title: 'WebView' },
];
const lineChoices: readonly { id: DecorationKind; title: string }[] = [
  { id: 'solid', title: '实线' },
  { id: 'dashed', title: '虚线' },
  { id: 'dotted', title: '点线' },
  { id: 'wavy', title: '波浪' },
];

function Choice({
  title,
  selected,
  onPress,
  color,
  borderColor,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
  color: string;
  borderColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.choice,
        {
          borderColor: selected ? color : borderColor,
          backgroundColor: selected ? `${color}14` : undefined,
        },
      ]}
    >
      <Text
        style={{ fontSize: 12, fontWeight: selected ? '700' : '400', color }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function Toggle({
  title,
  value,
  onChange,
  color,
}: {
  title: string;
  value: boolean;
  onChange: (value: boolean) => void;
  color: string;
}) {
  return (
    <View style={styles.toggle}>
      <Text style={{ color, fontSize: 12 }}>{title}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

export default function RichContentPrototypeScreen() {
  const params = useLocalSearchParams<{ caseId?: string | string[] }>();
  const requestedCaseId = Array.isArray(params.caseId)
    ? params.caseId[0]
    : params.caseId;
  const requestedCase = richContentPrototypeCases.find(
    (item) => item.id === requestedCaseId,
  )?.id;
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  const backgroundColor = useThemeColor({}, 'background');
  const surfaceColor = useThemeColor({}, 'backgroundSecondary');
  const textColor = useThemeColor({}, 'text');
  const secondaryColor = useThemeColor({}, 'textSecondary');
  const primaryColor = useThemeColor({}, 'primary');
  const borderColor = useThemeColor({}, 'border');
  const [caseId, setCaseId] = useState(() => requestedCase ?? 'selection');
  const [renderer, setRenderer] = useState<RichContentRenderer>('native-v2');
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [fontSizeScale, setFontSizeScale] = useState(1);
  const [lineHeightScale, setLineHeightScale] = useState(1.6);
  const [justify, setJustify] = useState(false);
  const [integerMeasure, setIntegerMeasure] = useState(false);
  const [nativeAutoSize, setNativeAutoSize] = useState(false);
  const [autoSpacing, setAutoSpacing] = useState(true);
  const [trimPunctuation, setTrimPunctuation] = useState(true);
  const [decorations, setDecorations] = useState(true);
  const [decorationKind, setDecorationKind] =
    useState<DecorationKind>('dashed');
  const [selection, setSelection] =
    useState<ZhihuNativeContentSelection | null>(null);
  const [lastAction, setLastAction] = useState('尚未操作');
  const [segmentAction, setSegmentAction] =
    useState<ZhihuNativeSegmentAction | null>(null);
  const [likedNodes, setLikedNodes] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMenu, setImageMenu] = useState<string | null>(null);
  const [linkPreview, setLinkPreview] = useState<string | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const viewKey = `${caseId}:${renderer}`;
  const activeViewKey = useRef(viewKey);
  activeViewKey.current = viewKey;
  const currentCase =
    richContentPrototypeCases.find((item) => item.id === caseId) ||
    richContentPrototypeCases[0];
  const nativeAvailable = isRichTextNativeAvailable();
  const resetInteractions = useCallback(() => {
    setSelection(null);
    setSegmentAction(null);
    setImagePreview(null);
    setImageMenu(null);
    setLinkPreview(null);
    setLastAction('尚未操作');
  }, []);
  useEffect(() => {
    if (!requestedCase) return;
    setCaseId(requestedCase);
    resetInteractions();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [requestedCase, resetInteractions]);
  const selectCase = useCallback(
    (nextCaseId: string) => {
      activeViewKey.current = `${nextCaseId}:${renderer}`;
      setCaseId(nextCaseId);
      resetInteractions();
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    },
    [renderer, resetInteractions],
  );
  const selectRenderer = useCallback(
    (nextRenderer: RichContentRenderer) => {
      activeViewKey.current = `${caseId}:${nextRenderer}`;
      setRenderer(nextRenderer);
      resetInteractions();
    },
    [caseId, resetInteractions],
  );
  const handleSelection = useCallback(
    (event: ZhihuNativeContentSelection) => {
      if (activeViewKey.current !== viewKey) return;
      setSelection(event.end > event.start ? event : null);
    },
    [viewKey],
  );
  const handleSegment = useCallback(
    (event: ZhihuNativeSegmentAction) => {
      if (activeViewKey.current !== viewKey) return;
      setSegmentAction(event);
      setLastAction(
        `知识点：${event.paragraphId || event.nodeId} [${event.start}, ${event.end})`,
      );
    },
    [viewKey],
  );
  const handleImage = useCallback(
    (url: string) => {
      if (activeViewKey.current !== viewKey) return;
      setImagePreview(url);
      setLastAction('打开图片预览');
    },
    [viewKey],
  );
  const handleImageLongPress = useCallback(
    (url: string) => {
      if (activeViewKey.current !== viewKey) return;
      setImageMenu(url);
      setLastAction('打开图片菜单');
    },
    [viewKey],
  );
  const handleLink = useCallback(
    (url: string) => {
      if (activeViewKey.current !== viewKey) return;
      setLinkPreview(url);
      setLastAction('打开合成链接预览');
    },
    [viewKey],
  );
  const selectionText = selection?.mapping?.text || '';
  const selectedSource = selection?.mapping
    ? `${selection.mapping.start.paragraphId || selection.mapping.start.nodeId}:${selection.mapping.start.offset} → ${selection.mapping.end.paragraphId || selection.mapping.end.nodeId}:${selection.mapping.end.offset}`
    : '';
  const segment = segmentAction?.segment;
  const baseLikes =
    segment?.type === 'segment'
      ? segment.segInfo?.like_count || segment.masterSegInfo?.like_count || 0
      : segment?.highlight?.reaction?.likeCount || 0;
  const liked = segmentAction ? likedNodes.has(segmentAction.nodeId) : false;
  const modalOpen = Boolean(
    segmentAction || imagePreview || imageMenu || linkPreview,
  );
  const closeModal = () => {
    setSegmentAction(null);
    setImagePreview(null);
    setImageMenu(null);
    setLinkPreview(null);
  };

  return (
    <View style={[styles.screen, { backgroundColor }]}>
      <Stack.Screen options={{ title: 'tiqian-super-mini 原型' }} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: insets.bottom + 26 }}
      >
        <View style={styles.header}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.choices}
          >
            {richContentPrototypeCases.map((item) => (
              <Choice
                key={item.id}
                title={item.title}
                selected={caseId === item.id}
                onPress={() => selectCase(item.id)}
                color={primaryColor}
                borderColor={borderColor}
              />
            ))}
          </ScrollView>
          <View style={styles.rendererRow}>
            <View style={styles.choices}>
              {rendererChoices.map((item) => (
                <Choice
                  key={item.id}
                  title={item.title}
                  selected={renderer === item.id}
                  onPress={() => selectRenderer(item.id)}
                  color={primaryColor}
                  borderColor={borderColor}
                />
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setControlsExpanded((value) => !value)}
            >
              <Text style={{ fontSize: 12, color: primaryColor }}>
                {controlsExpanded ? '收起' : '调节'}
              </Text>
            </Pressable>
          </View>
          {controlsExpanded ? (
            <View
              style={[
                styles.controls,
                { backgroundColor: surfaceColor, borderColor },
              ]}
            >
              <View style={styles.controlRow}>
                <Text style={[styles.label, { color: secondaryColor }]}>
                  字号
                </Text>
                {[0.9, 1, 1.2, 1.4].map((value) => (
                  <Choice
                    key={value}
                    title={`${Math.round(17 * value)}`}
                    selected={fontSizeScale === value}
                    onPress={() => setFontSizeScale(value)}
                    color={primaryColor}
                    borderColor={borderColor}
                  />
                ))}
              </View>
              <View style={styles.controlRow}>
                <Text style={[styles.label, { color: secondaryColor }]}>
                  行高
                </Text>
                {[1.35, 1.6, 1.85, 2.1].map((value) => (
                  <Choice
                    key={value}
                    title={`${value}`}
                    selected={lineHeightScale === value}
                    onPress={() => setLineHeightScale(value)}
                    color={primaryColor}
                    borderColor={borderColor}
                  />
                ))}
              </View>
              <View style={styles.toggles}>
                <Toggle
                  title="双齐"
                  value={justify}
                  onChange={setJustify}
                  color={textColor}
                />
                <Toggle
                  title="整字版心"
                  value={integerMeasure}
                  onChange={setIntegerMeasure}
                  color={textColor}
                />
              </View>
              {renderer === 'native-v2' ? (
                <View style={styles.toggles}>
                  <Toggle
                    title="Fabric 原生尺寸（实验）"
                    value={nativeAutoSize}
                    onChange={setNativeAutoSize}
                    color={textColor}
                  />
                </View>
              ) : null}
              <View style={styles.toggles}>
                <Toggle
                  title="装饰线"
                  value={decorations}
                  onChange={setDecorations}
                  color={textColor}
                />
                <View style={styles.choices}>
                  {lineChoices.map((item) => (
                    <Choice
                      key={item.id}
                      title={item.title}
                      selected={decorationKind === item.id}
                      onPress={() => setDecorationKind(item.id)}
                      color={primaryColor}
                      borderColor={borderColor}
                    />
                  ))}
                </View>
              </View>
              {renderer === 'webview' ? (
                <View style={styles.toggles}>
                  <Toggle
                    title="中西间距"
                    value={autoSpacing}
                    onChange={setAutoSpacing}
                    color={textColor}
                  />
                  <Toggle
                    title="标点压缩"
                    value={trimPunctuation}
                    onChange={setTrimPunctuation}
                    color={textColor}
                  />
                </View>
              ) : null}
              <Text style={[styles.hint, { color: secondaryColor }]}>
                {renderer === 'native-v2'
                  ? '原生使用系统断行与双齐；整字版心只调整文字宽度。'
                  : renderer === 'webview'
                    ? '中西间距和标点压缩取决于设备 WebView 对相应 CSS 的支持。'
                    : '此后端用于视觉对照；自定义装饰与源选区事件在 tiqian-super-mini 中演示。'}
              </Text>
            </View>
          ) : null}
          <Text style={[styles.hint, { color: secondaryColor }]}>
            {currentCase.hint}
          </Text>
          {renderer === 'native-v2' && !nativeAvailable ? (
            <Text style={[styles.hint, { color: primaryColor }]}>
              当前
              {Platform.OS === 'android' || Platform.OS === 'ios'
                ? '开发构建缺少原生文字模块'
                : '平台暂不支持原生文字模块'}
              ，正文使用 WebView fallback
              与其图片、链接交互；本地选区和知识点菜单在 tiqian-super-mini
              中演示。
            </Text>
          ) : null}
        </View>
        <View style={styles.body}>
          {renderer === 'native-v2' ? (
            <ZhihuNativeContent
              key={`${caseId}:v2:${nativeAutoSize}`}
              content={currentCase.html}
              objectId={`prototype-${caseId}`}
              type="article"
              segmentInfos={currentCase.segmentInfos}
              variant={currentCase.variant}
              selectable
              nativeAutoSize={nativeAutoSize}
              fontSizeScale={fontSizeScale}
              lineHeightScale={lineHeightScale}
              options={{ justify, integerMeasure, decorations, decorationKind }}
              onSelectionChange={handleSelection}
              onSegmentPress={handleSegment}
              onImagePress={handleImage}
              onImageLongPress={handleImageLongPress}
              onLinkPress={handleLink}
              renderFallback={() => (
                <ZhihuContent
                  content={currentCase.html}
                  objectId={`prototype-${caseId}`}
                  type="article"
                  renderer="webview"
                  selectable
                  variant={currentCase.variant}
                  fontSizeScale={fontSizeScale}
                  lineHeightScale={lineHeightScale}
                  typographyOptions={{ justify, integerMeasure }}
                />
              )}
            />
          ) : (
            <ZhihuContent
              key={`${caseId}:${renderer}`}
              content={currentCase.html}
              objectId={`prototype-${caseId}`}
              type="article"
              renderer={renderer}
              selectable
              variant={currentCase.variant}
              fontSizeScale={fontSizeScale}
              lineHeightScale={lineHeightScale}
              typographyOptions={{
                justify,
                integerMeasure,
                autoSpacing,
                trimPunctuation,
                lineBreak: 'strict',
              }}
            />
          )}
        </View>
        <View
          style={[
            styles.status,
            { backgroundColor: surfaceColor, borderColor },
          ]}
        >
          <Text style={[styles.statusTitle, { color: textColor }]}>
            选区与最近操作
          </Text>
          <Text style={[styles.hint, { color: secondaryColor }]}>
            {selection
              ? `UTF-16 [${selection.start}, ${selection.end}) · ${selectedSource}`
              : '长按 tiqian-super-mini 正文即可显示选区；同一文本流支持跨段选择。'}
          </Text>
          {selectionText ? (
            <Text
              selectable
              numberOfLines={5}
              style={{
                color: textColor,
                fontSize: 13,
                lineHeight: 20,
                marginTop: 6,
              }}
            >
              {selectionText}
            </Text>
          ) : null}
          {selectionText ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void Clipboard.setStringAsync(selectionText);
                setLastAction('已复制选区（附件使用替代文本）');
              }}
              style={styles.copyButton}
            >
              <Text
                style={{ color: primaryColor, fontSize: 13, fontWeight: '600' }}
              >
                复制选区
              </Text>
            </Pressable>
          ) : null}
          <Text style={[styles.hint, { color: secondaryColor }]}>
            {lastAction}
          </Text>
        </View>
      </ScrollView>
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalPanel, { backgroundColor: surfaceColor }]}>
            {segmentAction ? (
              <>
                <Text style={[styles.statusTitle, { color: textColor }]}>
                  知识点
                </Text>
                <Text
                  selectable
                  style={[styles.modalText, { color: textColor }]}
                >
                  {segmentAction.text}
                </Text>
                <Text style={[styles.hint, { color: secondaryColor }]}>
                  {segmentAction.paragraphId || segmentAction.nodeId} · [
                  {segmentAction.start}, {segmentAction.end})
                </Text>
                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => {
                      setLikedNodes((previous) => {
                        const next = new Set(previous);
                        if (next.has(segmentAction.nodeId))
                          next.delete(segmentAction.nodeId);
                        else next.add(segmentAction.nodeId);
                        return next;
                      });
                      setLastAction(liked ? '本地取消赞同' : '本地赞同');
                    }}
                  >
                    <Text style={{ color: primaryColor }}>
                      {liked ? '已赞同' : '赞同'} ·{' '}
                      {baseLikes + (liked ? 1 : 0)}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void Clipboard.setStringAsync(segmentAction.text);
                      setLastAction('已复制知识点');
                    }}
                  >
                    <Text style={{ color: primaryColor }}>复制</Text>
                  </Pressable>
                </View>
                <Text style={[styles.hint, { color: secondaryColor }]}>
                  本地演示，不提交知乎互动。
                </Text>
              </>
            ) : null}
            {imagePreview ? (
              <>
                <Text style={[styles.statusTitle, { color: textColor }]}>
                  图片预览
                </Text>
                {/svg/i.test(imagePreview) ? (
                  <SvgUri
                    uri={imagePreview}
                    width={dimensions.width - 80}
                    height={220}
                  />
                ) : (
                  <Image
                    source={{ uri: imagePreview }}
                    style={{ width: dimensions.width - 80, height: 220 }}
                    resizeMode="contain"
                  />
                )}
              </>
            ) : null}
            {imageMenu ? (
              <>
                <Text style={[styles.statusTitle, { color: textColor }]}>
                  图片操作
                </Text>
                <Pressable
                  onPress={() => {
                    setImageMenu(null);
                    setImagePreview(imageMenu);
                  }}
                >
                  <Text style={{ color: primaryColor }}>查看图片</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void Clipboard.setStringAsync('合成图片示例');
                    setLastAction('已复制图片说明');
                  }}
                >
                  <Text style={{ color: primaryColor }}>复制图片说明</Text>
                </Pressable>
              </>
            ) : null}
            {linkPreview ? (
              <>
                <Text style={[styles.statusTitle, { color: textColor }]}>
                  链接预览
                </Text>
                <Text
                  selectable
                  style={[styles.modalText, { color: textColor }]}
                >
                  {linkPreview}
                </Text>
                <Text style={[styles.hint, { color: secondaryColor }]}>
                  合成示例只展示本地链接交互；视频示例没有播放资源。
                </Text>
              </>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={closeModal}
              style={styles.closeButton}
            >
              <Text style={{ color: primaryColor, fontWeight: '600' }}>
                返回正文
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12 },
  choices: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  choice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rendererRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 9,
    gap: 6,
  },
  controls: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    gap: 6,
  },
  controlRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  label: { width: 32, fontSize: 12 },
  toggle: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  toggles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  hint: { fontSize: 11, lineHeight: 17, marginTop: 7 },
  body: { paddingHorizontal: 16, paddingTop: 14 },
  status: {
    margin: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  statusTitle: { fontWeight: '700', fontSize: 14 },
  copyButton: { paddingVertical: 10 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000055',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalPanel: { width: '100%', borderRadius: 16, padding: 16, gap: 12 },
  modalText: { fontSize: 16, lineHeight: 25 },
  modalActions: { flexDirection: 'row', gap: 30, paddingVertical: 8 },
  closeButton: { paddingTop: 14, alignSelf: 'flex-end' },
});
