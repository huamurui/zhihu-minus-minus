import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import React from 'react';
import ts from 'typescript';

// Exercise the actual footer expression without mounting the entire home pager
// and its unrelated native screens, gestures, storage, and query subscriptions.
const source = ts.createSourceFile(
  'index.tsx',
  readFileSync(path.join(__dirname, '../src/app/(tabs)/index.tsx'), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let footer;
function visit(node) {
  if (
    ts.isJsxAttribute(node) &&
    node.name.getText(source) === 'ListFooterComponent' &&
    node.initializer &&
    ts.isJsxExpression(node.initializer)
  ) {
    footer = node.initializer.expression;
  }
  ts.forEachChild(node, visit);
}
visit(source);
if (!footer) throw new Error('Feed footer was not found');
const { outputText } = ts.transpileModule(
  `const result = (${footer.getText(source)}); result;`,
  { compilerOptions: { jsx: ts.JsxEmit.React } },
);

function renderFooter(overrides = {}) {
  return runInNewContext(outputText, {
    React,
    ActivityIndicator: 'ActivityIndicator',
    ThemedLoadingIndicator: 'ThemedLoadingIndicator',
    View: 'View',
    QueryErrorView: 'QueryErrorView',
    BouncyButton: 'BouncyButton',
    Text: 'Text',
    styles: { footerContainer: {}, footerText: {}, footerActionText: {} },
    tintColor: '#0084ff',
    indicatorTrackColor: '#e0e0e0',
    feedError: null,
    isPendingIntent: false,
    cancelPendingIntent: jest.fn(),
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isError: false,
    filterEnabled: true,
    localDedupEnabled: false,
    isRefreshing: false,
    isRefetching: false,
    isLoading: false,
    flattenedData: [],
    MIN_RENDERABLE_ITEMS: 8,
    hasNextPage: false,
    autoFetchExhausted: false,
    fetchNextPage: jest.fn(),
    ...overrides,
  });
}

test.each([
  { filterEnabled: true, localDedupEnabled: false },
  { filterEnabled: false, localDedupEnabled: true },
])(
  'a failed initial feed does not claim filtering exhausted the feed: %j',
  (settings) => {
    expect(renderFooter({ ...settings, isError: true })).toBeNull();
    expect(renderFooter(settings).props.children).toBe(
      '过滤后内容偏少，已无更多可加载',
    );
  },
);

test('a pagination failure retains its retry action instead of a filtering message', () => {
  const fetchNextPage = jest.fn();
  const footer = renderFooter({
    isError: true,
    isFetchNextPageError: true,
    fetchNextPage,
  });
  expect(footer.type).toBe('QueryErrorView');
  expect(footer.props.message).toBe('更多内容加载失败');
  footer.props.onRetry();
  expect(fetchNextPage).toHaveBeenCalledTimes(1);
});

test('footer renders centered loading indicator without prompt text while fetching next page', () => {
  const footer = renderFooter({
    isFetchingNextPage: true,
    flattenedData: ['item-1'],
  });
  expect(footer.props.children.type).toBe('ThemedLoadingIndicator');
});

test('footer renders centered loading indicator without prompt text when pagination intent is blocked', () => {
  const footer = renderFooter({
    isPendingIntent: true,
    flattenedData: ['item-1'],
  });
  expect(footer.props.children.type).toBe('ThemedLoadingIndicator');
});

test('footer renders "继续上滑加载" when there is a next page and query is idle', () => {
  const footer = renderFooter({
    hasNextPage: true,
    flattenedData: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  });
  expect(footer.props.children.props.children).toBe('继续上滑加载');
});

test('footer renders "暂时没有更多内容" when server has reached the end', () => {
  const footer = renderFooter({
    hasNextPage: false,
    flattenedData: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  });
  expect(footer.props.children.props.children).toBe('暂时没有更多内容');
});
