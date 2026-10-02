import * as THREE from 'three';

type Mode = 'isometric' | 'perspective';
type Panel = 'skew' | '3d' | 'camera' | 'extrusion' | 'shadow';
type Direction = 'left' | 'top-left' | 'right' | 'top-right';
type Settings = {
  mode: Mode; panel: Panel; direction: Direction; angle: number; depth: number;
  skewX: number; skewY: number; rotateX: number; rotateY: number; rotateZ: number; perspective: number;
  yaw: number; pitch: number; fov: number; extrusionDepth: number; extrusionAngle: number; extrusionSteps: number;
  shadowX: number; shadowY: number; shadowBlur: number; shadowOpacity: number;
};
type Control = { label: string; key: keyof Settings; min: number; max: number; value: number; suffix?: string; step?: number };
type PreviewLayerData = { id: string; bytes: Uint8Array; x: number; y: number; width: number; height: number; scale: number };
type PreviewLayer = PreviewLayerData & { image: HTMLImageElement };
type PreviewMessage = { nodes?: PreviewLayerData[]; bounds?: { x: number; y: number; width: number; height: number } | null };
type PreviewVisual = { matrix: [number, number, number, number]; dx: number; dy: number; depth: number; angle: number; scale: number; planeAngle: number; isoDirection: Direction | null };

const defaults: Settings = {
  mode: 'isometric', panel: 'skew', direction: 'right', angle: 0, depth: 0,
  skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, rotateZ: 0, perspective: 800,
  yaw: 0, pitch: 0, fov: 50, extrusionDepth: 0, extrusionAngle: 45, extrusionSteps: 8,
  shadowX: 12, shadowY: 16, shadowBlur: 24, shadowOpacity: 0,
};
const settings: Settings = { ...defaults };
let previewLayers: PreviewLayer[] = [];
let previewBounds: PreviewMessage['bounds'] = null;
let previewLoadRevision = 0;
let previewVisual: PreviewVisual | null = null;
let previewAnimation = 0;
let previewTarget: PreviewVisual | null = null;
let showIsometricGrid = false;
const controls: Record<Panel, Control[]> = {
  skew: [
    { label: 'Skew X', key: 'skewX', min: -60, max: 60, value: 0, suffix: '°' },
    { label: 'Skew Y', key: 'skewY', min: -60, max: 60, value: 0, suffix: '°' },
  ],
  '3d': [
    { label: 'Rotate X', key: 'rotateX', min: -180, max: 180, value: 25, suffix: '°' },
    { label: 'Rotate Y', key: 'rotateY', min: -180, max: 180, value: -25, suffix: '°' },
    { label: 'Rotate Z', key: 'rotateZ', min: -180, max: 180, value: 0, suffix: '°' },
    { label: 'Perspective', key: 'perspective', min: 100, max: 2000, value: 800, suffix: ' px' },
  ],
  camera: [
    { label: 'Camera yaw', key: 'yaw', min: -180, max: 180, value: 35, suffix: '°' },
    { label: 'Camera pitch', key: 'pitch', min: -90, max: 90, value: 25, suffix: '°' },
    { label: 'Field of view', key: 'fov', min: 20, max: 120, value: 50, suffix: '°' },
  ],
  extrusion: [
    { label: 'Depth', key: 'extrusionDepth', min: 0, max: 200, value: 40, suffix: ' px' },
    { label: 'Direction', key: 'extrusionAngle', min: 0, max: 360, value: 45, suffix: '°' },
    { label: 'Segments', key: 'extrusionSteps', min: 1, max: 30, value: 8, step: 1 },
  ],
  shadow: [
    { label: 'Offset X', key: 'shadowX', min: -100, max: 100, value: 12, suffix: ' px' },
    { label: 'Offset Y', key: 'shadowY', min: -100, max: 100, value: 16, suffix: ' px' },
    { label: 'Softness', key: 'shadowBlur', min: 0, max: 100, value: 24, suffix: ' px' },
    { label: 'Opacity', key: 'shadowOpacity', min: 0, max: 100, value: 25, suffix: '%' },
  ],
};

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
};
const previewCanvas = $('preview') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas: previewCanvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
camera.position.z = 100;
const layerMeshes = new Map<string, THREE.Mesh>();
const bodyMeshes = new Map<string, { mesh: THREE.Mesh; offsetX: number; offsetY: number; width: number; height: number; scale: number }>();
const shadowMeshes = new Map<string, { mesh: THREE.Mesh; width: number; height: number; scale: number }>();
let lastBodyBuild = 0;
let canvasWidth = 1;
let canvasHeight = 1;
let overlayWidth = 0;
let overlayHeight = 0;
const post = (message: Record<string, unknown>): void => parent.postMessage({ pluginMessage: message }, '*');
const isIsometric = (): boolean => settings.mode === 'isometric';

