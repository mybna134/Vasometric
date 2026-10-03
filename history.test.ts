import { expect, test } from 'bun:test';

const source = await Bun.file(new URL('./code.ts', import.meta.url)).text();
const transpiler = new Bun.Transpiler({ loader: 'ts' });
const settings = {
  mode: 'isometric', direction: 'right', angle: 0, depth: 0,
  backFace: false, shadowOpacity: 0,
};

test('rapid undo/redo/reset messages run in order and preserve native history', async () => {
  const data = new Map<string, string>();
  const node = {
    id: 'source', type: 'VECTOR', name: 'Source', visible: true, width: 100, height: 40,
    relativeTransform: [[1, 0, 10], [0, 1, 20]],
    get absoluteTransform() { return this.relativeTransform; },
    get absoluteRenderBounds() { return { x: 10, y: 20, width: 100, height: 40 }; },
    absoluteBoundingBox: null,
    resize(width: number, height: number) { this.width = width; this.height = height; },
    getPluginData(key: string) { return data.get(key) || ''; },
    setPluginData(key: string, value: string) { data.set(key, value); },
    async exportAsync() { return new Uint8Array([1]); },
  };
  const snapshot = () => ({ width: node.width, height: node.height, matrix: structuredClone(node.relativeTransform), data: [...data] });
  const nativeHistory = [snapshot()];
  const messages: Array<Record<string, unknown>> = [];
  const order: string[] = [];
  let lookups = 0, maxLookups = 0;
  const host = {
    editorType: 'figma', showUI() {}, on() {},
    currentPage: { selection: [node] },
    ui: { postMessage(message: Record<string, unknown>) { messages.push(message); }, onmessage: null as unknown as (message: object) => Promise<void> },
    commitUndo() { nativeHistory.push(snapshot()); order.push('commit'); },
    triggerUndo() {
      order.push('undo');
      nativeHistory.pop();
      const state = nativeHistory.at(-1)!;
      node.width = state.width; node.height = state.height;
      node.relativeTransform = structuredClone(state.matrix);
      data.clear(); state.data.forEach(([key, value]) => data.set(key, value));
    },
    async getNodeByIdAsync(id: string) {
      lookups += 1; maxLookups = Math.max(maxLookups, lookups);
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      lookups -= 1;
      return id === node.id ? node : null;
    },
  };
  new Function('figma', '__html__', transpiler.transformSync(source))(host, '');
  const revision = () => messages.findLast((message) => message.type === 'selection')!.revision;
  await host.ui.onmessage({ type: 'apply', previewRevision: revision(), settings });
  await host.ui.onmessage({ type: 'apply', previewRevision: revision(), settings: { ...settings, angle: 30 } });
  const expected = snapshot();
  order.length = 0;
  for (let cycle = 0; cycle < 5; cycle += 1) {
    await Promise.all(['undo', 'undo', 'reset', 'redo', 'redo'].map((type) => host.ui.onmessage({ type })));
    expect(snapshot()).toEqual(expected);
    expect(messages.findLast((message) => message.type === 'history')).toMatchObject({ undo: 2, redo: 0 });
  }
  expect(maxLookups).toBe(1);
  expect(order).toEqual(Array.from({ length: 5 }, () => ['undo', 'undo', 'commit', 'commit']).flat());
  expect(messages.findLast((message) => message.type === 'action-state')).toMatchObject({ busy: false });
  await host.ui.onmessage({ type: 'undo' });
  await host.ui.onmessage({ type: 'reset', clearHistory: true });
  expect(messages.findLast((message) => message.type === 'history')).toMatchObject({ undo: 1, redo: 1 });
  await host.ui.onmessage({ type: 'restore', clearHistory: false });
  expect(messages.findLast((message) => message.type === 'history')).toMatchObject({ undo: 2, redo: 0 });
  await host.ui.onmessage({ type: 'apply', previewRevision: revision(), settings });
  await host.ui.onmessage({ type: 'apply', previewRevision: revision(), settings });
  await host.ui.onmessage({ type: 'undo' });
  expect(messages.findLast((message) => message.type === 'history')).toMatchObject({ undo: 3, redo: 1 });
  await host.ui.onmessage({ type: 'restore', clearHistory: true });
  expect(messages.findLast((message) => message.type === 'history')).toMatchObject({ undo: 0, redo: 0 });
  const restoredState = snapshot();
  const undoBoundary = nativeHistory.length;
  const orderBoundary = order.length;
  await Promise.all(['undo', 'redo'].map((type) => host.ui.onmessage({ type })));
  expect(snapshot()).toEqual(restoredState);
  expect(nativeHistory).toHaveLength(undoBoundary);
  expect(order).toHaveLength(orderBoundary);
});

