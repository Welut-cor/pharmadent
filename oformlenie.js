// Оформление сайта: «Классика» (по умолчанию) или «Атлас». Кнопка #oform в шапке переключает и запоминает выбор
// в этом браузере (localStorage, ключ oformlenie). Подключается в <head> обычным скриптом, после tema.js.
// Главная у оформлений - разные страницы: index.html (<html data-glavnaya="klassika">) и atlas.html (data-glavnaya="atlas");
// со своей главной сохранённый выбор сразу уводит на другую. Страница случая одна: «Атлас» - стили поверх по data-oform="atlas".
(() => {
  const koren = document.documentElement;
  let sohraneno = null;
  try {
    const o = localStorage.getItem('oformlenie');
    if (o === 'atlas' || o === 'klassika') sohraneno = o;
  } catch (e) { /* хранилище закрыто - оформление по странице или классика */ }
  const glavnaya = koren.dataset.glavnaya;
  const naGlavnuyu = (o) => (o === 'atlas' ? 'atlas.html' : './') + location.hash;
  if (glavnaya && sohraneno && sohraneno !== glavnaya) {
    location.replace(naGlavnuyu(sohraneno));
    return;
  }
  const ustanovit = (o) => { if (o === 'atlas') koren.dataset.oform = 'atlas'; else delete koren.dataset.oform; };
  ustanovit(glavnaya || sohraneno || 'klassika');

  function knopka() {
    const b = document.getElementById('oform');
    if (!b) return;
    const obnovit = () => { // на кнопке - оформление, в которое переключит
      const atlas = koren.dataset.oform === 'atlas';
      b.textContent = atlas ? 'Классика' : 'Атлас';
      b.title = atlas ? 'Вернуть прежнее оформление' : 'Включить оформление «Атлас»';
      b.setAttribute('aria-label', b.title);
    };
    obnovit();
    b.addEventListener('click', () => {
      const novoe = koren.dataset.oform === 'atlas' ? 'klassika' : 'atlas';
      try { localStorage.setItem('oformlenie', novoe); } catch (e) { /* выбор живёт до перезагрузки */ }
      if (glavnaya) { location.href = naGlavnuyu(novoe); return; }
      ustanovit(novoe);
      obnovit();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', knopka);
  else knopka();
})();
