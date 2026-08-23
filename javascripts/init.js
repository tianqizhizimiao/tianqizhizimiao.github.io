// init.js —— 初始化就绪栅栏：等所有初始化任务完成后再淡出初始化元素。
//
// 全局对象 init，提供两个方法（键值对，用有意义的名字标识每个任务）：
//   init.register('loadVideo')   // 任务开始：把 init_complete['loadVideo'] 记为 false
//   init.complete('loadVideo')   // 任务完成：把 init_complete['loadVideo'] 记为 true
//
// init.js 自身会注册一个保底任务（3 秒后完成）：防止加载过快、欢迎页闪一下就没了，
// 同时为其它初始化任务提供注册窗口。
//
// 独立监控循环：当 init_complete 非空且所有 key 的值都是 true 时，
// 淡出初始化元素（加载指示器 / 欢迎文字），之后替换为业务元素。
(() => {
  // ---------- 全局清单（键值对，当前页面内，刷新/关闭即失效） ----------
  if (!window.init_complete || typeof window.init_complete !== 'object') {
    window.init_complete = {};
  }

  // ---------- 全局 init 对象 ----------
  window.init = {
    // 注册任务：key 为该名字登记为未完成
    register(key) {
      if (typeof key !== 'string' || !key) return;
      window.init_complete[key] = false;
    },
    // 完成任务：把该名字标记为已完成
    complete(key) {
      if (typeof key !== 'string') return;
      window.init_complete[key] = true;
    },
    // 是否所有任务都完成（且至少有一个任务）
    isAllDone() {
      const keys = Object.keys(window.init_complete);
      if (keys.length === 0) return false;              // 空清单：不算完成
      return keys.every((k) => window.init_complete[k] === true);
    },
    // 启动"保底任务"的完成倒计时：从调用时刻起 ms 毫秒（默认 3000）后才完成。
    // 'init' 这个任务的 false 已在页面加载时注册（见下方），
    // 这里只负责"从图片加载完成后才开始 3 秒倒计时"，避免提前完成。
    startInit(ms) {
      const delay = (typeof ms === 'number' ? ms : 3000);
      setTimeout(() => { init.complete('init'); }, delay);
    }
  };

  // 一开始就把 'init' 的 false 加入清单（占位，防止监控循环误判为已完成而提前隐藏）
  init.register('init');
  // 注意：'init' 的完成（true）由 init.startInit(3000) 在图片加载完成后触发，见 index.js。

  // ---------- 独立监控循环 ----------
  function revealMain() {
    // 淡出加载态文字元素（背景层 .bg-*/.boot-bg 不动）
    const targets = document.querySelectorAll('.page, .loader');
    targets.forEach((el) => {
      el.style.transition = 'opacity 1s ease';
      el.style.opacity = '0';
    });
    // 显示业务主干容器 div（main.html 注入的内容），占满全屏、背景透明
    const container = document.getElementById('main-container');
    if (container) {
      container.style.transition = 'opacity 0.6s ease';
      container.style.opacity = '1';
      container.style.pointerEvents = 'auto';
    }
  }

  function checkAllDone() {
    if (!init.isAllDone()) return;   // 有未完成 / 空清单：不处理
    revealMain();
    if (window.__initWatch) {
      clearInterval(window.__initWatch);
      window.__initWatch = null;
    }
  }

  if (!window.__initWatchStarted) {
    window.__initWatchStarted = true;
    window.__initWatch = setInterval(checkAllDone, 200);
  }
})();
