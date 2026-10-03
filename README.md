<div align="center">
  <img src="readme-header.svg" width="530" height="88" alt="Vasometric">
</div>
<p align="right">Figma 等轴测与透视绘图工具</p>

<div align="center">
  <p>
  <a href="https://github.com/mybna134/Vasometric/releases/latest"><img src="https://img.shields.io/github/v/release/mybna134/Vasometric?style=flat-square&label=Latest%20Release&logo=github" alt="Latest release"></a>
  <a href="https://github.com/mybna134/Vasometric/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/mybna134/Vasometric/release.yml?style=flat-square&label=Build&logo=githubactions" alt="Build status"></a>
  <img src="https://img.shields.io/badge/Figma-Plugin-8C4FFF?style=flat-square&logo=figma" alt="Figma plugin">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Bun-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0--only-2ea44f?style=flat-square" alt="GPL-3.0-only license"></a>
  </p>
  <p>
  <a href="README.md"><img src="https://img.shields.io/badge/Language-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-0A66C2?style=flat-square" alt="简体中文"></a>
  <a href="README.en.md"><img src="https://img.shields.io/badge/Language-English-0A66C2?style=flat-square" alt="English"></a>
  </p>
</div>



## 功能

- 在插件面板中预览所选图层的等轴测变换，调整方向、角度和挤出深度。数值输入框可直接输入，也可上下拖动左侧图标调整。挤出应用到 Figma 后由矢量路径绘制，可添加底面描边和保留原图内容的背面；挤出与描边颜色选择器提供色板、色相与透明度色条、RGBA/8 位 HEX 输入和 Material 配色。
- 调整透视模式下的倾斜、3D 旋转、相机、挤出和阴影。
- 在预览中显示等轴测立方体线框网格；点击 **Apply to selection** 后才会修改 Figma 图层。带挤出的结果在图层列表中显示为一个组图层。
- 首次应用变换时保存图层原始尺寸与方向；再次选中结果组可从左下角圆形菜单点 **恢复原状**，在当前位置恢复，同时移除插件生成的挤出内容并解除结果组。菜单中的 **撤回** 和 **重做** 用于插件操作；**重置预览** 只重置面板参数。
- 含文字的图层使用矢量副本应用变换，避免缩放文字框导致换行；原图层隐藏保留在结果组中，恢复原状时重新显示。
- **恢复原状** 会先弹出警告确认框，默认勾选 **删除编辑历史**。确认恢复后清空插件的撤回与重做记录，本次恢复也无法通过插件内的撤回操作撤销；取消勾选则保留历史，并允许撤回本次恢复。**重置预览** 直接重置面板参数，不删除编辑历史。

## 许可证

本项目以 [GNU General Public License v3.0 only](LICENSE) 发布。

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
