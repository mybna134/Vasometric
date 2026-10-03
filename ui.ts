import * as THREE from 'three';

type Mode = 'isometric' | 'perspective';
type Panel = 'skew' | '3d' | 'camera' | 'extrusion' | 'shadow';
type Direction = 'left' | 'top-left' | 'right' | 'top-right';
type Settings = {
  mode: Mode; panel: Panel; direction: Direction; angle: number; depth: number;
  skewX: number; skewY: number; rotateX: number; rotateY: number; rotateZ: number; perspective: number;
  yaw: number; pitch: number; fov: number; extrusionDepth: number; extrusionAngle: number; extrusionSteps: number;
  outlineBase: boolean; backFace: boolean; extrusionColor: string; outlineColor: string;
  shadowX: number; shadowY: number; shadowBlur: number; shadowOpacity: number;
};
type ExtrusionStyle = Pick<Settings, 'outlineBase' | 'backFace' | 'extrusionColor' | 'outlineColor'>;
type ColorKey = 'extrusionColor' | 'outlineColor';
type Control = { label: string; key: keyof Settings; min: number; max: number; value: number; suffix?: string; step?: number };
type PreviewLayerData = { id: string; bytes: Uint8Array; x: number; y: number; width: number; height: number; scale: number };
type PreviewLayer = PreviewLayerData & { image: HTMLImageElement };
type PreviewMessage = { nodes?: PreviewLayerData[]; bounds?: { x: number; y: number; width: number; height: number } | null };
type PreviewVisual = { matrix: [number, number, number, number]; dx: number; dy: number; depth: number; angle: number; scale: number; planeAngle: number; isoDirection: Direction | null };
type TracedPath = { path: string; x: number; y: number };
type ExtrusionVector = { id: string; body: TracedPath | null; outline: TracedPath | null; dx: number; dy: number };
type Language = 'en' | 'zh-CN';

const translations: Record<Language, Record<string, string>> = {
  en: {
    'aria.transformMode': 'Transform mode', 'aria.preview': 'Selected layer transform preview', 'aria.angle': 'Angle in degrees', 'aria.perspectiveTools': 'Perspective tools',
    'mode.axonometric': 'Axonometric', 'mode.perspective': 'Perspective', canvasPreview: 'Canvas preview', emptyPreview: 'Select a layer to see its live preview', chooseLayers: 'Choose layers on the canvas',
    'direction.left': '← Left', 'direction.topLeft': '↙ Top left', 'direction.right': 'Right →', 'direction.topRight': 'Top right ↘', angle: 'Angle', snap: 'Snap', extrudeDepth: 'Extrude depth',
    showGrid: 'Show 3D cube grid', hideGrid: 'Hide 3D cube grid', 'panel.skew': 'Skew', 'panel.camera': 'Camera', 'panel.extrude': 'Extrude', 'panel.shadow': 'Shadow', reset: 'Reset preview', restore: 'Restore original', apply: 'Apply to selection',
    'control.skewX': 'Skew X', 'control.skewY': 'Skew Y', 'control.rotateX': 'Rotate X', 'control.rotateY': 'Rotate Y', 'control.rotateZ': 'Rotate Z', 'control.perspective': 'Perspective',
    'control.yaw': 'Camera yaw', 'control.pitch': 'Camera pitch', 'control.fov': 'Field of view', 'control.extrusionDepth': 'Depth', 'control.extrusionAngle': 'Direction', 'control.extrusionSteps': 'Segments',
    'control.shadowX': 'Offset X', 'control.shadowY': 'Offset Y', 'control.shadowBlur': 'Softness', 'control.shadowOpacity': 'Opacity',
    outlineBase: 'Outline base', backFace: 'Back face', extrusionColor: 'Extrusion color', outlineColor: 'Outline color', pickerLabel: 'Color picker', pickerSv: 'Saturation and brightness', pickerHue: 'Hue', pickerAlpha: 'Opacity', pickerClose: 'Close color picker', materialColors: 'Material colors',
    rotateHelp: 'Rotates around each layer’s center. X tilts vertically, Y turns sideways, and Z spins in the canvas.',
    selected: '{count} selected', selectionReady: 'Showing the selected layers in this preview', chooseLayersToast: 'Select one or more layers on the canvas first', applied: 'Applied to {count} layer(s){extrusions}', addedExtrusions: ' · added {count} solid extrusion(s)', applyFailed: 'Apply failed: {detail}', actionFailed: 'Action failed: {detail}', previewReset: 'Preview reset',
    restored: 'Restored {count} layer(s)', noSavedTransform: 'No saved transform for the selected layers', encodeFailed: 'Could not prepare extrusion', done: 'Done',
  },
  'zh-CN': {
    'aria.transformMode': '变换模式', 'aria.preview': '所选图层变换预览', 'aria.angle': '角度（度）', 'aria.perspectiveTools': '透视工具',
    'mode.axonometric': '等轴测', 'mode.perspective': '透视', canvasPreview: '画布预览', emptyPreview: '选择图层以查看实时预览', chooseLayers: '请在画布上选择图层',
    'direction.left': '← 左侧', 'direction.topLeft': '↙ 左上', 'direction.right': '右侧 →', 'direction.topRight': '右上 ↘', angle: '角度', snap: '快捷角度', extrudeDepth: '挤出深度',
    showGrid: '显示 3D 立方体网格', hideGrid: '隐藏 3D 立方体网格', 'panel.skew': '倾斜', 'panel.camera': '相机', 'panel.extrude': '挤出', 'panel.shadow': '阴影', reset: '重置预览', restore: '恢复原状', apply: '应用到所选图层',
    'control.skewX': 'X 轴倾斜', 'control.skewY': 'Y 轴倾斜', 'control.rotateX': '绕 X 轴旋转', 'control.rotateY': '绕 Y 轴旋转', 'control.rotateZ': '绕 Z 轴旋转', 'control.perspective': '透视强度',
    'control.yaw': '相机偏航角', 'control.pitch': '相机俯仰角', 'control.fov': '视野角度', 'control.extrusionDepth': '深度', 'control.extrusionAngle': '方向', 'control.extrusionSteps': '分段数',
    'control.shadowX': 'X 轴偏移', 'control.shadowY': 'Y 轴偏移', 'control.shadowBlur': '柔化程度', 'control.shadowOpacity': '不透明度',
    outlineBase: '底面描边', backFace: '背面', extrusionColor: '挤出颜色', outlineColor: '描边颜色', pickerLabel: '颜色选择器', pickerSv: '饱和度和明度', pickerHue: '色相', pickerAlpha: '不透明度', pickerClose: '关闭颜色选择器', materialColors: 'Material 配色',
    rotateHelp: '围绕每个图层的中心旋转。X 轴控制垂直倾斜，Y 轴控制侧向旋转，Z 轴控制画布平面内旋转。',
    selected: '已选择 {count} 个图层', selectionReady: '正在预览所选图层', chooseLayersToast: '请先在画布上选择一个或多个图层', applied: '已应用到 {count} 个图层{extrusions}', addedExtrusions: ' · 已添加 {count} 个实体挤出效果', applyFailed: '应用失败：{detail}', actionFailed: '操作失败：{detail}', previewReset: '已重置预览',
    restored: '已恢复 {count} 个图层', noSavedTransform: '所选图层没有可恢复的变换', encodeFailed: '无法生成挤出效果', done: '完成',
  },
};

