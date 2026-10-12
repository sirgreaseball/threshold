// Runs before the page paints: the remembered theme, or the system's.
(function () {
  var m = document.cookie.match(/(?:^|; )th_theme=(dark|light)/);
  var t = m ? m[1] : null;
  if (!t) {
    try {
      t = localStorage.getItem('threshold.theme');
    } catch (e) {}
  }
  var d = document.documentElement;
  d.dataset.theme = t === 'dark' || t === 'light' ? t : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  d.classList.add('js');
})();