function showToast(message: string): void {
  const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2000);
}

function formatValue(key: keyof Settings, value: number): string {
  const control = Object.values(controls).flat().find((entry) => entry.key === key);
  const suffix = control?.suffix || (key === 'angle' ? '°' : key === 'depth' ? ' px' : '');
  return `${Math.round(value)}${suffix}`;
}

function isometricMatrix(direction: Direction, angle: number): [number, number, number, number] {
  const cosine = Math.cos(Math.PI / 6), sine = Math.sin(Math.PI / 6);
  let face: [number, number, number, number];
  switch (direction) {
    case 'left': face = [cosine, sine, 0, 1]; break;
    case 'right': face = [cosine, -sine, 0, 1]; break;
    case 'top-left': face = [cosine, sine, -cosine, sine]; break;
    case 'top-right': face = [cosine, -sine, cosine, sine]; break;
  }
  const rotation = angle * Math.PI / 180;
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  return [cos * face[0] - sin * face[1], sin * face[0] + cos * face[1], cos * face[2] - sin * face[3], sin * face[2] + cos * face[3]];
}

function previewMatrix(): [number, number, number, number] {
  const rad = (degrees: number): number => degrees * Math.PI / 180;
  if (settings.mode === 'isometric') return isometricMatrix(settings.direction, settings.angle);
  const multiply = (left: [number, number, number, number], right: [number, number, number, number]): [number, number, number, number] => [
    left[0] * right[0] + left[2] * right[1], left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3], left[1] * right[2] + left[3] * right[3],
  ];
  let matrix: [number, number, number, number] = [1, 0, 0, 1];
  matrix = multiply(matrix, [1, Math.tan(rad(settings.skewY)), Math.tan(rad(settings.skewX)), 1]);
  {
    const x = rad(settings.rotateX), y = rad(settings.rotateY), z = rad(settings.rotateZ);
    const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
    // Match the plugin's depth projection so the preview shows the committed rotation.
    const depthX = .5, depthY = .5;
    const perspectiveScale = Math.max(.55, Math.min(1.25, 800 / Math.max(100, settings.perspective)));
    matrix = multiply(matrix, [
      (cz * cy - depthX * sy) * perspectiveScale,
      (sz * cy - depthY * sy) * perspectiveScale,
      (cz * sy * sx - sz * cx + depthX * cy * sx) * perspectiveScale,
      (sz * sy * sx + cz * cx + depthY * cy * sx) * perspectiveScale,
    ]);
  }
  {
    const yaw = rad(settings.yaw), pitch = rad(settings.pitch);
    const fovScale = Math.max(.55, Math.min(1.25, 50 / Math.max(20, settings.fov)));
    matrix = multiply(matrix, [Math.cos(yaw) * fovScale, Math.sin(yaw) * fovScale * .18, -Math.sin(yaw) * .5, Math.max(.25, Math.cos(pitch)) * fovScale]);
  }
  return matrix;
}

function averageColor(image: HTMLImageElement): string {
  const sample = document.createElement('canvas'); sample.width = 24; sample.height = 24;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 'rgb(70, 65, 80)';
  ctx.drawImage(image, 0, 0, 24, 24);
  const pixels = ctx.getImageData(0, 0, 24, 24).data;
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 40) { r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; count += 1; }
  if (!count) return 'rgb(70, 65, 80)';
  return `rgb(${Math.round(r / count * .62)}, ${Math.round(g / count * .62)}, ${Math.round(b / count * .62)})`;
}