function detectLanguage(): Language {
  try {
    const saved = localStorage.getItem('vasometric-language');
    if (saved === 'en' || saved === 'zh-CN') return saved;
  } catch { /* Storage may be unavailable in the plugin iframe. */ }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}
let language: Language = detectLanguage();
let selectionCount = 0;

function t(key: string, values: Record<string, string | number> = {}): string {
  return (translations[language][key] || translations.en[key] || key).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));
}

function normalizeHex8(value: string): string | null {
  const hex = value.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(hex)) return null;
  return `#${(hex.length === 6 ? `${hex}FF` : hex).toUpperCase()}`;
}

function colorChannels(hex8: string): [number, number, number, number] {
  const hex = normalizeHex8(hex8) || '#000000FF';
  return [1, 3, 5, 7].map((index) => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number, number];
}

function rgbToHsv(red: number, green: number, blue: number): { hue: number; saturation: number; brightness: number } {
  const r = red / 255, g = green / 255, b = blue / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { hue, saturation: max ? delta / max : 0, brightness: max };
}

function hsvToRgb(hue: number, saturation: number, brightness: number): [number, number, number] {
  const chroma = brightness * saturation;
  const sector = ((hue % 360) + 360) % 360 / 60;
  const second = chroma * (1 - Math.abs(sector % 2 - 1));
  const basis: [number, number, number] = sector < 1 ? [chroma, second, 0] : sector < 2 ? [second, chroma, 0] : sector < 3 ? [0, chroma, second] : sector < 4 ? [0, second, chroma] : sector < 5 ? [second, 0, chroma] : [chroma, 0, second];
  return basis.map((channel) => Math.round((channel + brightness - chroma) * 255)) as [number, number, number];
}

