import { expect, test } from 'bun:test';

type Matrix = [[number, number, number], [number, number, number]];
type Operation = { a: number; b: number; c: number; d: number };
const identity: Matrix = [[1, 0, 0], [0, 1, 0]];

function multiply(left: Matrix, right: Matrix): Matrix {
  return [
    [left[0][0] * right[0][0] + left[0][1] * right[1][0], left[0][0] * right[0][1] + left[0][1] * right[1][1], left[0][0] * right[0][2] + left[0][1] * right[1][2] + left[0][2]],
    [left[1][0] * right[0][0] + left[1][1] * right[1][0], left[1][0] * right[0][1] + left[1][1] * right[1][1], left[1][0] * right[0][2] + left[1][1] * right[1][2] + left[1][2]],
  ];
}

function vector(container = identity, relative: Matrix = [[1, 0, 100], [0, 1, 200]]) {
  return {
    id: 'face', type: 'VECTOR', name: 'Face', width: 300, height: 80, visible: true,
    relativeTransform: relative,
    absoluteRenderBounds: { x: 120, y: 210, width: 260, height: 60 },
    absoluteBoundingBox: null,
    get absoluteTransform() { return multiply(container, this.relativeTransform); },
    resize(width: number, height: number) { this.width = width; this.height = height; },
    setPluginData() {},
    remove() {},
  };
}

const source = await Bun.file(new URL('./code.ts', import.meta.url)).text();
// Exercise the plugin's actual functions without starting its UI message loop.
const compiled = new Bun.Transpiler({ loader: 'ts' }).transformSync(source.replace(
  "figma.on('selectionchange', sendSelection);",
  'return { transformNode };',
));
function plugin(api: object = {}) {
  return new Function('figma', '__html__', compiled)({ editorType: 'figma', showUI() {}, ...api }, '') as {
    transformNode(node: object, operation: Operation): object;
  };
}

function verifyCorners(node: ReturnType<typeof vector>, original: Matrix, width: number, height: number, operation: Operation) {
  const bounds = node.absoluteRenderBounds;
  const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x = original[0][0] * u * width + original[0][1] * v * height + original[0][2];
    const y = original[1][0] * u * width + original[1][1] * v * height + original[1][2];
    const result = node.absoluteTransform;
    expect(result[0][0] * u * node.width + result[0][1] * v * node.height + result[0][2]).toBeCloseTo(cx + operation.a * (x - cx) + operation.c * (y - cy), 8);
    expect(result[1][0] * u * node.width + result[1][1] * v * node.height + result[1][2]).toBeCloseTo(cy + operation.b * (x - cx) + operation.d * (y - cy), 8);
  }
}

test('page transform uses render center even when glyph bounds are off-center', () => {
  const node = vector();
  const original = node.absoluteTransform;
  const operation = { a: Math.cos(Math.PI / 6), b: -.5, c: 0, d: 1 };
  plugin().transformNode(node, operation);
  verifyCorners(node, original, 300, 80, operation);
  expect(node.width).toBeCloseTo(300);
  expect(node.height).toBeCloseTo(80);
});

test('rotated and scaled containing frame matches page-space extrusion geometry', () => {
  const node = vector([[0, -2, 500], [2, 0, 100]]);
  const original = node.absoluteTransform;
  const operation = { a: .7, b: -.4, c: .2, d: .5 };
  plugin().transformNode(node, operation);
  verifyCorners(node, original, 300, 80, operation);
});

test('text keeps original dimensions and layout while its vector face scales', () => {
  const face = vector();
  const data = new Map<string, string>();
  const original = {
    ...vector(), id: 'text', type: 'TEXT', characters: 'Vasometric',
    getPluginData(key: string) { return data.get(key) || ''; },
    setPluginData(key: string, value: string) { data.set(key, value); },
    resize() { throw new Error('Live text must not be resized'); },
    clone() { return vector(); },
    parent: { children: [] as object[] },
  };
  original.parent.children = [original];
  const matrix = face.absoluteTransform;
  const operation = { a: .6, b: 0, c: 0, d: .5 };
  const group = { name: '', setPluginData() {} };
  const result = plugin({ currentPage: {}, flatten() { return face; }, group() { return group; } }).transformNode(original, operation);
  expect(result).toBe(group);
  expect(original.width).toBe(300);
  expect(original.height).toBe(80);
  expect(original.characters).toBe('Vasometric');
  expect(original.visible).toBe(false);
  expect(JSON.parse(data.get('vasometric-original-v1')!).extrusionIds).toContain('face');
  verifyCorners(face, matrix, 300, 80, operation);
});
