// init_main.js —— 负责加载业务主干 main.html 并注入外层 div（不用 iframe）。
// 页面一进入就执行：注册 main 任务 → 创建隐藏 div → fetch main.html → 注入内容 → 完成任务。
(() => {
  // 若 init.js 还没加载（缺少 init 工具），则兜底等待
  function getInit(cb) {
    if (window.init) return cb(window.init);
    setTimeout(() => getInit(cb), 10);
  }

  getInit(function (init) {
    // 1) 注册 main 任务（未完成）
    init.register('main');

    // 2) 创建隐藏的容器 div：占满全屏、背景透明，之后由 init.js 淡入显示
    const container = document.createElement('div');
    container.id = 'main-container';
    container.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;' +
      'background:transparent;opacity:0;pointer-events:none;z-index:2;';
    document.body.appendChild(container);

    // 3) fetch main.html，注入其 body 内容到容器（同源可读）
    fetch('./html/main.html')
      .then((r) => {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.text();
      })
      .then((html) => {
        // 用 DOMParser 解析，取 body 内容注入（不引入外层 head，避免样式冲突）
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // 把 main.html <head> 里引用的 CSS <link> 也加入外层文档，
        // 否则注入 <body> 会丢失 <link rel=stylesheet>，独立 css 不生效。
        // 相对路径需按外层页面(index.html)解析：main.html 用 ../css/x.css，
        // 但注入到外层后要按外层基点解析，改为 ./css/x.css。
        doc.querySelectorAll('head link[rel="stylesheet"]').forEach((link) => {
          const href = link.getAttribute('href') || '';
          const outerHref = href.replace(/^\.\.\//, './');
          const el = document.createElement('link');
          el.rel = 'stylesheet';
          el.href = outerHref;
          document.head.appendChild(el);
        });

        // 把 main.html <head> 里引用的 <script src> 也加载进外层，
        // 使 main.html 的独立 js（如 main.js）在注入后仍然生效。
        doc.querySelectorAll('head script[src]').forEach((script) => {
          const src = script.getAttribute('src') || '';
          const outerSrc = src.replace(/^\.\.\//, './');
          const el = document.createElement('script');
          el.src = outerSrc;
          document.head.appendChild(el);
        });

        // 注入 body 内容
        const bodyContent = doc.body ? doc.body.innerHTML : html;
        container.innerHTML = bodyContent;
        init.complete('main'); // 注入完成后标记任务完成
      })
      .catch(() => {
        // 拉取失败也标记完成，避免卡住初始化
        init.complete('main');
      });
  });
})();