function makeSolidExtrusion(image: HTMLImageElement, width: number, height: number, matrix: [number, number, number, number], dx: number, dy: number, maxSteps = 600): { canvas: HTMLCanvasElement; x: number; y: number } {
  const [a, b, c, d] = matrix;
  const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => [a * (x - width / 2) + c * (y - height / 2) + width / 2, b * (x - width / 2) + d * (y - height / 2) + height / 2]);
  const pad = 2;
  const left = Math.floor(Math.min(...corners.map(([x]) => x), ...corners.map(([x]) => x + dx)) - pad);
  const top = Math.floor(Math.min(...corners.map(([, y]) => y), ...corners.map(([, y]) => y + dy)) - pad);
  const right = Math.ceil(Math.max(...corners.map(([x]) => x), ...corners.map(([x]) => x + dx)) + pad);
  const bottom = Math.ceil(Math.max(...corners.map(([, y]) => y), ...corners.map(([, y]) => y + dy)) + pad);
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, right - left); canvas.height = Math.max(1, bottom - top);
  const ctx = canvas.getContext('2d'); if (!ctx) return { canvas, x: left, y: top };
  const steps = Math.min(maxSteps, Math.max(1, Math.ceil(Math.hypot(dx, dy) * 2)));
  for (let step = steps; step >= 0; step -= 1) {
    const t = step / steps;
    ctx.save(); ctx.translate(width / 2 + dx * t - left, height / 2 + dy * t - top); ctx.transform(a, b, c, d, 0, 0); ctx.translate(-width / 2, -height / 2);
    ctx.drawImage(image, 0, 0, width, height); ctx.restore();
  }
  ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.translate(width / 2 - left, height / 2 - top); ctx.transform(a, b, c, d, 0, 0); ctx.translate(-width / 2, -height / 2); ctx.drawImage(image, 0, 0, width, height); ctx.restore();
  ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = averageColor(image); ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  return { canvas, x: left, y: top };
}

function projectedFrame(matrix: [number, number, number, number], offsetX: number, offsetY: number): { minX: number; minY: number; width: number; height: number } {
  const [a, b, c, d] = matrix;
  const points: [number, number][] = [];
  for (const layer of previewLayers) for (const [x, y] of [[0, 0], [layer.width, 0], [0, layer.height], [layer.width, layer.height]]) {
    const localX = x - layer.width / 2, localY = y - layer.height / 2;
    const projectedX = layer.x + layer.width / 2 + a * localX + c * localY;
    const projectedY = layer.y + layer.height / 2 + b * localX + d * localY;
    points.push([projectedX, projectedY], [projectedX + offsetX, projectedY + offsetY]);
  }
  if (!points.length) return { minX: previewBounds?.x || 0, minY: previewBounds?.y || 0, width: previewBounds?.width || 1, height: previewBounds?.height || 1 };
  const minX = Math.min(...points.map(([x]) => x)), minY = Math.min(...points.map(([, y]) => y));
  return { minX, minY, width: Math.max(1, Math.max(...points.map(([x]) => x)) - minX), height: Math.max(1, Math.max(...points.map(([, y]) => y)) - minY) };
}

function isometricExtrusionAngle(): number {
  const base = settings.direction === 'left' ? -30 : settings.direction === 'right' ? 210 : 90;
  return base + settings.angle;
}

function targetPreviewVisual(): PreviewVisual {
  const canvasBounds = ($('preview') as HTMLCanvasElement).getBoundingClientRect();
  const iso = isIsometric();
  const depth = iso ? settings.depth : settings.extrusionDepth;
  const angle = iso ? isometricExtrusionAngle() : settings.extrusionAngle;
  const matrix = previewMatrix();
  const frame = projectedFrame(matrix, Math.cos(angle * Math.PI / 180) * depth, Math.sin(angle * Math.PI / 180) * depth);
  const scale = previewLayers.length ? Math.min((canvasBounds.width - 38) / frame.width, (canvasBounds.height - 24) / frame.height) : 1;
  const scaledDepth = depth * scale;
  return { matrix, dx: Math.cos(angle * Math.PI / 180) * scaledDepth, dy: Math.sin(angle * Math.PI / 180) * scaledDepth, depth: scaledDepth, angle, scale, planeAngle: iso ? settings.angle : 0, isoDirection: iso ? settings.direction : null };
}

