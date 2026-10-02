import { mkdir } from 'node:fs/promises';

const templatePath = 'ui.template.html';
const iconPath = 'icon.svg';
const outputPath = 'dist/ui.html';

const build = await Bun.build({
  entrypoints: ['ui.ts'],
  target: 'browser',
  minify: true,
  sourcemap: 'none',
  write: false,
});

if (!build.success) {
  for (const log of build.logs) console.error(log);
  throw new Error('Could not bundle the Figma plugin UI.');
}

const htmlTemplate = await Bun.file(templatePath).text();
const icon = await Bun.file(iconPath).text();
const bundleOutput = build.outputs.find((output) => output.path.endsWith('.js'));
if (!bundleOutput) throw new Error('The UI bundle output was not generated.');
const bundle = await bundleOutput.text();
const bundleMarker = '<!-- BUN_UI_BUNDLE -->';
const iconMarker = '<!-- APP_ICON -->';

if (!htmlTemplate.includes(bundleMarker)) {
  throw new Error(`Missing ${bundleMarker} in ${templatePath}.`);
}
if (!htmlTemplate.includes(iconMarker)) {
  throw new Error(`Missing ${iconMarker} in ${templatePath}.`);
}

const inlineScript = `<script>\n${bundle}\n</script>`;
await mkdir('dist', { recursive: true });
await Bun.write(outputPath, htmlTemplate.replace(iconMarker, icon).replace(bundleMarker, inlineScript));
console.log(`Built self-contained ${outputPath} from ${templatePath}, ${iconPath}, and ui.ts.`);
