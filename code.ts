type PluginSettings = {
  mode: 'isometric' | 'perspective';
  panel: 'skew' | '3d' | 'camera' | 'extrusion' | 'shadow';
  direction: 'left' | 'top-left' | 'right' | 'top-right';
  angle: number;
  depth: number;
  skewX: number;
  skewY: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  perspective: number;
  yaw: number;
  pitch: number;
  fov: number;
  extrusionDepth: number;
  extrusionAngle: number;
  extrusionSteps: number;
  outlineBase: boolean;
  backFace: boolean;
  extrusionColor: string;
  outlineColor: string;
  shadowX: number;
  shadowY: number;
  shadowBlur: number;
  shadowOpacity: number;
};

type PluginMessage = { type: string; settings?: PluginSettings };
type Matrix2D = { a: number; b: number; c: number; d: number };
type LayerPreview = { id: string; bytes: Uint8Array; x: number; y: number; width: number; height: number; scale: number };
type PreviewBounds = { x: number; y: number; width: number; height: number };
type TracedPath = { path: string; x: number; y: number };
type ExtrusionVector = { id: string; body: TracedPath | null; outline: TracedPath | null; dx: number; dy: number };
type OriginalState = { version: 1; width: number; height: number; transform: Transform; effects?: Effect[]; extrusionIds: string[] };

const ORIGINAL_KEY = 'vasometric-original-v1';
const EXTRUSION_SOURCE_KEY = 'vasometric-extrusion-source';
const GROUP_SOURCE_KEY = 'vasometric-group-source';