function animatePreview(): void {
  const target = targetPreviewVisual();
  previewTarget = target;
  refreshOverlays();
  if (!previewVisual || previewLayers.length === 0) {
    previewVisual = target;
    refreshOverlays();
    if (previewLayers.length) rebuildBodyMeshes(target);
    drawLayerPreview(target);
    return;
  }
  if (previewAnimation) return;
  let previousTime = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(50, Math.max(1, now - previousTime));
    previousTime = now;
    const destination = previewTarget || target;
    const eased = 1 - Math.exp(-dt / 58);
    const angleDelta = ((destination.angle - previewVisual!.angle + 540) % 360) - 180;
    const depth = previewVisual!.depth + (destination.depth - previewVisual!.depth) * eased;
    const angle = previewVisual!.angle + angleDelta * eased;
    const planeAngleDelta = ((destination.planeAngle - previewVisual!.planeAngle + 540) % 360) - 180;
    const planeAngle = previewVisual!.planeAngle + planeAngleDelta * eased;
    const sameIsometricFace = destination.isoDirection !== null && previewVisual!.isoDirection === destination.isoDirection;
    previewVisual = {
      matrix: sameIsometricFace ? isometricMatrix(destination.isoDirection!, planeAngle) : previewVisual!.matrix.map((value, index) => value + (destination.matrix[index] - value) * eased) as PreviewVisual['matrix'],
      dx: Math.cos(angle * Math.PI / 180) * depth,
      dy: Math.sin(angle * Math.PI / 180) * depth,
      depth,
      angle,
      scale: previewVisual!.scale + (destination.scale - previewVisual!.scale) * eased,
      planeAngle,
      isoDirection: previewVisual!.isoDirection,
    };
    const remaining = Math.max(...previewVisual.matrix.map((value, index) => Math.abs(destination.matrix[index] - value)), Math.abs(destination.depth - previewVisual.depth), Math.abs(((destination.angle - previewVisual.angle + 540) % 360) - 180), Math.abs(destination.scale - previewVisual.scale));
    if (remaining < 0.05) {
      previewVisual = destination;
      previewAnimation = 0;
      rebuildBodyMeshes(destination);
      if (showIsometricGrid) refreshOverlays();
      drawLayerPreview(destination);
      return;
    }
    if (now - lastBodyBuild >= 32) {
      rebuildBodyMeshes(previewVisual, Math.max(24, Math.floor(96 / previewLayers.length)), false);
      lastBodyBuild = now;
    }
    if (showIsometricGrid) refreshOverlays();
    drawLayerPreview(previewVisual);
    previewAnimation = requestAnimationFrame(frame);
  };
  previewAnimation = requestAnimationFrame(frame);
}

function clearMeshes(map: Map<string, THREE.Mesh>): void {
  for (const mesh of map.values()) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    material.dispose();
  }
  map.clear();
}

function ensureLayerMeshes(): void {
  if (layerMeshes.size === previewLayers.length && previewLayers.every((layer) => layerMeshes.has(layer.id))) return;
  clearMeshes(layerMeshes);
  for (const layer of previewLayers) {
    const texture = new THREE.Texture(layer.image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    layerMeshes.set(layer.id, mesh);
  }
}

function isPerspectiveView(): boolean {
  return settings.mode === 'perspective';
}

function removeIsometricGrid(grid: THREE.Group): void {
  scene.remove(grid);
  for (const child of grid.children) {
    const drawable = child as THREE.LineSegments;
    drawable.geometry.dispose();
    (drawable.material as THREE.Material).dispose();
  }
}

function drawIsometricGrid(): void {
  previewCanvas.parentElement?.classList.toggle('grid-visible', showIsometricGrid && isIsometric());
  const key = '__isometric-cube-grid__';
  const old = scene.getObjectByName(key) as THREE.Group | undefined;
  if (!showIsometricGrid || !isIsometric()) {
    if (old) removeIsometricGrid(old);
    return;
  }

  const rotation = -(previewVisual?.planeAngle ?? settings.angle) * Math.PI / 180;
  if (old && overlayWidth === canvasWidth && overlayHeight === canvasHeight) {
    old.rotation.z = rotation;
    return;
  }
  if (old) removeIsometricGrid(old);

  // Edge-to-edge hexagons with three spokes make the three visible faces of each cube.
  const halfWidth = 32, rise = 18;
  const columnStep = halfWidth * 2, rowStep = rise * 3;
  const extent = Math.hypot(canvasWidth, canvasHeight) / 2 + columnStep;
  const corners: [number, number][] = [
    [0, rise * 2], [halfWidth, rise], [halfWidth, -rise], [0, -rise * 2],
    [-halfWidth, -rise], [-halfWidth, rise], [0, 0],
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
    [6, 1], [6, 3], [6, 5],
  ];
  const positions: number[] = [];
  const seen = new Set<string>();
  for (let row = -Math.ceil(extent / rowStep); row <= Math.ceil(extent / rowStep); row += 1) {
    const y = row * rowStep;
    for (let column = -Math.ceil(extent / columnStep); column <= Math.ceil(extent / columnStep); column += 1) {
      const x = column * columnStep + (Math.abs(row) % 2) * halfWidth;
      for (const [a, b] of edges) {
        const x1 = x + corners[a][0], y1 = y + corners[a][1];
        const x2 = x + corners[b][0], y2 = y + corners[b][1];
        const key = x1 < x2 || (x1 === x2 && y1 < y2) ? `${x1},${y1}:${x2},${y2}` : `${x2},${y2}:${x1},${y1}`;
        if (seen.has(key)) continue;
        seen.add(key);
        positions.push(x1, y1, -5, x2, y2, -5);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const grid = new THREE.Group();
  grid.name = key;
  grid.rotation.z = rotation;
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xaaa3b2, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false }));
  lines.renderOrder = -10;
  grid.add(lines);
  scene.add(grid);
}

function renderScene(): void {
  const bounds = previewCanvas.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1) return;
  canvasWidth = bounds.width; canvasHeight = bounds.height;
  renderer.setSize(canvasWidth, canvasHeight, false);
  camera.left = -canvasWidth / 2; camera.right = canvasWidth / 2; camera.top = canvasHeight / 2; camera.bottom = -canvasHeight / 2;
  camera.updateProjectionMatrix();
  if (overlayWidth !== canvasWidth || overlayHeight !== canvasHeight) refreshOverlays();
  renderer.render(scene, camera);
}

