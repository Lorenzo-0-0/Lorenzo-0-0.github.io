# Jingliang Li — Personal Homepage

简洁的学术个人主页，参考 [seokhyeon.com](https://www.seokhyeon.com/) 的风格做的。
纯 HTML + CSS，没有构建步骤，没有依赖。

## 本地预览

直接双击 `index.html`，或者：

```bash
open index.html
```

也可以起一个静态服务器（避免某些浏览器对 `file://` 资源的限制）：

```bash
cd ~/Desktop/jingliang-homepage
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

## 文件结构

```
.
├── index.html      # 页面结构
├── style.css       # 全部样式
├── README.md       # 本文件
└── assets/
    ├── photo.jpg                头像
    ├── ntu_logo.png             NTU Logo
    ├── nwpu_logo.png            NWPU Logo
    ├── teaser_fwm.png           Feedback World Model teaser
    ├── teaser_compassad.png     CompassAD teaser
    └── teaser_a2a.png           A2A Flow Matching teaser
```

## 要编辑什么

| 想改什么 | 文件 | 找哪里 |
|---|---|---|
| 简介文字 | `index.html` | `<p class="bio">` 段落 |
| 邮箱、Scholar、GitHub | `index.html` | `<ul class="contact-row">`，注意 `# TODO` 注释里标了占位 |
| 教育经历 | `index.html` | `<!-- ===== Education ===== -->` 那一节 |
| 工作/科研经历 | `index.html` | `<!-- ===== Experience ===== -->` 那一节 |
| 论文 | `index.html` | `<!-- ===== Publications ===== -->` 那一节，每个 `<article class="pub">` 是一篇 |
| 主题色（橙色） | `style.css` | 全局搜 `#C2410C` |
| 字体 | `index.html` `<head>` 里的 Google Fonts `<link>` |

## 现在还是占位的东西

- Hero 区的 Google Scholar 和 GitHub 链接是 `href="#"`，需要换成真实地址
- 三篇论文的 PDF 按钮都是 `href="#"`（按你的要求 PDF 先放按钮不链接），有 PDF 链接后把 `href` 改了、把 `class="btn btn--disabled"` 里的 `btn--disabled` 删掉即可

## 部署到 GitHub Pages

```bash
cd ~/Desktop/jingliang-homepage
git init
git add .
git commit -m "init homepage"
# 在 GitHub 新建空仓库 jingliang-li.github.io（仓库名必须是 你的GitHub用户名.github.io）
git remote add origin git@github.com:<你的用户名>/<你的用户名>.github.io.git
git branch -M main
git push -u origin main
# 几分钟后访问 https://<你的用户名>.github.io
```

或者直接拖整个文件夹到 Netlify Drop（https://app.netlify.com/drop），秒部署。

## 设计参数（备查）

- 主色（橙）：`#C2410C`
- 文字主色：`#1C1917`
- 正文色：`#3A3432`
- 灰色辅助色：`#808080`
- 边框灰：`#E5E5E5`
- 字体：Hedvig Letters Serif（标题）+ Instrument Sans（正文）
- 容器最大宽度：1024px
- 响应式断点：768px