if (figma.editorType !== 'figma') {
  figma.closePlugin('Vasometric is available in Figma Design.');
} else {
  figma.showUI(__html__, { width: 420, height: 820, themeColors: true, title: 'Vasometric' });

  const radians = (degrees: number): number => degrees * Math.PI / 180;
  const selectedNodes = (): SceneNode[] => [...figma.currentPage.selection];
  const notice = (text: string): void => figma.ui.postMessage({ type: 'notice', text });
  let previewRevision = 0;

  function readOriginal(node: SceneNode): OriginalState | null {
    const data = node.getPluginData(ORIGINAL_KEY);
    if (!data) return null;
    try {
      const value = JSON.parse(data) as OriginalState;
      if (value.version !== 1 || !Number.isFinite(value.width) || !Number.isFinite(value.height) || !Array.isArray(value.transform) || value.transform.length !== 2) return null;
      return { ...value, extrusionIds: Array.isArray(value.extrusionIds) ? value.extrusionIds.filter((id) => typeof id === 'string') : [] };
    } catch { return null; }
  }

  function saveOriginal(node: SceneNode, effects = false): OriginalState {
    const original = readOriginal(node) || { version: 1, width: node.width, height: node.height, transform: node.relativeTransform, extrusionIds: [] };
    if (effects && original.effects === undefined && 'effects' in node) original.effects = [...node.effects];
    node.setPluginData(ORIGINAL_KEY, JSON.stringify(original));
    return original;
  }

  function originalSource(node: SceneNode): SceneNode {
    const sourceId = node.type === 'GROUP' ? node.getPluginData(GROUP_SOURCE_KEY) : '';
    if (!sourceId) return node;
    const findSource = (parent: SceneNode): SceneNode | null => {
      if (parent.id === sourceId) return parent;
      if (!('children' in parent)) return null;
      for (const child of parent.children) {
        const match = findSource(child);
        if (match) return match;
      }
      return null;
    };
    return findSource(node) || node;
  }

  async function sendSelection(): Promise<void> {
    const nodes = selectedNodes();
    figma.ui.postMessage({ type: 'selection', count: nodes.length, restorable: nodes.filter((node) => readOriginal(originalSource(node)) !== null).length });
    const revision = ++previewRevision;
    if (nodes.length === 0) {
      figma.ui.postMessage({ type: 'layer-preview', nodes: [], bounds: null });
      return;
    }
    const previews = await Promise.all(nodes.map(async (node): Promise<LayerPreview | null> => {
      try {
        const bounds = 'absoluteRenderBounds' in node ? node.absoluteRenderBounds : node.absoluteBoundingBox;
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
        const maxPreviewSide = Math.max(128, Math.min(640, 640 / Math.sqrt(nodes.length)));
        const scale = Math.max(0.1, Math.min(4, maxPreviewSide / Math.max(bounds.width, bounds.height, 1)));
        const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
        return { id: node.id, bytes, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, scale };
      } catch (error) {
        console.warn(`Could not export ${node.name} for preview`, error);
        return null;
      }
    }));
    if (revision !== previewRevision) return;
    const layers = previews.filter((item): item is LayerPreview => item !== null);
    if (!layers.length) {
      figma.ui.postMessage({ type: 'layer-preview', nodes: [], bounds: null });
      return;
    }
    const left = Math.min(...layers.map((layer) => layer.x));
    const top = Math.min(...layers.map((layer) => layer.y));
    const right = Math.max(...layers.map((layer) => layer.x + layer.width));
    const bottom = Math.max(...layers.map((layer) => layer.y + layer.height));
    const bounds: PreviewBounds = { x: left, y: top, width: right - left, height: bottom - top };
    figma.ui.postMessage({ type: 'layer-preview', nodes: layers, bounds });
  }

  function transformation(settings: PluginSettings): Matrix2D {
    if (settings.mode === 'isometric') {
      const cosine = Math.cos(Math.PI / 6);
      const sine = Math.sin(Math.PI / 6);
      let face: Matrix2D;
      switch (settings.direction) {
        case 'left': face = { a: cosine, b: sine, c: 0, d: 1 }; break;
        case 'right': face = { a: cosine, b: -sine, c: 0, d: 1 }; break;
        case 'top-left': face = { a: cosine, b: sine, c: -cosine, d: sine }; break;
        case 'top-right': face = { a: cosine, b: -sine, c: cosine, d: sine }; break;
      }
      const rotation = radians(settings.angle);
      const cos = Math.cos(rotation), sin = Math.sin(rotation);
      return {
        a: cos * face.a - sin * face.b,
        b: sin * face.a + cos * face.b,
        c: cos * face.c - sin * face.d,
        d: sin * face.c + cos * face.d,
      };
    }
    const multiply = (left: Matrix2D, right: Matrix2D): Matrix2D => ({
      a: left.a * right.a + left.c * right.b,
      b: left.b * right.a + left.d * right.b,
      c: left.a * right.c + left.c * right.d,
      d: left.b * right.c + left.d * right.d,
    });
    const skew: Matrix2D = { a: 1, b: Math.tan(radians(settings.skewY)), c: Math.tan(radians(settings.skewX)), d: 1 };
    const x = radians(settings.rotateX), y = radians(settings.rotateY), z = radians(settings.rotateZ);
    const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
    // Project depth onto both screen axes so X/Y rotations remain visible on a flat layer.
    const depthX = 0.5, depthY = 0.5;
    const perspectiveScale = Math.max(0.55, Math.min(1.25, 800 / Math.max(100, settings.perspective)));
    const rotation3d: Matrix2D = {
      a: (cz * cy - depthX * sy) * perspectiveScale,
      b: (sz * cy - depthY * sy) * perspectiveScale,
      c: (cz * sy * sx - sz * cx + depthX * cy * sx) * perspectiveScale,
      d: (sz * sy * sx + cz * cx + depthY * cy * sx) * perspectiveScale,
    };
    const yaw = radians(settings.yaw), pitch = radians(settings.pitch);
    const fovScale = Math.max(0.55, Math.min(1.25, 50 / Math.max(20, settings.fov)));
    const camera: Matrix2D = { a: Math.cos(yaw) * fovScale, b: Math.sin(yaw) * fovScale * 0.18, c: -Math.sin(yaw) * 0.5, d: Math.max(0.25, Math.cos(pitch)) * fovScale };
    return multiply(multiply(skew, rotation3d), camera);
  }

  function transformNode(node: SceneNode, operation: Matrix2D): void {
    const [first, second] = node.relativeTransform;
    const centerX = node.width / 2, centerY = node.height / 2;
    const centerParentX = first[0] * centerX + first[1] * centerY + first[2];
    const centerParentY = second[0] * centerX + second[1] * centerY + second[2];
    const rawA = operation.a * first[0] + operation.c * second[0];
    const rawC = operation.a * first[1] + operation.c * second[1];
    const rawB = operation.b * first[0] + operation.d * second[0];
    const rawD = operation.b * first[1] + operation.d * second[1];
    const scaleX = Math.max(0.01, Math.hypot(rawA, rawB));
    const scaleY = Math.max(0.01, Math.hypot(rawC, rawD));
    const resizable = node as SceneNode & { resize?: (width: number, height: number) => void };
    if (typeof resizable.resize === 'function') resizable.resize(Math.max(1, node.width * scaleX), Math.max(1, node.height * scaleY));
    const nextCenterX = node.width / 2, nextCenterY = node.height / 2;
    const a = rawA / scaleX, b = rawB / scaleX, c = rawC / scaleY, d = rawD / scaleY;
    node.relativeTransform = [
      [a, c, centerParentX - a * nextCenterX - c * nextCenterY],
      [b, d, centerParentY - b * nextCenterX - d * nextCenterY],
    ];
  }

  function applyShadow(nodes: readonly SceneNode[], settings: PluginSettings): void {
    for (const node of nodes) {
      if (!('effects' in node)) continue;
      const target = node as BlendMixin;
      const shadow: DropShadowEffect = {
        type: 'DROP_SHADOW', visible: true, blendMode: 'NORMAL',
        color: { r: 0.18, g: 0.2, b: 0.22, a: settings.shadowOpacity / 100 },
        offset: { x: settings.shadowX, y: settings.shadowY }, radius: settings.shadowBlur, spread: 0,
      };
      target.effects = [...target.effects.filter((effect) => effect.type !== 'DROP_SHADOW'), shadow];
    }
  }

  function vectorFromPath(path: TracedPath, color: string, outline = false): VectorNode {
    const hex = color.replace(/^#/, '');
    const rgb = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
    const opacity = parseInt(hex.slice(6, 8) || 'FF', 16) / 255;
    const paint: SolidPaint = { type: 'SOLID', color: { r: rgb[0], g: rgb[1], b: rgb[2] }, opacity };
    const vector = figma.createVector();
    vector.vectorPaths = [{ windingRule: 'EVENODD', data: path.path }];
    vector.x = path.x;
    vector.y = path.y;
    vector.fills = outline ? [] : [paint];
    vector.strokes = outline ? [paint] : [];
    if (outline) vector.strokeWeight = 2;
    return vector;
  }

  function clearGeneratedData(node: SceneNode): void {
    node.setPluginData(ORIGINAL_KEY, '');
    node.setPluginData(GROUP_SOURCE_KEY, '');
    node.setPluginData(EXTRUSION_SOURCE_KEY, '');
    if ('children' in node) for (const child of node.children) clearGeneratedData(child);
  }

  function addExtrusionVectors(nodes: readonly SceneNode[], extrusions: readonly ExtrusionVector[], settings: PluginSettings): number {
    let created = 0;
    const replacements = new Map<string, SceneNode>();
    for (const extrusion of extrusions) {
      const source = nodes.find((node) => node.id === extrusion.id);
      if (!source || (!extrusion.body && !extrusion.outline && !settings.backFace)) continue;
      const parent = source.parent;
      if (!parent || !('children' in parent)) throw new Error('Cannot group this layer with its extrusion');
      const index = parent.children.indexOf(source);
      const originalNode = originalSource(source);
      const additions: SceneNode[] = [];
      let group: GroupNode;
      try {
        if (extrusion.body) {
          const body = vectorFromPath(extrusion.body, settings.extrusionColor);
          body.name = `${source.name} · solid extrusion`;
          additions.push(body);
        }
        if (settings.backFace) {
          const back = source.clone();
          back.name = `${source.name} · back face`;
          clearGeneratedData(back);
          const absolute = source.absoluteTransform;
          back.relativeTransform = [
            [absolute[0][0], absolute[0][1], absolute[0][2] + extrusion.dx],
            [absolute[1][0], absolute[1][1], absolute[1][2] + extrusion.dy],
          ];
          additions.push(back);
        }
        if (extrusion.outline) {
          const outline = vectorFromPath(extrusion.outline, settings.outlineColor, true);
          outline.name = `${source.name} · base outline`;
          additions.push(outline);
        }
        for (const node of additions) node.setPluginData(EXTRUSION_SOURCE_KEY, originalNode.id);
        group = figma.group([...additions, source], parent, index);
      } catch (error) {
        for (const node of additions) if (!node.removed) node.remove();
        throw error;
      }
      group.name = source.name;
      group.setPluginData(GROUP_SOURCE_KEY, originalNode.id);
      additions.forEach((node, order) => group.insertChild(order, node));
      const original = saveOriginal(originalNode);
      original.extrusionIds.push(...additions.map((node) => node.id));
      originalNode.setPluginData(ORIGINAL_KEY, JSON.stringify(original));
      replacements.set(source.id, group);
      created += 1;
    }
    if (replacements.size) figma.currentPage.selection = nodes.map((node) => replacements.get(node.id) || node);
    return created;
  }

  function applySettings(nodes: readonly SceneNode[], settings: PluginSettings, extrusions: readonly ExtrusionVector[] = []): number {
    const depth = settings.mode === 'isometric' ? settings.depth : settings.extrusionDepth;
    if (depth > 0) {
      for (const extrusion of extrusions) {
        const source = nodes.find((node) => node.id === extrusion.id);
        if (!source || (!extrusion.body && !extrusion.outline && !settings.backFace)) continue;
        if (source.parent?.type === 'COMPONENT_SET') throw new Error('Cannot group an extrusion directly in a component set');
        let ancestor: BaseNode | null = source.parent;
        while (ancestor) {
          if (ancestor.type === 'INSTANCE') throw new Error('Cannot group an extrusion inside an instance');
          ancestor = ancestor.parent;
        }
      }
    }
    for (const node of nodes) saveOriginal(originalSource(node), settings.mode === 'perspective' && settings.shadowOpacity > 0);
    if (settings.mode === 'perspective' && settings.shadowOpacity > 0) {
      applyShadow(nodes, settings);
    }
    const matrix = transformation(settings);
    for (const node of nodes) transformNode(node, matrix);
    return depth > 0 ? addExtrusionVectors(nodes, extrusions, settings) : 0;
  }

  function commit(settings: PluginSettings, extrusions: readonly ExtrusionVector[] = []): void {
    const nodes = selectedNodes();
    if (!nodes.length) { notice('Select one or more layers on the canvas first'); return; }
    try {
      const count = applySettings(nodes, settings, extrusions);
      figma.commitUndo();
      notice(`Applied to ${nodes.length} layer${nodes.length === 1 ? '' : 's'}${count ? ` · added ${count} solid extrusion${count === 1 ? '' : 's'}` : ''}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Could not apply this transform';
      notice(`Apply failed: ${detail}`);
    } finally {
      void sendSelection();
    }
  }

  async function restoreSelection(): Promise<void> {
    const nodes = selectedNodes();
    const nextSelection: SceneNode[] = [];
    let restored = 0;
    for (const selected of nodes) {
      const node = originalSource(selected);
      const original = readOriginal(node);
      if (!original) { nextSelection.push(selected); continue; }
      for (const id of original.extrusionIds) {
        const body = await figma.getNodeByIdAsync(id);
        if (body && body.getPluginData(EXTRUSION_SOURCE_KEY) === node.id) body.remove();
      }
      while (node.parent?.type === 'GROUP' && node.parent.getPluginData(GROUP_SOURCE_KEY) === node.id) {
        figma.ungroup(node.parent);
      }
      const current = node.relativeTransform;
      const centerX = current[0][0] * node.width / 2 + current[0][1] * node.height / 2 + current[0][2];
      const centerY = current[1][0] * node.width / 2 + current[1][1] * node.height / 2 + current[1][2];
      const resizable = node as SceneNode & { resize?: (width: number, height: number) => void };
      if (typeof resizable.resize === 'function') resizable.resize(original.width, original.height);
      const [first, second] = original.transform;
      node.relativeTransform = [
        [first[0], first[1], centerX - first[0] * node.width / 2 - first[1] * node.height / 2],
        [second[0], second[1], centerY - second[0] * node.width / 2 - second[1] * node.height / 2],
      ];
      if (original.effects && 'effects' in node) (node as BlendMixin).effects = original.effects;
      node.setPluginData(ORIGINAL_KEY, '');
      nextSelection.push(node);
      restored += 1;
    }
    if (restored) {
      figma.currentPage.selection = nextSelection;
      figma.commitUndo();
    }
    notice(restored ? `Restored ${restored} layer${restored === 1 ? '' : 's'}` : 'No saved transform for the selected layers');
    await sendSelection();
  }

  figma.on('selectionchange', sendSelection);
  figma.ui.onmessage = async (message: PluginMessage): Promise<void> => {
    try {
      if (message.type === 'cancel') { figma.closePlugin(); return; }
      if (message.type === 'reset') { notice('Preview reset'); return; }
      if (message.type === 'restore') { await restoreSelection(); return; }
      if (message.type === 'apply' && message.settings) { commit(message.settings, (message as PluginMessage & { extrusions?: ExtrusionVector[] }).extrusions || []); return; }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unexpected plugin error';
      notice(`Action failed: ${detail}`);
      console.error('Vasometric action failed', error);
    }
  };

  sendSelection();
}