function refreshOverlays(): void {
  drawIsometricGrid();
  overlayWidth = canvasWidth;
  overlayHeight = canvasHeight;
}

function updateLayerMatrices(visual: PreviewVisual, originX: number, originY: number, fitScale: number): void {
  ensureLayerMeshes();
  for (const layer of previewLayers) {
    const mesh = layerMeshes.get(layer.id);
    if (!mesh) continue;
    const width = layer.width * fitScale, height = layer.height * fitScale;
    const centerX = originX + (layer.x - previewBounds!.x) * fitScale + width / 2 - canvasWidth / 2;
    const centerY = canvasHeight / 2 - (originY + (layer.y - previewBounds!.y) * fitScale + height / 2);
    const [a, b, c, d] = visual.matrix;
    mesh.matrix.set(a * width, -c * height, 0, centerX, -b * width, d * height, 0, centerY, 0, 0, 1, 0, 0, 0, 0, 1);
    mesh.matrixWorldNeedsUpdate = true;
  }
}

function rebuildBodyMeshes(visual: PreviewVisual, maxSteps = 600, rebuildShadows = true): void {
  for (const [id, body] of bodyMeshes) {
    scene.remove(body.mesh); body.mesh.geometry.dispose();
    const material = body.mesh.material as THREE.MeshBasicMaterial; material.map?.dispose(); material.dispose();
    bodyMeshes.delete(id);
  }
  if (visual.depth <= 0.05 || !previewBounds) {
    if (rebuildShadows) rebuildShadowMeshes(visual);
    return;
  }
  for (const layer of previewLayers) {
    const width = layer.width * visual.scale, height = layer.height * visual.scale;
    const body = makeSolidExtrusion(layer.image, width, height, visual.matrix, visual.dx, visual.dy, maxSteps);
    const texture = new THREE.CanvasTexture(body.canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.matrixAutoUpdate = false;
    mesh.position.z = -1;
    scene.add(mesh);
    bodyMeshes.set(layer.id, { mesh, offsetX: body.x, offsetY: body.y, width: body.canvas.width, height: body.canvas.height, scale: visual.scale });
  }
  if (rebuildShadows) rebuildShadowMeshes(visual);
}

function rebuildShadowMeshes(visual: PreviewVisual): void {
  for (const [id, shadow] of shadowMeshes) {
    scene.remove(shadow.mesh); shadow.mesh.geometry.dispose();
    const material = shadow.mesh.material as THREE.MeshBasicMaterial; material.map?.dispose(); material.dispose();
    shadowMeshes.delete(id);
  }
  if (!isPerspectiveView() || settings.shadowOpacity <= 0) return;
  for (const layer of previewLayers) {
    const width = layer.width * visual.scale, height = layer.height * visual.scale;
    const padding = Math.ceil(settings.shadowBlur * visual.scale * 2 + Math.max(Math.abs(settings.shadowX), Math.abs(settings.shadowY)) * visual.scale + 3);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = Math.max(1, Math.ceil(width + padding * 2));
    shadowCanvas.height = Math.max(1, Math.ceil(height + padding * 2));
    const context = shadowCanvas.getContext('2d');
    if (!context) continue;
    context.shadowColor = `rgba(40, 30, 70, ${settings.shadowOpacity / 100})`;
    context.shadowBlur = settings.shadowBlur * visual.scale;
    context.shadowOffsetX = settings.shadowX * visual.scale;
    context.shadowOffsetY = settings.shadowY * visual.scale;
    context.drawImage(layer.image, padding, padding, width, height);
    context.globalCompositeOperation = 'destination-out';
    context.shadowColor = 'transparent'; context.shadowBlur = 0; context.shadowOffsetX = 0; context.shadowOffsetY = 0;
    context.drawImage(layer.image, padding, padding, width, height);
    const texture = new THREE.CanvasTexture(shadowCanvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    shadowMeshes.set(layer.id, { mesh, width: shadowCanvas.width, height: shadowCanvas.height, scale: visual.scale });
  }
}

function drawLayerPreview(visual?: PreviewVisual): void {
  const bounds = previewCanvas.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1) return;
  canvasWidth = bounds.width; canvasHeight = bounds.height;
  const empty = $('empty-preview');
  empty.hidden = previewLayers.length > 0;
  if (!previewLayers.length || !previewBounds?.width || !previewBounds.height) { renderScene(); return; }

  const displayed = visual || targetPreviewVisual();
  const fitScale = displayed.scale;
  const frame = projectedFrame(displayed.matrix, fitScale ? displayed.dx / fitScale : 0, fitScale ? displayed.dy / fitScale : 0);
  const originX = (bounds.width - frame.width * fitScale) / 2 - (frame.minX - previewBounds.x) * fitScale;
  const originY = (bounds.height - frame.height * fitScale) / 2 - (frame.minY - previewBounds.y) * fitScale;
  updateLayerMatrices(displayed, originX, originY, fitScale);
  for (const [id, shadow] of shadowMeshes) {
    const layer = previewLayers.find((entry) => entry.id === id);
    if (!layer) continue;
    const width = shadow.width * fitScale / shadow.scale, height = shadow.height * fitScale / shadow.scale;
    const centerX = originX + (layer.x - previewBounds.x) * fitScale + layer.width * fitScale / 2 - canvasWidth / 2;
    const centerY = canvasHeight / 2 - (originY + (layer.y - previewBounds.y) * fitScale + layer.height * fitScale / 2);
    const [a, b, c, d] = displayed.matrix;
    shadow.mesh.matrix.set(a * width, -c * height, 0, centerX, -b * width, d * height, 0, centerY, 0, 0, 1, -0.5, 0, 0, 0, 1);
    shadow.mesh.matrixWorldNeedsUpdate = true;
  }
  for (const [id, body] of bodyMeshes) {
    const layer = previewLayers.find((entry) => entry.id === id);
    if (!layer) continue;
    const ratio = fitScale / body.scale;
    const left = originX + (layer.x - previewBounds.x) * fitScale + body.offsetX * ratio;
    const top = originY + (layer.y - previewBounds.y) * fitScale + body.offsetY * ratio;
    const x = left + body.width * ratio / 2 - canvasWidth / 2;
    const y = canvasHeight / 2 - top - body.height * ratio / 2;
    body.mesh.matrix.set(body.width * ratio, 0, 0, x, 0, body.height * ratio, 0, y, 0, 0, 1, -1, 0, 0, 0, 1);
    body.mesh.matrixWorldNeedsUpdate = true;
    body.mesh.visible = displayed.depth > 0.05;
  }
  for (const shadow of shadowMeshes.values()) shadow.mesh.visible = isPerspectiveView() && settings.shadowOpacity > 0;
  renderScene();
}

async function loadLayerPreview(payload: PreviewMessage): Promise<void> {
  const revision = ++previewLoadRevision;
  cancelAnimationFrame(previewAnimation);
  previewAnimation = 0;
  lastBodyBuild = 0;
  clearMeshes(layerMeshes);
  for (const [id, body] of bodyMeshes) {
    scene.remove(body.mesh); body.mesh.geometry.dispose();
    const material = body.mesh.material as THREE.MeshBasicMaterial; material.map?.dispose(); material.dispose();
    bodyMeshes.delete(id);
  }
  previewLayers = [];
  previewBounds = payload.bounds || null;
  drawLayerPreview();
  const loaded = await Promise.all((payload.nodes || []).map(async (entry): Promise<PreviewLayer | null> => {
    try {
      const bytes = Uint8Array.from(entry.bytes);
      const blob = new Blob([bytes.buffer], { type: 'image/png' });
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Image decode failed'));
        image.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);
      return { ...entry, image };
    } catch {
      return null;
    }
  }));
  if (revision !== previewLoadRevision) return;
  previewLayers = loaded.filter((layer): layer is PreviewLayer => layer !== null);
  cancelAnimationFrame(previewAnimation);
  previewAnimation = 0;
  previewVisual = targetPreviewVisual();
  previewTarget = previewVisual;
  rebuildBodyMeshes(previewVisual);
  refreshOverlays();
  drawLayerPreview();
}

