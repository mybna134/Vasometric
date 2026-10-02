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
  shadowX: number;
  shadowY: number;
  shadowBlur: number;
  shadowOpacity: number;
};

type PluginMessage = { type: string; settings?: PluginSettings };
type Matrix2D = { a: number; b: number; c: number; d: number };
type LayerPreview = { id: string; bytes: Uint8Array; x: number; y: number; width: number; height: number; scale: number };
type PreviewBounds = { x: number; y: number; width: number; height: number };
type ExtrusionBitmap = { id: string; bytes: Uint8Array; x: number; y: number; width: number; height: number };

if (figma.editorType !== 'figma') {
  figma.closePlugin('Vasometric is available in Figma Design.');
} else {
  figma.showUI(__html__, { width: 420, height: 820, themeColors: true, title: 'Vasometric' });

  const radians = (degrees: number): number => degrees * Math.PI / 180;
  const selectedNodes = (): SceneNode[] => [...figma.currentPage.selection];
  const notice = (text: string): void => figma.ui.postMessage({ type: 'notice', text });
  let previewRevision = 0;

  async function sendSelection(): Promise<void> {
    const nodes = selectedNodes();
    figma.ui.postMessage({ type: 'selection', count: nodes.length });
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

  function addExtrusionBitmaps(nodes: readonly SceneNode[], bitmaps: readonly ExtrusionBitmap[]): number {
    let created = 0;
    for (const bitmap of bitmaps) {
      const source = nodes.find((node) => node.id === bitmap.id);
      if (!source || bitmap.bytes.length === 0) continue;
      const image = figma.createImage(bitmap.bytes);
      const body = figma.createRectangle();
      body.name = `${source.name} · solid extrusion`;
      body.resize(Math.max(1, bitmap.width), Math.max(1, bitmap.height));
      body.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
      body.strokes = [];
      figma.currentPage.appendChild(body);
      body.x = bitmap.x;
      body.y = bitmap.y;
      created += 1;
    }
    return created;
  }

  function applySettings(nodes: readonly SceneNode[], settings: PluginSettings, bitmaps: readonly ExtrusionBitmap[] = []): number {
    if (settings.mode === 'perspective' && settings.shadowOpacity > 0) {
      applyShadow(nodes, settings);
    }
    const matrix = transformation(settings);
    for (const node of nodes) transformNode(node, matrix);
    const depth = settings.mode === 'isometric' ? settings.depth : settings.extrusionDepth;
    return depth > 0 ? addExtrusionBitmaps(nodes, bitmaps) : 0;
  }

  function preview(_settings: PluginSettings): void {
    const count = figma.currentPage.selection.length;
    figma.ui.postMessage({ type: 'preview-state', text: count ? 'PREVIEW · APPLY TO COMMIT' : 'PREVIEW · NO SELECTION' });
  }

  function commit(settings: PluginSettings, bitmaps: readonly ExtrusionBitmap[] = []): void {
    const nodes = selectedNodes();
    if (!nodes.length) { notice('Select one or more layers on the canvas first'); return; }
    try {
      const extrusions = applySettings(nodes, settings, bitmaps);
      notice(`Applied to ${nodes.length} layer${nodes.length === 1 ? '' : 's'}${extrusions ? ` · added ${extrusions} solid extrusion${extrusions === 1 ? '' : 's'}` : ''}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Could not apply this transform';
      notice(`Apply failed: ${detail}`);
    }
  }

  figma.on('selectionchange', sendSelection);
  figma.ui.onmessage = (message: PluginMessage): void => {
    try {
      if (message.type === 'cancel') { figma.closePlugin(); return; }
      if (message.type === 'reset') { notice('Preview reset'); return; }
      if (message.type === 'preview' && message.settings) { preview(message.settings); return; }
      if (message.type === 'apply' && message.settings) { commit(message.settings, (message as PluginMessage & { extrusions?: ExtrusionBitmap[] }).extrusions || []); return; }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unexpected plugin error';
      notice(`Action failed: ${detail}`);
      console.error('Vasometric action failed', error);
    }
  };

  sendSelection();
}
