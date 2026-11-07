# Lumen · 网页模板

一套开箱即用的单页官网模板，纯 HTML + CSS + 原生 JS，**零外部依赖**（不加载字体、图标库或 CDN）。
适合 SaaS 产品页、工具官网、个人作品集首页，改文案换配色即可复用。

## 快速开始

直接双击 `index.html` 用浏览器打开即可，无需安装、无需构建、无需联网。

如需本地服务器预览（可选）：

```powershell
# 在 web-template 目录下
python -m http.server 8080
# 或
npx serve .
```

## 目录结构

```
web-template/
├─ index.html            # 页面结构（全部文案都在这里）
├─ assets/
│  ├─ css/style.css      # 样式：设计变量 → 组件 → 响应式
│  └─ js/main.js         # 交互：主题、菜单、入场动画、价格切换
└─ README.md
```

## 已内置的功能

| 模块 | 说明 |
| --- | --- |
| 深浅色主题 | 跟随系统偏好，手动切换后记忆到 `localStorage`，首屏无闪烁 |
| 响应式布局 | 1120px 容器，960 / 720 / 620 / 400 四档断点 |
| 移动端菜单 | 汉堡按钮 + 点击外部/按 `Esc` 关闭 + `aria-expanded` 同步 |
| 滚动入场 | `IntersectionObserver` 渐显，支持 `data-delay` 依次错峰 |
| 数字滚动 | 统计区数字进入视口后增长，支持小数与后缀 |
| 计价切换 | 月付 / 年付切换，价格从 `data-*` 读取 |
| FAQ 手风琴 | 原生 `<details>`，无 JS 也可用 |
| 可访问性 | 跳转链接、语义标签、`focus-visible` 焦点环、`prefers-reduced-motion` 降级 |

## 常见修改

**改品牌名 / 文案**：直接编辑 `index.html`，品牌名出现两处（导航与页脚）。

**改主色**：编辑 `style.css` 顶部的 `:root` 与 `[data-theme="dark"]`：

```css
:root {
  --brand: #5b5bd6;        /* 强调文字、图标 */
  --btn-bg: #5b5bd6;       /* 按钮底色 */
  --btn-bg-hover: #4a4ac4;
  --accent: #14b8a6;       /* 次级强调（对勾、涨幅） */
  --bg: #f6f7fb;
  --surface: #ffffff;
}
```

这些变量控制全站配色；改完一处即可整体换肤。深色模式在 `[data-theme="dark"]` 里单独覆盖。

**改字体**：修改 `body` 的 `font-family`。模板默认使用系统字体（苹方 / 微软雅黑 / Segoe UI），因此没有任何网络请求；若想用网络字体（如 Inter、思源黑体），在 `<head>` 加 `@font-face` 或字体链接即可。

**加一段内容**：复制任意 `<section class="section">` 区块，保留 `data-reveal` 属性就能自动获得入场动画；`data-delay="1"` 到 `"6"` 控制层级延迟。

**改统计数字**：给元素设置 `data-count`（目标值）、`data-suffix`（后缀）、`data-decimals`（小数位），例如：

```html
<strong class="stat-num" data-count="98.6" data-decimals="1" data-suffix="%">98.6%</strong>
```

**改价格**：按钮上的 `data-monthly` / `data-yearly` 就是对应周期的显示值。

## 需要注意

- 模板使用了 `color-mix()`、`backdrop-filter`、`intersectionObserver`，请使用较新的 Chrome / Edge / Safari / Firefox。旧浏览器会降级（毛玻璃和半透明背景变为纯色），页面仍可正常阅读。
- 所有链接都是 `#` 占位，接入真实路径后记得替换。
- 图片区域目前用纯 CSS 绘制了产品界面示意（`.app-window`、`.panel`），替换成真实截图时删除对应节点、换成 `<img>` 即可。
- 页面中的公司名、评价、数据均为演示内容，正式上线前请替换。

## 部署

这是纯静态站点，把整个 `web-template` 目录上传到任意静态托管即可（Nginx、Vercel、Netlify、GitHub Pages、Cloudflare Pages 均可），无需任何构建步骤。

### 部署到 GitHub Pages

所有资源都用相对路径引用，放在仓库子目录里也能正常工作。目录里已附带空的 `.nojekyll` 文件，跳过 Jekyll 构建，避免 GitHub 处理静态文件时出错。

**方式一：网页上传（不用装 Git）**

1. 打开 <https://github.com/new> 新建仓库，勾选 **Public**（免费账号的 Pages 只支持公开仓库）。
2. 进入仓库 → **Add file → Upload files**。
3. 把 `index.html`、`assets` 文件夹、`.nojekyll` 一起拖进去（要放在**仓库根目录**，不要把 `web-template` 这一层也拖进去），提交。
4. **Settings → Pages** → Source 选 **Deploy from a branch** → Branch 选 `main`、目录选 `/ (root)` → Save。
5. 等 1–2 分钟，访问 `https://<你的用户名>.github.io/<仓库名>/`。

**方式二：命令行**

```bash
cd web-template
git init -b main
git add .
git commit -m "feat: init landing page"
git remote add origin https://github.com/<用户名>/<仓库名>.git
git push -u origin main
```

之后在仓库的 Settings → Pages 里按上面的第 4 步开启即可。以后每次 `git push` 会自动重新发布。

**常见坑**

- 仓库根目录必须有 `index.html`，否则访问站点根地址会 404。如果你把整个 `web-template` 文件夹传上去，那访问地址要加一层：`https://<用户名>.github.io/<仓库名>/web-template/`。
- GitHub Pages 的 Linux 文件系统**区分大小写**，`Assets/CSS/style.css` 和 `assets/css/style.css` 是两个路径。本模板路径已全部匹配，改名时注意。
- 改了代码要等 Pages 重新构建（通常 1 分钟内），浏览器缓存较顽固时可以强制刷新 `Ctrl + F5`。
- 想绑自己的域名：Settings → Pages → Custom domain，再按提示加 CNAME 解析记录。