async function canvasBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not encode extrusion image')), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

async function buildExtrusions(): Promise<Array<{ id: string; bytes: Uint8Array; x: number; y: number; width: number; height: number }>> {
  const iso = isIsometric();
  const depth = iso ? settings.depth : settings.extrusionDepth;
  if (depth <= 0 || !previewLayers.length || !previewBounds) return [];
  const matrix = previewMatrix();
  const angle = iso ? isometricExtrusionAngle() : settings.extrusionAngle;
  const result = [];
  for (const layer of previewLayers) {
    const dx = Math.cos(angle * Math.PI / 180) * depth * layer.scale;
    const dy = Math.sin(angle * Math.PI / 180) * depth * layer.scale;
    const body = makeSolidExtrusion(layer.image, layer.image.naturalWidth, layer.image.naturalHeight, matrix, dx, dy);
    result.push({ id: layer.id, bytes: await canvasBytes(body.canvas), x: layer.x + body.x / layer.scale, y: layer.y + body.y / layer.scale, width: body.canvas.width / layer.scale, height: body.canvas.height / layer.scale });
  }
  return result;
}

function emitPreview(): void {
  animatePreview();
  post({ type: 'preview', settings: { ...settings } });
}

function setMode(mode: Mode): void {
  settings.mode = mode;
  document.querySelectorAll<HTMLButtonElement>('.mode').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  $('isometric-panel').hidden = mode !== 'isometric';
  $('perspective-panel').hidden = mode !== 'perspective';
  if (mode === 'perspective') drawPerspectiveControls();
  emitPreview();
}

