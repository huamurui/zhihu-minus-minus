import { createSegmentReaction } from '../../../api/zhihu/answer';
import type { TextSelectionInfo } from '../bridge';
import { createSelectionReactionOptions } from '../selectionReaction';
import type { RichContentObjectType } from '../types';

jest.mock('../../../api/zhihu/answer', () => ({
  createSegmentReaction: jest.fn(),
}));

const selectionA: TextSelectionInfo = {
  text: '已提交的选区',
  startParagraphId: 'p-one',
  endParagraphId: 'p-two',
  startOffset: 2,
  endOffset: 5,
};
const selectionB: TextSelectionInfo = {
  ...selectionA,
  text: '请求期间的新选区',
  startOffset: 9,
};

function createContext() {
  let source: { objectId: string; type: RichContentObjectType } = {
    objectId: '42',
    type: 'answer',
  };
  let selection: TextSelectionInfo | null = selectionA;
  const clearSelection = jest.fn(() => {
    selection = null;
  });
  const refresh = jest.fn();
  const notifySuccess = jest.fn();
  const notifyError = jest.fn();
  return {
    options: createSelectionReactionOptions({
      getSource: () => source,
      getSelection: () => selection,
      clearSelection,
      refresh,
      notifySuccess,
      notifyError,
    }),
    snapshot: { source, selection: selectionA },
    replaceSource: () => {
      source = { ...source, objectId: '43' };
    },
    selectAgain: () => {
      selection = selectionB;
    },
    getSelection: () => selection,
    clearSelection,
    refresh,
    notifySuccess,
    notifyError,
  };
}

beforeEach(() => jest.clearAllMocks());

it('submits the original selection and retains a newer selection when the request finishes', async () => {
  const context = createContext();
  let complete: (() => void) | undefined;
  jest.mocked(createSegmentReaction).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = () => resolve({ success: true });
      }),
  );
  const pending = context.options.mutationFn(context.snapshot);
  context.selectAgain();
  if (!complete) throw new Error('Expected a pending reaction');
  complete();
  context.options.onSuccess(await pending, context.snapshot);
  expect(createSegmentReaction).toHaveBeenCalledWith(
    '42',
    selectionA.text,
    'p-one',
    2,
    'p-two',
    5,
  );
  expect(context.getSelection()).toBe(selectionB);
  expect(context.clearSelection).not.toHaveBeenCalled();
  expect(context.refresh).toHaveBeenCalledTimes(1);
  expect(context.notifySuccess).toHaveBeenCalledTimes(1);
});

it('ignores completion after the content source changes', () => {
  const context = createContext();
  context.replaceSource();
  context.options.onSuccess({ success: true }, context.snapshot);
  context.options.onError(new Error('rejected'), context.snapshot);
  expect(context.clearSelection).not.toHaveBeenCalled();
  expect(context.refresh).not.toHaveBeenCalled();
  expect(context.notifySuccess).not.toHaveBeenCalled();
  expect(context.notifyError).not.toHaveBeenCalled();
});

it('clears the submitted selection when it is still current', () => {
  const context = createContext();
  context.options.onSuccess({ success: true }, context.snapshot);
  expect(context.getSelection()).toBeNull();
  expect(context.clearSelection).toHaveBeenCalledTimes(1);
});

it.each([
  { objectId: 'prototype-selection', type: 'answer' as const },
  { objectId: '42', type: 'article' as const },
])('rejects a source that cannot use the answer endpoint', async (source) => {
  const context = createContext();
  await expect(
    context.options.mutationFn({ source, selection: selectionA }),
  ).rejects.toThrow();
  expect(createSegmentReaction).not.toHaveBeenCalled();
});
