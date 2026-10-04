import { expect, test } from 'bun:test';

const source = await Bun.file(new URL('./code.ts', import.meta.url)).text();
const compiled = new Bun.Transpiler({ loader: 'ts' }).transformSync(source.replace(
  "figma.on('selectionchange', sendSelection);",
  'return { undoAction, undoHistory, redoHistory, redoneIds, canUndoSelection, sendSelection };',
));

test('undo requires the complete latest result selection and reports availability on selection changes', async () => {
  const makeNode = (id: string) => ({ id, type: 'VECTOR', visible: true, absoluteRenderBounds: null, absoluteBoundingBox: null, getPluginData() { return ''; } });
  const nodes = ['source-a', 'source-b', 'result-a', 'result-b', 'new-result-a', 'unrelated', 'child'].map(makeNode);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const page = { selection: [] as typeof nodes };
  const messages: Array<Record<string, unknown>> = [];
  let nativeUndos = 0;
  const host = {
    editorType: 'figma', showUI() {}, currentPage: page,
    ui: { postMessage(message: Record<string, unknown>) { messages.push(message); } },
    triggerUndo() { nativeUndos += 1; },
    async getNodeByIdAsync(id: string) { return byId.get(id) || null; },
  };
  type Action = { type: string; beforeIds: string[]; afterIds: string[] };
  const harness = new Function('figma', '__html__', compiled)(host, '') as {
    undoAction(): Promise<void>; sendSelection(): Promise<void>; canUndoSelection(): boolean;
    undoHistory: Action[]; redoHistory: Action[]; redoneIds: Map<string, string>;
  };
  harness.undoHistory.push({ type: 'restore', beforeIds: ['source-a', 'source-b'], afterIds: ['result-a', 'result-b'] });
  for (const ids of [[], ['unrelated'], ['child'], ['result-a'], ['result-a', 'unrelated'], ['result-a', 'result-b', 'unrelated']]) {
    page.selection = ids.map((id) => byId.get(id)!);
    expect(harness.canUndoSelection()).toBe(false);
    await harness.sendSelection();
    expect(messages.findLast((message) => message.type === 'selection')?.undoable).toBe(false);
    await harness.undoAction();
    expect(nativeUndos).toBe(0);
    expect(harness.undoHistory).toHaveLength(1);
    expect(harness.redoHistory).toHaveLength(0);
  }
  // Redo can recreate result groups under new IDs; selecting these still permits undo.
  harness.redoneIds.set('result-a', 'intermediate-result-a');
  harness.redoneIds.set('intermediate-result-a', 'new-result-a');
  page.selection = [byId.get('result-b')!, byId.get('new-result-a')!];
  expect(harness.canUndoSelection()).toBe(true);
  await harness.sendSelection();
  expect(messages.findLast((message) => message.type === 'selection')?.undoable).toBe(true);
  await harness.undoAction();
  expect(nativeUndos).toBe(1);
  expect(harness.undoHistory).toHaveLength(0);
  expect(harness.redoHistory).toHaveLength(1);
  expect(page.selection.map((node) => node.id)).toEqual(['source-a', 'source-b']);
});
