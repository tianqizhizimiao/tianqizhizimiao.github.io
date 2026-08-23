// main.js —— 业务主干 main.html 的页面逻辑（独立文件）。
//
// 数据来源：content/ 下每层一个 config.txt（f 文件 / d 文件夹 / m 主页面）。
// 仅在这里读 config.txt（一次性预加载缓存），别处无依赖。
//
// 职责：扫描 / 内容预渲染+切换 / 菜单渲染（JS 直接绑定展开收起） / 面包屑 / 抽屉 / 状态。
// 主题色已移除：全局固定暗色。

(() => {
  const BASE = 'content';

  // ---------- 缓存 ----------
  const menuCache = {};      // { 层路径: [项] }
  const mainPage = {};       // { 层路径: {name, path} }
  const contentCache = {};   // { path: DOM }
  let currentPath = null;

  const joinRel = (dirRel, name) => (dirRel ? dirRel + '/' + name : name);

  // ---------- 扫描（一次性递归，同层并行） ----------
  function parseLine(line) {
    const t = line.trim();
    const m = t.match(/^([fdm])\s+(.+)$/);
    return m ? { type: m[1], name: m[2].trim() } : { type: 'f', name: t };
  }
  function readConfig(relPath) {
    const url = BASE + '/' + (relPath ? relPath + '/' : '') + 'config.txt';
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.text();
    }).then((text) => text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  }
  async function preloadAll(relPath) {
    let lines;
    try { lines = await readConfig(relPath); } catch (e) { return; }
    const items = [];
    const dirPromises = [];
    for (const line of lines) {
      const { type, name } = parseLine(line);
      const rel = joinRel(relPath, name);
      const item = { type, name, relPath: rel, path: BASE + '/' + rel, isDir: type === 'd', isMain: type === 'm' };
      items.push(item);
      if (item.isMain && !item.isDir) mainPage[relPath || ''] = { name, path: item.path };
      if (item.isDir) dirPromises.push(preloadAll(rel));
    }
    menuCache[relPath || ''] = items;
    await Promise.all(dirPromises);
  }
  const itemsOf = (dirRel) => menuCache[dirRel || ''] || [];

  // ---------- 内容（预渲染 + 切显示） ----------
  function getContentArea() {
    return document.getElementById('content-area') || document.querySelector('.content');
  }
  function renderContent(text, path) {
    const node = document.createElement('div');
    node.className = 'content-view';
    node.dataset.path = path;
    if (/\.html?$/i.test(path)) {
      // html：取 body 内容插入（iframe 内嵌单独在 showContent 处理，这里处理非 iframe 的 html）
      const doc = new DOMParser().parseFromString(text, 'text/html');
      node.innerHTML = doc.body ? doc.body.innerHTML : text;
    } else {
      // 其它（.md / .txt）：用 markdown-it 渲染；若库不可用退回纯文本
      if (window.markdownit) {
        const md = window.markdownit({ html: true });   // 允许行内 html
        node.innerHTML = md.render(text);
        // 代码块高亮（highlight.js 全局注册后高亮）
        if (window.hljs) {
          node.querySelectorAll('pre code').forEach((c) => { hljs.highlightElement(c); });
        }
        // 给每个代码块加"复制"按钮
        node.querySelectorAll('pre').forEach((pre) => {
          attachCopyButton(pre);
        });
      } else {
        const pre = document.createElement('pre');
        pre.className = 'content-text';
        pre.textContent = text;
        node.appendChild(pre);
      }
    }
    return node;
  }
  // 给代码块 pre 加"复制"按钮：右上角小按钮，点击复制代码文本
  function attachCopyButton(pre) {
    if (pre.querySelector('.copy-btn')) return;   // 已加过则不重复
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.title = '复制代码';
    btn.textContent = '复制';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const code = pre.querySelector('code') || pre;
      const text = (code.textContent || '').replace(/\n$/, '');
      copyText(text).then((ok) => {
        btn.textContent = ok ? '已复制' : '复制失败';
        btn.classList.toggle('copied', ok);
        setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1500);
      });
    });
    pre.appendChild(btn);
  }
  // 复制文本到剪贴板（优先 navigator.clipboard，失败退回 execCommand）
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }
  // 预渲染深度上限：只预渲染前两层（根目录项 depth=1、第一层项 depth=2），更深层懒加载
  const PRERENDER_DEPTH = 2;
  async function collectAllFiles(dirRel, bucket, depth) {
    if (depth > PRERENDER_DEPTH) return;   // 超过上限：不预渲染（懒加载）
    for (const item of itemsOf(dirRel)) {
      if (item.isDir) await collectAllFiles(item.relPath, bucket, depth + 1);
      else bucket.push(item.path);
    }
  }
  async function preloadContents() {
    const area = getContentArea();
    if (!area) return;
    const files = [];
    await collectAllFiles('', files, 1);
    for (const path of files) {
      try {
        const text = await fetch(path).then((r) => r.text());
        const node = renderContent(text, path);
        contentCache[path] = node;
        area.appendChild(node);
      } catch (e) {}
    }
  }
  function showContent(path) {
    const area = getContentArea();
    if (!area) return;
    const loading = document.getElementById('content-loading');
    const frame = document.getElementById('content-frame');
    const isHtml = /\.html?$/i.test(path);
    // 隐藏所有渲染内容、隐藏 iframe
    area.querySelectorAll('.content-view').forEach((n) => n.classList.remove('show'));
    if (frame) frame.style.display = 'none';

    if (isHtml) {
      // .html：进透明 iframe。显示加载动画 → 设 src → onload 后显示
      if (loading) loading.style.display = 'flex';
      frame.src = path;                     // 触发加载
      frame.onload = () => {
        if (loading) loading.style.display = 'none';
        frame.style.display = 'block';      // 加载完成才显示
      };
      currentPath = path;
      setBreadcrumb(path);
      highlightNav(path);
      return;
    }

    // 非 .html：显示加载动画，fetch + markdown 渲染进 .content-view
    if (loading) loading.style.display = 'flex';
    const done = (node) => {
      if (loading) loading.style.display = 'none';
      area.querySelectorAll('.content-view').forEach((n) => n.classList.remove('show'));
      node.classList.add('show');
    };
    let node = contentCache[path];
    if (node) { done(node); }
    else {
      fetch(path).then((r) => r.text()).then((text) => {
        const n = renderContent(text, path);
        contentCache[path] = n;
        area.appendChild(n);
        done(n);
      }).catch(() => {
        const n = renderContent('<p>加载失败</p>', path);
        contentCache[path] = n;
        area.appendChild(n);
        done(n);
      });
    }
    currentPath = path;
    setBreadcrumb(path);
    highlightNav(path);
  }

  // 显示"未设置初始页面"提示：初始页面不可在子文件夹中
  function showNoHomePage() {
    const area = getContentArea();
    if (!area) return;
    const loading = document.getElementById('content-loading');
    const frame = document.getElementById('content-frame');
    area.querySelectorAll('.content-view').forEach((n) => n.classList.remove('show'));
    if (loading) loading.style.display = 'none';   // 隐藏加载动画
    if (frame) frame.style.display = 'none';
    // 清掉之前的内容，写入提示
    area.querySelectorAll('.content-view').forEach((n) => n.remove());
    const box = document.createElement('div');
    box.className = 'content-view no-home';
    box.innerHTML = '<div class="no-home-main">未设置初始页面</div>' +
                    '<div class="no-home-sub">初始页面不可在子文件夹中喵</div>';
    area.appendChild(box);
    box.classList.add('show');
  }

  // 自定义刷新：只重载当前显示内容（清缓存 + 重新 showContent，不整页 reload）
  function reloadCurrent() {
    if (!currentPath) return;
    delete contentCache[currentPath];   // 清缓存，强制重新 fetch
    showContent(currentPath);
  }
  function setBreadcrumb(path) {
    const bc = document.getElementById('breadcrumb');
    if (!bc) return;
    if (!path) { bc.textContent = ''; return; }
    const names = path.replace(/^content\//, '').split('/').filter(Boolean).map((p) => p.replace(/\.[^.]+$/, ''));
    if (!names.length) { bc.textContent = ''; return; }
    const MAX = 80;
    const build = (arr, mid) => mid ? ' > ' + arr[0] + ' ... > ' + arr.slice(1).join(' > ') : ' > ' + arr.join(' > ');
    let list = names, text = build(list, false);
    while (text.length > MAX && list.length > 2) { list = [list[0]].concat(list.slice(-2)); text = build(list, true); if (list.length <= 2) break; }
    bc.textContent = text;
    bc.style.opacity = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => { bc.style.opacity = '1'; }));
  }

  // 递归收起某文件夹及其所有子文件夹：遍历所有层级，逐个折叠内联样式
  function collapseGroup(group, body, arrow) {
    // 递归函数：折叠某个 body 里的所有直接子文件夹
    function collapseBody(b) {
      b.querySelectorAll(':scope > .drawer-group').forEach((g) => {
        const gb = g.querySelector(':scope > .drawer-group-body');
        // arrow 在 .drawer-group-head 里，用后代选择器（不是直接子级）
        const ga = g.querySelector('.group-arrow');
        if (gb) collapseBody(gb);                  // 先递归折叠更深层
        if (gb) gb.style.maxHeight = '0';          // 再折叠这一层内容
        if (ga) ga.style.transform = 'rotate(0deg)'; // 箭头转回
        g.classList.remove('expanded');
      });
    }
    // 先从内层开始逐个折叠
    collapseBody(body);
    // 再折叠自己
    body.style.maxHeight = '0';
    arrow.style.transform = 'rotate(0deg)';
  }

  // ---------- 菜单渲染：JS 直接绑定每个文件夹的展开/收起 ----------
  function renderTree(dirRel, holder) {
    for (const item of itemsOf(dirRel)) {
      if (item.isDir) {
        const group = document.createElement('div');
        group.className = 'drawer-group';
        const body = document.createElement('div');
        body.className = 'drawer-group-body';
        body.style.maxHeight = '0';   // 默认收起（配合 transition 平滑）
        body.style.overflow = 'hidden';

        const head = document.createElement('div');
        head.className = 'drawer-group-head';
        const arrow = document.createElement('span');
        arrow.className = 'group-arrow';
        arrow.textContent = '›';
        arrow.style.transform = 'rotate(0deg)';   // 初始收起：箭头不旋转（内联 JS 控制）
        const title = document.createElement('span');
        title.className = 'group-title';
        // 文本包 marquee-text（超长时 JS 加 .marquee 触发跑马灯）
        const mq = document.createElement('span');
        mq.className = 'marquee-text';
        mq.textContent = item.name;
        title.appendChild(mq);
        head.appendChild(arrow);
        head.appendChild(title);

        group.appendChild(head);
        group.appendChild(body);
        holder.appendChild(group);

        // JS 直接绑定：展开/收起由 JS 控制（maxHeight + 箭头内联，CSS transition 做平滑）
        head.addEventListener('click', (e) => {
          e.stopPropagation();
          const expanded = group.classList.toggle('expanded');
          if (expanded) {
            arrow.style.transform = 'rotate(90deg)';
            body.style.maxHeight = '800px';
            setChildMarquee(body, true);    // 展开：子项跑马灯开始（0.5s 延迟，CSS 处理）
          } else {
            collapseGroup(group, body, arrow);   // 收起：折叠内容（含子层）+ 转回箭头
            setChildMarquee(body, false);        // 收起：子项跑马灯复位（停止滚动）
          }
        });

        renderTree(item.relPath, body);   // 递归子层（绑定到子层各自 head）
      } else {
        const a = document.createElement('a');
        a.className = 'drawer-item';
        a.href = '#';
        a.dataset.path = item.path;
        a.dataset.name = item.name;
        const mq = document.createElement('span');
        mq.className = 'marquee-text';
        mq.textContent = item.name.replace(/\.[^.]+$/, '');
        a.appendChild(mq);
        a.addEventListener('click', (e) => {
          e.preventDefault();
          showContent(item.path);
          applyCurrentState();
          setMenu(false);
        });
        holder.appendChild(a);
      }
    }
  }

  // 扫描超长文本：内容宽度超出容器时加 .marquee；双副本各带 4 空格间隔（无缝跑马灯）
  function scanMarquee() {
    document.querySelectorAll('#menu-tree .marquee-text').forEach((mq) => {
      const parent = mq.parentElement;
      if (!parent) return;
      if (mq.scrollWidth > parent.clientWidth) {
        parent.classList.add('marquee');
        const t = mq.textContent;
        // 用 nbsp（\u00A0）作间隔，HTML 不会折叠；4 倍 = 16 个硬空格
        const gap = '\u00A0'.repeat(16);
        mq.textContent = t + gap + t + gap;
      }
    });
  }

  // 控制某文件夹内容的子项跑马灯：on=true 开始滚（0.5s 延迟），off 复位（停止）
  function setChildMarquee(body, on) {
    body.querySelectorAll('.drawer-item.marquee, .group-title.marquee').forEach((el) => {
      el.classList.toggle('running', on);
    });
  }

  // ---------- 抽屉 ----------
  function setMenu(open) {
    (document.getElementById('main-container') || document.documentElement).classList.toggle('menu-open', open);
  }
  function fillDrawer(title) {
    const drawer = document.getElementById('drawer');
    if (!drawer) return null;
    const t = drawer.querySelector('.drawer-title');
    const tree = drawer.querySelector('#menu-tree');
    if (!t || !tree) return null;
    t.textContent = title;
    tree.innerHTML = '';
    return tree;
  }
  function openMobileMenu() {
    const tree = fillDrawer('菜单');
    if (tree) { renderTree('', tree); scanMarquee(); }
    applyCurrentState();
    setMenu(true);
  }
  function openFolder(folderName) {
    const tree = fillDrawer(folderName);
    if (tree) { renderTree(folderName, tree); scanMarquee(); }
    setMenu(true);
    const main = mainPage[folderName];
    if (main) showContent(main.path);
  }

  // ---------- 状态：高亮当前项 + 展开其祖先 ----------
  function applyCurrentState() {
    if (!currentPath) return;
    const node = document.querySelector('.drawer-item[data-path="' + currentPath + '"]');
    if (!node) return;
    // 清除当前高亮
    document.querySelectorAll('#menu-tree .drawer-item.active').forEach((a) => a.classList.remove('active'));
    node.classList.add('active');
    // 加 .locating：临时禁用展开过渡，让布局立刻到"最终态"（rect 精确，避免 max-height 中间态偏移）
    document.documentElement.classList.add('locating');
    // 展开当前项的所有祖先文件夹（JS 加 expanded + 设 maxHeight + 箭头同步）
    let cur = node.parentElement;
    while (cur && cur.classList.contains('drawer-group-body')) {
      const group = cur.parentElement;
      if (group && group.classList.contains('drawer-group')) {
        group.classList.add('expanded');
        cur.style.maxHeight = '800px';
        const arrow = group.querySelector('.group-arrow');
        if (arrow) arrow.style.transform = 'rotate(90deg)';
      }
      cur = group.parentElement;
    }
    // 滚动定位：等布局稳定（.locating 使过渡禁用，布局已到最终态）后单次计算居中。
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setTimeout(() => {
        const container = document.getElementById('menu-tree');
        if (container) {
          const cRect = container.getBoundingClientRect();
          const nRect = node.getBoundingClientRect();
          const absoluteTop = container.scrollTop + (nRect.top - cRect.top);
          const target = absoluteTop - container.clientHeight / 2 + nRect.height / 2;
          container.scrollTop = Math.max(0, target);
        }
        // 算完移除 .locating，恢复展开动画
        document.documentElement.classList.remove('locating');
      }, 40);
    }));
  }

  // ---------- PC 右上角顶层导航 ----------
  function buildNav() {
    const nav = document.querySelector('.topbar .nav');
    if (!nav) return;
    nav.innerHTML = '';
    for (const item of itemsOf('')) {   // 根目录所有项（按 config.txt 顺序）
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'nav-item';
      a.textContent = item.name.replace(/\.[^.]+$/, '');
      if (item.isDir) {
        a.dataset.folder = item.name;
        a.title = item.name;
        a.addEventListener('click', (e) => { e.preventDefault(); openFolder(item.name); });
      } else {
        // 文件项：直接加载内容
        a.dataset.path = item.path;
        a.title = item.name;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          showContent(item.path);
          applyCurrentState();
        });
      }
      nav.appendChild(a);
    }
  }

  // 高亮右上角导航：根据当前路径所在顶层项（文件→自身，深层→其顶层文件夹）
  function highlightNav(path) {
    const nav = document.querySelector('.topbar .nav');
    if (!nav) return;
    // 取 path 去掉 content/ 后的首段（顶层文件夹名或文件名）
    const first = path.replace(/^content\//, '').split('/')[0];
    const firstName = first ? first.replace(/\.[^.]+$/, '') : '';
    nav.querySelectorAll('.nav-item').forEach((el) => {
      const isActive = el.textContent === firstName;
      el.classList.toggle('active', isActive);
    });
  }

  // ---------- 其它点击（委托：汉堡/遮罩/收展按钮 —— 文件夹和文件项已各自绑定） ----------
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (target.closest('#hamburger') || target.closest('.brand-wrap')) {
      e.preventDefault();
      openMobileMenu();
      return;
    }
    if (target.closest('#drawer-overlay')) { setMenu(false); return; }
    // 关闭菜单
    if (target.closest('#close-btn')) {
      e.preventDefault();
      setMenu(false);
      return;
    }
  });

  // ---------- 启动 ----------
  async function boot() {
    if (window.init && window.init.register) window.init.register('menu');
    await preloadAll('');   // 只探测（config.txt 索引），内容懒加载
    buildNav();
    const tree = fillDrawer('菜单');
    if (tree) { renderTree('', tree); scanMarquee(); }
    const home = mainPage[''];
    if (home) { showContent(home.path); applyCurrentState(); }
    else {
      // 根目录未设主页面：显示"未设置初始页面"提示（初始页面不可在子文件夹中）
      showNoHomePage();
    }
    if (window.init && window.init.complete) window.init.complete('menu');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot());
  } else {
    boot();
  }
})();