test('stale preview cannot apply a transform to the current selection', async () => {
  let commits = 0;
  const messages: Array<Record<string, unknown>> = [];
  const host = {
    editorType: 'figma', showUI() {}, on() {}, currentPage: { selection: [] },
    ui: { postMessage(message: Record<string, unknown>) { messages.push(message); }, onmessage: null as unknown as (message: object) => Promise<void> },
    commitUndo() { commits += 1; },
  };
  new Function('figma', '__html__', transpiler.transformSync(source))(host, '');
  await host.ui.onmessage({ type: 'apply', previewRevision: -1, settings });
  expect(commits).toBe(0);
  expect(messages.some((message) => String(message.text).includes('Selection changed'))).toBe(true);
});

test('redo follows recreated group IDs and translates body and outline to source position', async () => {
  const instrumented = source.replace("figma.on('selectionchange', sendSelection);", `
    return { redoAction, redoHistory, setCommit(callback) { commit = callback; } };
  `);
  const page = { selection: [] as Array<{ id: string }> };
  const oldNode = { id: 'original', visible: true };
  const newNode = {
    id: 'new-group', visible: true,
    absoluteRenderBounds: { x: 150, y: 260, width: 100, height: 40 },
  };
  const lookup = new Map<string, object>([['original', oldNode], ['new-group', newNode]]);
  const host = {
    editorType: 'figma', showUI() {}, currentPage: page,
    ui: { postMessage() {} }, async getNodeByIdAsync(id: string) { return lookup.get(id) || null; },
  };
  type Action = { type: string; beforeIds: string[]; afterIds: string[]; settings: object; extrusions: Array<{ id: string; body: { path: string; x: number; y: number }; outline: { path: string; x: number; y: number }; sourceBounds: object }> };
  const harness = new Function('figma', '__html__', transpiler.transformSync(instrumented))(host, '') as {
    redoAction(): Promise<void>; redoHistory: Action[]; setCommit(callback: (settings: object, paths: Action['extrusions']) => Action): void;
  };
  const base: Action = { type: 'apply', beforeIds: ['original'], afterIds: ['old-group'], settings, extrusions: [] };
  const later: Action = {
    type: 'apply', beforeIds: ['old-group'], afterIds: ['old-result'], settings,
    extrusions: [{ id: 'old-group', body: { path: 'M0 0 L10 0 L10 10 Z', x: 110, y: 220 }, outline: { path: 'M0 0 L10 10', x: 120, y: 230 }, sourceBounds: { x: 100, y: 200, width: 100, height: 40 } }],
  };
  const captured: Action['extrusions'][] = [];
  harness.setCommit((options, paths) => {
    captured.push(paths);
    const beforeIds = page.selection.map((node) => node.id);
    return { type: 'apply', beforeIds, afterIds: [captured.length === 1 ? newNode.id : 'new-result'], settings: options, extrusions: paths };
  });
  harness.redoHistory.push(later, base);
  await harness.redoAction();
  await harness.redoAction();
  expect(captured[1][0]).toMatchObject({ id: 'new-group', body: { x: 160, y: 280 }, outline: { x: 170, y: 290 } });
  expect(later.extrusions[0]).toMatchObject({ id: 'old-group', body: { x: 110, y: 220 }, outline: { x: 120, y: 230 } });
  expect(harness.redoHistory).toHaveLength(0);
});