function rgbToHex8(red: number, green: number, blue: number, alpha: number): string {
  return `#${[red, green, blue, alpha].map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function parseRgba(value: string): string | null {
  const match = value.trim().match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+%?))?\s*\)$/i);
  if (!match) return null;
  const channels = match.slice(1, 4).map(Number);
  if (channels.some((channel) => channel > 255)) return null;
  const alpha = match[4] ? (match[4].endsWith('%') ? Number(match[4].slice(0, -1)) / 100 : Number(match[4])) : 1;
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
  return `#${[...channels, Math.round(alpha * 255)].map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function colorToRgba(hex8: string): string {
  const channels = colorChannels(hex8);
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${channels[3] / 255})`;
}

function colorToRgbaLabel(hex8: string): string {
  const channels = colorChannels(hex8);
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${Number((channels[3] / 255).toFixed(3))})`;
}

function applyTranslations(): void {
  document.documentElement.lang = language;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (key) element.textContent = t(key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((element) => {
    const key = element.dataset.i18nAria;
    if (key) element.setAttribute('aria-label', t(key));
  });
  ($<HTMLSelectElement>('language-select')).value = language;
  $('selection').textContent = t('selected', { count: selectionCount });
  $('selection-text').textContent = t(selectionCount ? 'selectionReady' : 'chooseLayers');
  $('generate-grid').textContent = t(showIsometricGrid ? 'hideGrid' : 'showGrid');
  drawIsometricExtrusionOptions();
  if (settings.mode === 'perspective') drawPerspectiveControls();
  renderMaterialColors();
}

function setLanguage(next: Language): void {
  closeColorPicker();
  language = next;
  try { localStorage.setItem('vasometric-language', language); } catch { /* Storage may be unavailable in the plugin iframe. */ }
  applyTranslations();
}

function localizeNotice(message: string): string {
  if (message === 'Select one or more layers on the canvas first') return t('chooseLayersToast');
  if (message === 'Preview reset') return t('previewReset');
  if (message === 'No saved transform for the selected layers') return t('noSavedTransform');
  const restored = message.match(/^Restored (\d+) layers?$/);
  if (restored) return t('restored', { count: restored[1] });
  if (message === 'Could not prepare extrusion') return t('encodeFailed');
  const applied = message.match(/^Applied to (\d+) layers?(?: · added (\d+) solid extrusions?)?$/);
  if (applied) return t('applied', { count: applied[1], extrusions: applied[2] ? t('addedExtrusions', { count: applied[2] }) : '' });
  const failed = message.match(/^(Apply failed|Action failed):\s*(.*)$/);
  if (failed) return t(failed[1] === 'Apply failed' ? 'applyFailed' : 'actionFailed', { detail: failed[2] });
  return message;
}

const defaults: Settings = {
  mode: 'isometric', panel: 'skew', direction: 'right', angle: 0, depth: 0,
  skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, rotateZ: 0, perspective: 800,
  yaw: 0, pitch: 0, fov: 50, extrusionDepth: 0, extrusionAngle: 45, extrusionSteps: 8,
  outlineBase: false, backFace: false, extrusionColor: '#625D69FF', outlineColor: '#1D1B20FF',
  shadowX: 12, shadowY: 16, shadowBlur: 24, shadowOpacity: 0,
};
const settings: Settings = { ...defaults };
let activeColorKey: ColorKey | null = null;
let activeColorTrigger: HTMLButtonElement | null = null;
let pickerHue = 0, pickerSaturation = 0, pickerBrightness = 0;
const materialColors = [
  { hex: '#F44336', en: 'Red', zh: '红色' }, { hex: '#E91E63', en: 'Pink', zh: '粉色' },
  { hex: '#9C27B0', en: 'Purple', zh: '紫色' }, { hex: '#3F51B5', en: 'Indigo', zh: '靛蓝' },
  { hex: '#2196F3', en: 'Blue', zh: '蓝色' }, { hex: '#00BCD4', en: 'Cyan', zh: '青色' },
  { hex: '#009688', en: 'Teal', zh: '蓝绿' }, { hex: '#4CAF50', en: 'Green', zh: '绿色' },
  { hex: '#FFC107', en: 'Amber', zh: '琥珀' }, { hex: '#FF9800', en: 'Orange', zh: '橙色' },
];
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

function makeSolidExtrusion(image: HTMLImageElement, width: number, height: number, matrix: [number, number, number, number], dx: number, dy: number, style: ExtrusionStyle, maxSteps = 600): { canvas: HTMLCanvasElement; x: number; y: number } {
  const [a, b, c, d] = matrix;
  const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => [a * (x - width / 2) + c * (y - height / 2) + width / 2, b * (x - width / 2) + d * (y - height / 2) + height / 2]);
  const pad = style.outlineBase ? 5 : 2;
  const left = Math.floor(Math.min(...corners.map(([x]) => x), ...corners.map(([x]) => x + dx)) - pad);
  const top = Math.floor(Math.min(...corners.map(([, y]) => y), ...corners.map(([, y]) => y + dy)) - pad);
  const right = Math.ceil(Math.max(...corners.map(([x]) => x), ...corners.map(([x]) => x + dx)) + pad);
  const bottom = Math.ceil(Math.max(...corners.map(([, y]) => y), ...corners.map(([, y]) => y + dy)) + pad);
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, right - left); canvas.height = Math.max(1, bottom - top);
  const ctx = canvas.getContext('2d'); if (!ctx) return { canvas, x: left, y: top };
  const drawFace = (target: CanvasRenderingContext2D, offsetX: number, offsetY: number): void => {
    target.save();
    target.translate(width / 2 + offsetX - left, height / 2 + offsetY - top);
    target.transform(a, b, c, d, 0, 0);
    target.translate(-width / 2, -height / 2);
    target.drawImage(image, 0, 0, width, height);
    target.restore();
  };
  const steps = Math.min(maxSteps, Math.max(1, Math.ceil(Math.hypot(dx, dy) * 2)));
  for (let step = steps; step >= 0; step -= 1) drawFace(ctx, dx * step / steps, dy * step / steps);
  ctx.globalCompositeOperation = 'destination-out';
  drawFace(ctx, 0, 0);
  ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = colorToRgba(style.extrusionColor); ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  if (style.backFace || style.outlineBase) {
    const back = document.createElement('canvas'); back.width = canvas.width; back.height = canvas.height;
    const backCtx = back.getContext('2d');
    if (backCtx) {
      drawFace(backCtx, dx, dy);
      if (style.backFace) ctx.drawImage(back, 0, 0);
      if (style.outlineBase) {
        const outline = document.createElement('canvas'); outline.width = canvas.width; outline.height = canvas.height;
        const outlineCtx = outline.getContext('2d');
        if (outlineCtx) {
          for (let index = 0; index < 24; index += 1) {
            const angle = index * Math.PI / 12;
            outlineCtx.drawImage(back, Math.cos(angle) * 2, Math.sin(angle) * 2);
          }
          outlineCtx.globalCompositeOperation = 'source-in';
          outlineCtx.fillStyle = colorToRgba(style.outlineColor);
          outlineCtx.fillRect(0, 0, canvas.width, canvas.height);
          outlineCtx.globalCompositeOperation = 'destination-out';
          outlineCtx.drawImage(back, 0, 0);
          ctx.drawImage(outline, 0, 0);
        }
      }
    }
  }
  // The original Figma layer supplies the front face, so clear this bitmap there.
  ctx.globalCompositeOperation = 'destination-out';
  drawFace(ctx, 0, 0);
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
    const body = makeSolidExtrusion(layer.image, width, height, visual.matrix, visual.dx, visual.dy, settings, maxSteps);
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

