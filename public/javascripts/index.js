// index.js —— 等背景图和字体都加载完成后再"揭幕"：
// 给 <html> 加 .loaded，触发磨砂层从不透明渐变成半透明、标题淡入。
(() => {
  const root = document.documentElement;
  let imageDone = false;
  let fontsDone = false;

  function maybeReveal() {
    if (imageDone && fontsDone) root.classList.add('loaded');
  }

  // 1) 按初始屏幕比例选背景图：竖屏/移动用 Mobile，横屏/PC 用 PC。
  //    选好后直接把背景图设到 body（内联样式 > CSS @media），
  //    这样即使 PC 拖动窗口改变宽高比，也不会再被替换成移动端图。
  const isPortrait = window.matchMedia('(max-aspect-ratio: 1/1)').matches;
  const bgImage = isPortrait
    ? './images/background-Mobile.jpg'
    : './images/background-PC.jpg';

  // 固定 body 背景（只设一次，之后不随窗口尺寸变化）
  const body = document.body;
  if (body) {
    body.style.backgroundImage = `url("${bgImage}")`;
    body.style.backgroundSize = 'cover';
    body.style.backgroundPosition = 'center';
    body.style.backgroundRepeat = 'no-repeat';
    body.style.backgroundAttachment = 'fixed';
  }

  // 预加载背景图，用于检测"背景加载完成"（与设到 body 的同源同路径）
  const img = new Image();
  img.onload = () => {
    imageDone = true; maybeReveal();
    // 图片加载完成后才启动 init 保底任务（3 秒），欢迎页保底从此刻计
    if (window.init && window.init.startInit) window.init.startInit(3000);
  };
  img.onerror = () => {
    imageDone = true; maybeReveal();
    // 图挂了也照常启动保底，避免卡住
    if (window.init && window.init.startInit) window.init.startInit(3000);
  };
  img.src = bgImage;

  // 2) 等字体加载完成
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { fontsDone = true; maybeReveal(); });
  } else {
    fontsDone = true;
  }
})();