function setPanel(panel: Panel): void {
  settings.panel = panel;
  document.querySelectorAll<HTMLButtonElement>('.subtab').forEach((button) => button.classList.toggle('active', button.dataset.panel === panel));
  drawPerspectiveControls();
  emitPreview();
}

function drawPerspectiveControls(): void {
  const container = $('perspective-controls');
  document.querySelectorAll<HTMLButtonElement>('.subtab').forEach((button) => button.classList.toggle('active', button.dataset.panel === settings.panel));
  container.innerHTML = controls[settings.panel].map((control) => `<label class="control"><span class="label">${control.label}</span><input type="range" min="${control.min}" max="${control.max}" step="${control.step || 1}" value="${settings[control.key]}" data-key="${control.key}"><output data-output="${control.key}">${formatValue(control.key, Number(settings[control.key]))}</output></label>`).join('')
    + (settings.panel === '3d' ? '<p class="helper">Rotates around each layer’s center. X tilts vertically, Y turns sideways, and Z spins in the canvas.</p>' : '');
  bindRangeInputs(container);
}

function setAngle(value: number, syncInput = true): void {
  settings.angle = Math.max(-180, Math.min(180, Math.round(value)));
  ($<HTMLInputElement>('angle-range')).value = String(settings.angle);
  if (syncInput) ($<HTMLInputElement>('angle-input')).value = String(settings.angle);
  document.querySelectorAll<HTMLButtonElement>('.quick').forEach((button) => button.classList.toggle('active', Number(button.dataset.angle) === settings.angle));
  emitPreview();
}

function bindRangeInputs(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement>('input[type="range"][data-key]').forEach((input) => {
    input.oninput = () => {
      const key = input.dataset.key as keyof Settings;
      const next = Number(input.value);
      if (key === 'angle') { setAngle(next); return; }
      (settings as unknown as Record<string, number | string>)[key] = next;
      const output = root.querySelector<HTMLOutputElement>(`output[data-output="${key}"]`) || document.querySelector<HTMLOutputElement>(`output[data-output="${key}"]`);
      if (output) output.textContent = formatValue(key, next);
      emitPreview();
    };
  });
}

document.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('button') : null;
  if (!button) return;
  button.classList.remove('clicked');
  void button.offsetWidth;
  button.classList.add('clicked');
}, true);
document.addEventListener('animationend', (event) => {
  if (event.target instanceof HTMLButtonElement) event.target.classList.remove('clicked');
});