function traceAlpha(canvas: HTMLCanvasElement, documentX: number, documentY: number, pixelsPerUnit: number): TracedPath | null {
  const sampleScale = Math.min(1, 768 / Math.max(canvas.width, canvas.height));
  const sample = document.createElement('canvas');
  sample.width = Math.max(1, Math.round(canvas.width * sampleScale));
  sample.height = Math.max(1, Math.round(canvas.height * sampleScale));
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not prepare extrusion');
  context.drawImage(canvas, 0, 0, sample.width, sample.height);
  const alpha = context.getImageData(0, 0, sample.width, sample.height).data;
  const width = sample.width, height = sample.height;
  const filled = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && alpha[(y * width + x) * 4 + 3] > 4;
  const edges = new Map<number, number[]>();
  const stride = width + 1;
  const add = (start: number, end: number): void => {
    const next = edges.get(start) || [];
    next.push(end);
    edges.set(start, next);
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!filled(x, y)) continue;
    const top = y * stride + x;
    if (!filled(x, y - 1)) add(top, top + 1);
    if (!filled(x + 1, y)) add(top + 1, top + stride + 1);
    if (!filled(x, y + 1)) add(top + stride + 1, top + stride);
    if (!filled(x - 1, y)) add(top + stride, top);
  }
  if (!edges.size) return null;
  const loops: number[][] = [];
  const direction = (start: number, end: number): number => end === start + 1 ? 0 : end === start + stride ? 1 : end === start - 1 ? 2 : 3;
  while (edges.size) {
    const start = edges.keys().next().value as number;
    const points = [start];
    let current = start, previousDirection = -1;
    do {
      const options = edges.get(current);
      if (!options?.length) break;
      const selected = previousDirection < 0 ? 0 : options.reduce((best, end, index) => {
        const turn = (direction(current, end) - previousDirection + 4) % 4;
        const bestTurn = (direction(current, options[best]) - previousDirection + 4) % 4;
        const rank = (value: number): number => value === 1 ? 0 : value === 0 ? 1 : value === 3 ? 2 : 3;
        return rank(turn) < rank(bestTurn) ? index : best;
      }, 0);
      const next = options.splice(selected, 1)[0];
      if (!options.length) edges.delete(current);
      previousDirection = direction(current, next);
      current = next;
      points.push(current);
    } while (current !== start);
    if (current === start && points.length > 3) loops.push(points);
  }
  if (!loops.length) return null;
  let minX = width, minY = height;
  for (const loop of loops) for (const point of loop) {
    minX = Math.min(minX, point % stride);
    minY = Math.min(minY, Math.floor(point / stride));
  }
  const unit = 1 / (sampleScale * pixelsPerUnit);
  const coordinate = (value: number): string => String(Number((value * unit).toFixed(3)));
  const paths = loops.map((loop) => {
    const vertices = loop.slice(0, -1);
    const simplified = vertices.filter((point, index) => {
      const before = vertices[(index + vertices.length - 1) % vertices.length];
      const after = vertices[(index + 1) % vertices.length];
      return (point % stride - before % stride) * (Math.floor(after / stride) - Math.floor(point / stride)) !== (Math.floor(point / stride) - Math.floor(before / stride)) * (after % stride - point % stride);
    });
    return simplified.map((point, index) => `${index ? 'L' : 'M'}${coordinate(point % stride - minX)} ${coordinate(Math.floor(point / stride) - minY)}`).join(' ') + ' Z';
  });
  return { path: paths.join(' '), x: documentX + minX * unit, y: documentY + minY * unit };
}

