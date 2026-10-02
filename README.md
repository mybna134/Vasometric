<div align="center">
  <p><img src="icon.svg" width="72" height="72" alt=""> <img src="readme-wordmark.svg" width="430" height="72" alt="Vasometric"></p>
  <p align="right">Figma 等轴测与透视绘图工具</p>
  <p>
  <a href="https://github.com/mybna134/Vasometric/releases/latest"><img src="https://img.shields.io/github/v/release/mybna134/Vasometric?style=flat-square&label=Latest%20Release&logo=github" alt="Latest release"></a>
  <a href="https://github.com/mybna134/Vasometric/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/mybna134/Vasometric/release.yml?style=flat-square&label=Build&logo=githubactions" alt="Build status"></a>
  <img src="https://img.shields.io/badge/Figma-Plugin-8C4FFF?style=flat-square&logo=figma" alt="Figma plugin">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Bun-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun">
  <p>
  <a href="README.md"><img src="https://img.shields.io/badge/Language-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-0A66C2?style=flat-square" alt="简体中文"></a>
  <a href="README.en.md"><img src="https://img.shields.io/badge/Language-English-0A66C2?style=flat-square" alt="English"></a>
  </p>
  </p>
</div>

## 功能

- 在插件面板中预览所选图层的等轴测变换，调整方向、角度和挤出深度。
- 调整透视模式下的倾斜、3D 旋转、相机、挤出和阴影。
- 在预览中显示等轴测立方体线框网格；点击 **Apply to selection** 后才会修改 Figma 图层。

## 安装

从 [Releases](https://github.com/mybna134/Vasometric/releases/latest) 下载 ZIP 并解压。在 Figma 中选择 **Plugins → Development → Import plugin from manifest…**，打开解压目录中的 `manifest.json`。

## 从源码构建

需要 [Bun](https://bun.sh/)。在仓库根目录运行：

```sh
bun ci
bun run build
```

构建会生成 `dist/code.js` 和内嵌脚本与图标的 `dist/ui.html`。Figma 从仓库根目录的 `manifest.json` 加载这两个文件；`dist/` 已被 Git 忽略。

编辑插件逻辑时可运行 `bun run watch`；修改界面后运行 `bun run build:ui`。代码检查命令为 `bun run lint`。