document.querySelectorAll<HTMLButtonElement>('.mode').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode as Mode)));
document.querySelectorAll<HTMLButtonElement>('.subtab').forEach((button) => button.addEventListener('click', () => setPanel(button.dataset.panel as Panel)));
document.querySelectorAll<HTMLButtonElement>('.direction').forEach((button) => button.addEventListener('click', () => {
  settings.direction = button.dataset.direction as Direction;
  document.querySelectorAll('.direction').forEach((item) => item.classList.toggle('active', item === button));
  emitPreview();
}));
document.querySelectorAll<HTMLButtonElement>('.quick').forEach((button) => button.addEventListener('click', () => {
  setAngle(Number(button.dataset.angle));
}));

const angleInput = $<HTMLInputElement>('angle-input');
angleInput.addEventListener('input', () => {
  const value = angleInput.valueAsNumber;
  if (Number.isInteger(value) && value >= -180 && value <= 180) setAngle(value, false);
});
angleInput.addEventListener('change', () => {
  const value = angleInput.valueAsNumber;
  setAngle(Number.isFinite(value) ? value : settings.angle);
});

function resetAll(): void {
  cancelAnimationFrame(previewAnimation);
  previewAnimation = 0;
  lastBodyBuild = 0;
  Object.assign(settings, defaults);
  showIsometricGrid = false;
  const gridButton = $('generate-grid');
  gridButton.textContent = 'Show 3D cube grid';
  gridButton.setAttribute('aria-pressed', 'false');
  gridButton.classList.remove('selected');
  document.querySelectorAll('.mode').forEach((button) => button.classList.toggle('active', (button as HTMLElement).dataset.mode === 'isometric'));
  document.querySelectorAll('.direction').forEach((button) => button.classList.toggle('active', (button as HTMLElement).dataset.direction === 'right'));
  document.querySelectorAll('.quick').forEach((button) => button.classList.toggle('active', (button as HTMLElement).dataset.angle === '0'));
  $('isometric-panel').hidden = false; $('perspective-panel').hidden = true;
  $('live-state').textContent = 'LIVE';
  document.querySelectorAll<HTMLInputElement>('input[data-key]').forEach((input) => {
    const key = input.dataset.key as keyof Settings;
    const next = defaults[key];
    if (typeof next === 'number') input.value = String(next);
  });
  document.querySelectorAll<HTMLOutputElement>('output[data-output]').forEach((output) => {
    const key = output.dataset.output as keyof Settings;
    const next = defaults[key];
    if (typeof next === 'number') output.textContent = formatValue(key, next);
  });
  drawPerspectiveControls();
  $('toast').classList.remove('show');
  previewVisual = targetPreviewVisual();
  previewTarget = previewVisual;
  rebuildBodyMeshes(previewVisual);
  refreshOverlays();
  drawLayerPreview();
  post({ type: 'reset' });
}

$('reset').addEventListener('click', resetAll);
$('apply').addEventListener('click', () => {
  const button = $('apply') as HTMLButtonElement;
  button.disabled = true;
  void buildExtrusions().then((extrusions) => post({ type: 'apply', settings: { ...settings }, extrusions })).catch((error: unknown) => showToast(error instanceof Error ? error.message : 'Could not prepare extrusion')).finally(() => { button.disabled = false; });
});
$('generate-grid').addEventListener('click', () => {
  showIsometricGrid = !showIsometricGrid;
  const button = $('generate-grid');
  button.textContent = showIsometricGrid ? 'Hide 3D cube grid' : 'Show 3D cube grid';
  button.setAttribute('aria-pressed', String(showIsometricGrid));
  button.classList.toggle('selected', showIsometricGrid);
  refreshOverlays();
  drawLayerPreview();
});
$('close').addEventListener('click', () => post({ type: 'cancel' }));
window.onmessage = (event: MessageEvent<{ pluginMessage?: { type: string; count?: number; text?: string } & PreviewMessage }>) => {
  const message = event.data.pluginMessage;
  if (!message) return;
  if (message.type === 'layer-preview') void loadLayerPreview(message);
  if (message.type === 'selection') {
    const count = Number(message.count || 0);
    $('selection').textContent = `${count} selected`;
    $('selection').classList.toggle('ready', count > 0);
    $('selection-text').textContent = count ? 'Showing the selected layers in this preview' : 'Choose layers on the canvas';
  }
  if (message.type === 'preview-state') $('live-state').textContent = message.text || 'LIVE';
  if (message.type === 'notice') showToast(message.text || String(message.count || 'Done'));
};

bindRangeInputs();
drawPerspectiveControls();
drawLayerPreview();