function projectedBackFace(layer: PreviewLayer, matrix: [number, number, number, number], dx: number, dy: number, body: { canvas: HTMLCanvasElement; x: number; y: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = body.canvas.width; canvas.height = body.canvas.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare extrusion');
  const width = layer.image.naturalWidth, height = layer.image.naturalHeight;
  context.translate(width / 2 + dx - body.x, height / 2 + dy - body.y);
  context.transform(matrix[0], matrix[1], matrix[2], matrix[3], 0, 0);
  context.translate(-width / 2, -height / 2);
  context.drawImage(layer.image, 0, 0, width, height);
  return canvas;
}

function buildExtrusions(): ExtrusionVector[] {
  const iso = isIsometric();
  const depth = iso ? settings.depth : settings.extrusionDepth;
  if (depth <= 0 || !previewLayers.length || !previewBounds) return [];
  const matrix = previewMatrix();
  const angle = iso ? isometricExtrusionAngle() : settings.extrusionAngle;
  const result = [];
  for (const layer of previewLayers) {
    const dx = Math.cos(angle * Math.PI / 180) * depth * layer.scale;
    const dy = Math.sin(angle * Math.PI / 180) * depth * layer.scale;
    const body = makeSolidExtrusion(layer.image, layer.image.naturalWidth, layer.image.naturalHeight, matrix, dx, dy, { ...settings, extrusionColor: '#FFFFFFFF', backFace: false, outlineBase: false });
    const originX = layer.x + body.x / layer.scale, originY = layer.y + body.y / layer.scale;
    const face = settings.outlineBase ? projectedBackFace(layer, matrix, dx, dy, body) : null;
    result.push({ id: layer.id, body: traceAlpha(body.canvas, originX, originY, layer.scale), outline: face ? traceAlpha(face, originX, originY, layer.scale) : null, dx: dx / layer.scale, dy: dy / layer.scale });
  }
  return result;
}

function emitPreview(): void {
  animatePreview();
}

function setMode(mode: Mode): void {
  closeColorPicker();
  settings.mode = mode;
  document.querySelectorAll<HTMLButtonElement>('.mode').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  $('isometric-panel').hidden = mode !== 'isometric';
  $('perspective-panel').hidden = mode !== 'perspective';
  if (mode === 'perspective') drawPerspectiveControls();
  emitPreview();
}

function setPanel(panel: Panel): void {
  closeColorPicker();
  settings.panel = panel;
  document.querySelectorAll<HTMLButtonElement>('.subtab').forEach((button) => button.classList.toggle('active', button.dataset.panel === panel));
  drawPerspectiveControls();
  emitPreview();
}

function extrusionOptionsMarkup(): string {
  return `<div class="extrusion-options">
    <div class="extrusion-toggles">
      <label class="option-toggle"><input type="checkbox" data-extrusion-option="outlineBase" ${settings.outlineBase ? 'checked' : ''}><span>${t('outlineBase')}</span></label>
      <label class="option-toggle"><input type="checkbox" data-extrusion-option="backFace" ${settings.backFace ? 'checked' : ''}><span>${t('backFace')}</span></label>
    </div>
    ${colorControlMarkup('extrusionColor')}
    ${colorControlMarkup('outlineColor')}
  </div>`;
}

function colorControlMarkup(key: ColorKey): string {
  return `<div class="color-control"><span>${t(key)}</span><button type="button" class="color-trigger" data-color-key="${key}" aria-controls="color-popover" aria-expanded="false" aria-label="${t(key)} ${settings[key]}"><span class="color-swatch" aria-hidden="true"><span class="color-swatch-fill" style="background-color:${colorToRgba(settings[key])}"></span></span><span class="color-value">${settings[key]}</span></button></div>`;
}

function syncExtrusionInputs(): void {
  document.querySelectorAll<HTMLInputElement>('input[data-extrusion-option]').forEach((input) => {
    const key = input.dataset.extrusionOption as 'outlineBase' | 'backFace';
    input.checked = settings[key];
  });
  document.querySelectorAll<HTMLButtonElement>('[data-color-key]').forEach((button) => {
    const key = button.dataset.colorKey as ColorKey;
    const value = settings[key];
    const fill = button.querySelector<HTMLElement>('.color-swatch-fill');
    const label = button.querySelector<HTMLElement>('.color-value');
    if (fill) fill.style.backgroundColor = colorToRgba(value);
    if (label) label.textContent = value;
    button.setAttribute('aria-label', `${t(key)} ${value}`);
    button.setAttribute('aria-expanded', String(button === activeColorTrigger));
  });
}

function bindExtrusionOptions(root: ParentNode): void {
  root.querySelectorAll<HTMLInputElement>('input[data-extrusion-option]').forEach((input) => {
    input.oninput = () => {
      const key = input.dataset.extrusionOption as 'outlineBase' | 'backFace';
      settings[key] = input.checked;
      syncExtrusionInputs();
      emitPreview();
    };
  });
}

function drawIsometricExtrusionOptions(): void {
  const container = $('isometric-extrusion-options');
  container.innerHTML = extrusionOptionsMarkup();
  bindExtrusionOptions(container);
  syncExtrusionInputs();
}

function closeColorPicker(): void {
  $('color-popover').hidden = true;
  activeColorTrigger?.setAttribute('aria-expanded', 'false');
  activeColorTrigger = null;
  activeColorKey = null;
}

function renderMaterialColors(): void {
  $('picker-material-colors').innerHTML = materialColors.map((color) => `<button type="button" data-material-color="${color.hex}" style="background-color:${color.hex}" aria-label="Material ${language === 'zh-CN' ? color.zh : color.en}" aria-pressed="false" title="Material ${language === 'zh-CN' ? color.zh : color.en}"></button>`).join('');
}

function refreshColorPicker(): void {
  if (!activeColorKey) return;
  const color = settings[activeColorKey];
  const [red, green, blue, alpha] = colorChannels(color);
  $('picker-title').textContent = t(activeColorKey);
  ($<HTMLInputElement>('picker-hex')).value = color;
  ($<HTMLInputElement>('picker-hex')).removeAttribute('aria-invalid');
  ($<HTMLInputElement>('picker-rgba')).value = colorToRgbaLabel(color);
  ($<HTMLInputElement>('picker-rgba')).removeAttribute('aria-invalid');
  ($<HTMLInputElement>('picker-red')).value = String(red);
  ($<HTMLInputElement>('picker-green')).value = String(green);
  ($<HTMLInputElement>('picker-blue')).value = String(blue);
  ($<HTMLInputElement>('picker-alpha-value')).value = String(Math.round(alpha / 255 * 100));
  for (const id of ['picker-red', 'picker-green', 'picker-blue', 'picker-alpha-value']) ($<HTMLInputElement>(id)).removeAttribute('aria-invalid');
  ($<HTMLInputElement>('picker-hue')).value = String(Math.round(pickerHue));
  ($<HTMLInputElement>('picker-alpha')).value = String(alpha);
  ($('picker-sv') as HTMLElement).style.backgroundColor = `hsl(${pickerHue} 100% 50%)`;
  ($('picker-sv-thumb') as HTMLElement).style.left = `${pickerSaturation * 100}%`;
  ($('picker-sv-thumb') as HTMLElement).style.top = `${(1 - pickerBrightness) * 100}%`;
  ($('picker-alpha-gradient') as HTMLElement).style.background = `linear-gradient(to right, rgba(${red}, ${green}, ${blue}, 0), rgb(${red}, ${green}, ${blue}))`;
  ($('picker-swatch-fill') as HTMLElement).style.backgroundColor = colorToRgba(color);
  document.querySelectorAll<HTMLButtonElement>('[data-material-color]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.materialColor === color.slice(0, 7))));
}

function openColorPicker(key: ColorKey, trigger: HTMLButtonElement): void {
  if (activeColorTrigger === trigger) { closeColorPicker(); return; }
  closeColorPicker();
  activeColorKey = key;
  activeColorTrigger = trigger;
  const [red, green, blue] = colorChannels(settings[key]);
  const hsv = rgbToHsv(red, green, blue);
  pickerHue = hsv.hue; pickerSaturation = hsv.saturation; pickerBrightness = hsv.brightness;
  const popover = $('color-popover');
  popover.hidden = false;
  refreshColorPicker();
  const bounds = trigger.getBoundingClientRect();
  const left = Math.max(12, Math.min(bounds.right - popover.offsetWidth, window.innerWidth - popover.offsetWidth - 12));
  const below = bounds.bottom + 8;
  const top = below + popover.offsetHeight <= window.innerHeight - 12 ? below : Math.max(12, bounds.top - popover.offsetHeight - 8);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  trigger.setAttribute('aria-expanded', 'true');
  ($<HTMLInputElement>('picker-hex')).focus();
  ($<HTMLInputElement>('picker-hex')).select();
}

function setActiveColor(value: string, preservePickerAxes = false): void {
  if (!activeColorKey) return;
  const color = normalizeHex8(value);
  if (!color) return;
  settings[activeColorKey] = color;
  if (!preservePickerAxes) {
    const [red, green, blue] = colorChannels(color);
    const hsv = rgbToHsv(red, green, blue);
    if (hsv.saturation) pickerHue = hsv.hue;
    pickerSaturation = hsv.saturation; pickerBrightness = hsv.brightness;
  }
  syncExtrusionInputs();
  refreshColorPicker();
  emitPreview();
}

function applyPickerHsv(): void {
  if (!activeColorKey) return;
  const [red, green, blue] = hsvToRgb(pickerHue, pickerSaturation, pickerBrightness);
  const alpha = colorChannels(settings[activeColorKey])[3];
  setActiveColor(rgbToHex8(red, green, blue, alpha), true);
}

function drawPerspectiveControls(): void {
  const container = $('perspective-controls');
  document.querySelectorAll<HTMLButtonElement>('.subtab').forEach((button) => button.classList.toggle('active', button.dataset.panel === settings.panel));
  container.innerHTML = controls[settings.panel].map((control) => `<label class="control"><span class="label">${t(`control.${control.key}`)}</span><input type="range" min="${control.min}" max="${control.max}" step="${control.step || 1}" value="${settings[control.key]}" data-key="${control.key}"><output data-output="${control.key}">${formatValue(control.key, Number(settings[control.key]))}</output></label>`).join('')
    + (settings.panel === '3d' ? `<p class="helper">${t('rotateHelp')}</p>` : '')
    + (settings.panel === 'extrusion' ? extrusionOptionsMarkup() : '');
  bindRangeInputs(container);
  bindExtrusionOptions(container);
  syncExtrusionInputs();
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
  closeColorPicker();
  cancelAnimationFrame(previewAnimation);
  previewAnimation = 0;
  lastBodyBuild = 0;
  Object.assign(settings, defaults);
  showIsometricGrid = false;
  const gridButton = $('generate-grid');
  gridButton.textContent = t('showGrid');
  gridButton.setAttribute('aria-pressed', 'false');
  gridButton.classList.remove('selected');
  document.querySelectorAll('.mode').forEach((button) => button.classList.toggle('active', (button as HTMLElement).dataset.mode === 'isometric'));
  document.querySelectorAll('.direction').forEach((button) => button.classList.toggle('active', (button as HTMLElement).dataset.direction === 'right'));
  document.querySelectorAll('.quick').forEach((button) => button.classList.toggle('active', (button as HTMLElement).dataset.angle === '0'));
  $('isometric-panel').hidden = false; $('perspective-panel').hidden = true;
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
  drawIsometricExtrusionOptions();
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
$('restore').addEventListener('click', () => post({ type: 'restore' }));
$('apply').addEventListener('click', () => {
  const button = $('apply') as HTMLButtonElement;
  button.disabled = true;
  try { post({ type: 'apply', settings: { ...settings }, extrusions: buildExtrusions() }); }
  catch (error) { showToast(error instanceof Error ? error.message : t('encodeFailed')); }
  finally { button.disabled = false; }
});
$('generate-grid').addEventListener('click', () => {
  showIsometricGrid = !showIsometricGrid;
  const button = $('generate-grid');
  button.textContent = t(showIsometricGrid ? 'hideGrid' : 'showGrid');
  button.setAttribute('aria-pressed', String(showIsometricGrid));
  button.classList.toggle('selected', showIsometricGrid);
  refreshOverlays();
  drawLayerPreview();
});
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const trigger = target.closest<HTMLButtonElement>('[data-color-key]');
  if (trigger) { openColorPicker(trigger.dataset.colorKey as ColorKey, trigger); return; }
  const material = target.closest<HTMLButtonElement>('[data-material-color]');
  if (material && activeColorKey) {
    setActiveColor(`${material.dataset.materialColor}${settings[activeColorKey].slice(7)}`);
    return;
  }
  if (!$('color-popover').contains(target)) closeColorPicker();
});
$('picker-close').addEventListener('click', closeColorPicker);
($<HTMLInputElement>('picker-hue')).addEventListener('input', (event) => {
  pickerHue = Number((event.currentTarget as HTMLInputElement).value);
  applyPickerHsv();
});
($<HTMLInputElement>('picker-alpha')).addEventListener('input', (event) => {
  if (!activeColorKey) return;
  const alpha = Number((event.currentTarget as HTMLInputElement).value).toString(16).padStart(2, '0').toUpperCase();
  setActiveColor(`${settings[activeColorKey].slice(0, 7)}${alpha}`, true);
});
const saturationPicker = $('picker-sv');
let saturationPointer: number | null = null;
function updateSaturationPicker(event: PointerEvent): void {
  const bounds = saturationPicker.getBoundingClientRect();
  pickerSaturation = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  pickerBrightness = 1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
  applyPickerHsv();
}
saturationPicker.addEventListener('pointerdown', (event) => {
  saturationPointer = event.pointerId;
  saturationPicker.setPointerCapture(event.pointerId);
  updateSaturationPicker(event);
});
saturationPicker.addEventListener('pointermove', (event) => {
  if (event.pointerId === saturationPointer) updateSaturationPicker(event);
});
saturationPicker.addEventListener('pointerup', () => { saturationPointer = null; });
saturationPicker.addEventListener('pointercancel', () => { saturationPointer = null; });
saturationPicker.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? .1 : .01;
  if (event.key === 'ArrowLeft') pickerSaturation = Math.max(0, pickerSaturation - step);
  else if (event.key === 'ArrowRight') pickerSaturation = Math.min(1, pickerSaturation + step);
  else if (event.key === 'ArrowUp') pickerBrightness = Math.min(1, pickerBrightness + step);
  else if (event.key === 'ArrowDown') pickerBrightness = Math.max(0, pickerBrightness - step);
  else return;
  event.preventDefault();
  applyPickerHsv();
});
(['red', 'green', 'blue', 'alpha-value'] as const).forEach((channel) => {
  const input = $<HTMLInputElement>(`picker-${channel}`);
  input.addEventListener('change', () => {
    if (!activeColorKey) return;
    const value = Number(input.value);
    const maximum = channel === 'alpha-value' ? 100 : 255;
    if (!input.value.trim() || !Number.isInteger(value) || value < 0 || value > maximum) { input.setAttribute('aria-invalid', 'true'); return; }
    const [red, green, blue, alpha] = colorChannels(settings[activeColorKey]);
    const next = channel === 'red' ? [value, green, blue, alpha] : channel === 'green' ? [red, value, blue, alpha] : channel === 'blue' ? [red, green, value, alpha] : [red, green, blue, Math.round(value / 100 * 255)];
    setActiveColor(rgbToHex8(next[0], next[1], next[2], next[3]), channel === 'alpha-value');
    input.removeAttribute('aria-invalid');
  });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') input.blur(); });
});
function bindColorTextField(id: string, parse: (value: string) => string | null): void {
  const input = $<HTMLInputElement>(id);
  input.addEventListener('change', () => {
    const color = parse(input.value);
    if (color) setActiveColor(color);
    else input.setAttribute('aria-invalid', 'true');
  });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') input.blur(); });
}
bindColorTextField('picker-hex', normalizeHex8);
bindColorTextField('picker-rgba', parseRgba);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !activeColorKey) return;
  const trigger = activeColorTrigger;
  closeColorPicker();
  trigger?.focus();
});
$('app').querySelector('main')?.addEventListener('scroll', closeColorPicker);
window.addEventListener('resize', closeColorPicker);
($<HTMLSelectElement>('language-select')).addEventListener('change', (event) => setLanguage((event.currentTarget as HTMLSelectElement).value as Language));
window.onmessage = (event: MessageEvent<{ pluginMessage?: { type: string; count?: number; restorable?: number; text?: string } & PreviewMessage }>) => {
  const message = event.data.pluginMessage;
  if (!message) return;
  if (message.type === 'layer-preview') void loadLayerPreview(message);
  if (message.type === 'selection') {
    selectionCount = Number(message.count || 0);
    ($<HTMLButtonElement>('restore')).disabled = !message.restorable;
    $('selection').textContent = t('selected', { count: selectionCount });
    $('selection').classList.toggle('ready', selectionCount > 0);
    $('selection-text').textContent = t(selectionCount ? 'selectionReady' : 'chooseLayers');
  }
  if (message.type === 'notice') showToast(localizeNotice(message.text || String(message.count || t('done'))));
};

applyTranslations();
bindRangeInputs();
drawPerspectiveControls();
drawLayerPreview();
