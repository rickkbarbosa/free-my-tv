/*
 * The home screen for web-app TVs (LG webOS, Samsung Tizen), with the Android app's design and behavior (HomeView):
 *  - top: the "For You" title and the tabs (Explore, Movies, Shows); icon-only glass buttons at the right (Live TV,
 *    HDMI Inputs, Settings) and the crypto quotes at the end of the tab row;
 *  - three picks for this hour in the selected tab; the background is the focused one's photo, blurred, almost white;
 *  - the glass shelf with the apps; ↓ opens the drawer (inputs, shortcuts, weather, prices); ↑ or Back closes it;
 *  - a night look from sunset to sunrise; a screensaver after a few idle minutes.
 * The remote's arrows, OK and Back move the focus; a pointer (LG's Magic Remote) focuses what it points at.
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function sym(name, parent, size) {
    var s = el('span', 'sym', parent);
    s.style.webkitMaskImage = 'url(symbols/' + name + '.png)';
    s.style.maskImage = 'url(symbols/' + name + '.png)';
    if (size) { s.style.width = size + 'px'; s.style.height = size + 'px'; }
    return s;
  }

  function coin(i, parent) {
    var c = window.COINS && window.COINS[i];
    if (!c) return;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    // Old WebKit (Tizen 2) draws an SVG without them at 300×150; the CSS still sets the size everywhere it's shown.
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
    for (var k = 0; k < c.length; k++) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', c[k]);
      p.setAttribute('fill-rule', 'evenodd');
      svg.appendChild(p);
    }
    parent.appendChild(svg);
  }

  function hasClass(e, c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0; }
  function setClass(e, c, on) {
    if (!e) return;
    if (on && !hasClass(e, c)) e.className = (e.className + ' ' + c).replace(/^\s+/, '');
    else if (!on && hasClass(e, c)) e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  var stage = $('stage'), body = document.body;

  /** The 1920 × 1080 stage fills the window (on the TV it already is 1920 × 1080). */
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.webkitTransform = stage.style.transform = s === 1 ? '' : 'scale(' + s + ')';
  }

  // MARK: - Apps on the shelf

  /** Shelf apps in this order when installed, like the Android app: key, LG app id, name on the TV, brand gradient. */
  var SHELF = [
    ['netflix', /^netflix$/, /netflix/i, ['#0A0A0A', '#000000']],
    ['youtube', /youtube/, /^youtube$/i, ['#1C1C1E', '#09090A']],
    ['prime', /^amazon$/, /prime video|amazon/i, ['#2AA8FF', '#0A68D4']],
    ['disney', /disney/, /disney/i, ['#173584', '#08143F']],
    ['max', /hbo|wbd/, /^(hbo )?max$|hbo max/i, ['#5C30E8', '#221684']],
    ['appletv', /appletv|apple\.tv/, /apple tv/i, ['#1C1C1E', '#000000']],
    ['hulu', /^hulu/, /hulu/i, ['#1CE783', '#0B8F4E']],
    ['paramount', /paramount|cbs/, /paramount/i, ['#0064FF', '#002A86']],
    ['peacock', /peacock/, /peacock/i, ['#1C1C1E', '#000000']],
    ['nfl', /nfl/, /^nfl/i, ['#013369', '#00163D']],
    ['globoplay', /globoplay/, /globoplay/i, ['#FF8A1F', '#FF2D5A']],
    ['jellyfin', /jellyfin/i, /jellyfin/i, ['#AA5CC3', '#00A4DC']],
    ['spotify', /spotify/, /spotify/i, ['#1DB954', '#0F7A36']]
  ];
  // Apps shown at once, as on Android: 8 (today's smallest tiles, 178 wide); the shelf scrolls for the rest. The
  // built-in list keeps 8 too.
  var SHELF_VISIBLE = 8, FEW_APPS = 8;
  var MAX_SHELF = 10;   // the shelf editor keeps up to ten apps

  function shelfKey(app) {
    for (var i = 0; i < SHELF.length; i++) if (SHELF[i][1].test(app.id) || SHELF[i][2].test(app.title)) return SHELF[i];
    return null;
  }

  function darken(hex, f) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#161618';
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r * f) + ',' + Math.round(g * f) + ',' + Math.round(b * f) + ')';
  }

  /** A name that fits the tile on one line (the font shrinks for long names). */
  function wordFit(title, width, max) {
    return Math.max(18, Math.min(max, Math.floor(width * 0.8 / (Math.max(4, title.length) * 0.56))));
  }

  // MARK: - Logos

  // The TV's icons are small squares with their own background (white behind Netflix, black behind Max). Like the
  // Android app does with the TV art, the logo is lifted off it once: the background goes transparent and the rest is
  // cropped to the logo, which then fills the tile on the brand's color.
  var lifted = {};   // icon url -> {src, bg: [r, g, b], ink: luminance histogram} or false (keep the icon as it is)
  var LIFT_SIZE = 240;

  // sRGB (0-255) to linear light, computed once: lift() needs it for every pixel, and old TVs are slow at Math.pow.
  var LINEAR = [];
  for (var li = 0; li < 256; li++) LINEAR[li] = li <= 10 ? li / 255 / 12.92 : Math.pow((li / 255 + 0.055) / 1.055, 2.4);

  /** Relative luminance (0-1) of an sRGB color (whole numbers, as read from the canvas). */
  function luminance(r, g, b) {
    return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
  }

  function rgbOf(color) {
    var m = /^#?([0-9a-f]{6})$/i.exec(color || '');
    if (m) { var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color || '');
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  }

  function lift(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return false;
    var f = Math.min(1, LIFT_SIZE / Math.max(w, h));
    w = Math.max(1, Math.round(w * f));
    h = Math.max(1, Math.round(h * f));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var g = canvas.getContext('2d');
    var data;
    try {
      g.drawImage(img, 0, 0, w, h);
      data = g.getImageData(0, 0, w, h);
    } catch (e) {
      return false;   // a TV that doesn't let the page read its icons
    }
    var px = data.data;
    // The background: the most common color a little inside the edges (rounded icons have transparent corners).
    var votes = {}, best = null, bestN = 0, inset = Math.round(Math.min(w, h) * 0.08);
    for (var s = 0; s < 64; s++) {
      var t = s % 16 / 16, side = s >> 4;
      var x = side < 2 ? Math.round(inset + t * (w - 2 * inset)) : side === 2 ? inset : w - 1 - inset;
      var y = side < 2 ? (side === 0 ? inset : h - 1 - inset) : Math.round(inset + t * (h - 2 * inset));
      var i = (y * w + x) * 4;
      var key = px[i + 3] < 128 ? 'clear' : (px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4);
      votes[key] = (votes[key] || 0) + 1;
      if (votes[key] > bestN) { bestN = votes[key]; best = key === 'clear' ? null : [px[i], px[i + 1], px[i + 2]]; }
    }
    var minX = w, minY = h, maxX = -1, maxY = -1, ink = [0, 0, 0, 0, 0, 0, 0, 0], inkSum = 0;
    for (var p = 0; p < w * h; p++) {
      var j = p * 4, a = px[j + 3] / 255;
      if (best) {
        // color to alpha: how far each channel is from the background, as a share of how far it could go, so the
        // anti-aliased edges come out as the logo's color, partly clear, without a fringe of the background
        var k = 0, c;
        for (c = 0; c < 3; c++) {
          var v = px[j + c], o = best[c];
          k = Math.max(k, v > o ? (v - o) / Math.max(1, 255 - o) : (o - v) / Math.max(1, o));
        }
        k = Math.max(0, Math.min(1, (k - 0.1) / 0.9));   // compression noise stays clear
        if (k > 0 && k < 1) {
          for (c = 0; c < 3; c++) px[j + c] = Math.max(0, Math.min(255, best[c] + (px[j + c] - best[c]) / k));
        }
        a *= k;
      }
      px[j + 3] = Math.round(a * 255);
      if (a > 0.3) {
        var px0 = p % w, py0 = (p / w) | 0;
        if (px0 < minX) minX = px0;
        if (px0 > maxX) maxX = px0;
        if (py0 < minY) minY = py0;
        if (py0 > maxY) maxY = py0;
        ink[Math.min(7, Math.floor(Math.sqrt(luminance(px[j], px[j + 1], px[j + 2])) * 8))] += a;
        inkSum += a;
      }
    }
    // Nothing left, or nothing taken away (a picture rather than a logo on a background): keep the icon.
    if (maxX < 0 || (maxX - minX > w * 0.96 && maxY - minY > h * 0.96)) return false;
    var crop = document.createElement('canvas');
    crop.width = maxX - minX + 1;
    crop.height = maxY - minY + 1;
    g.putImageData(data, 0, 0);
    crop.getContext('2d').drawImage(canvas, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);
    for (var b = 0; b < 8; b++) ink[b] /= inkSum;
    try {
      return {src: crop.toDataURL('image/png'), bg: best, ink: ink};
    } catch (e2) {
      return false;
    }
  }

  /**
   * Share of the logo that hardly shows on a tile of this luminance (YouTube's black type on a dark tile). Each bin
   * of the histogram holds the ink whose square-root luminance falls in it.
   */
  function unseen(ink, tileLum) {
    var share = 0;
    for (var b = 0; b < 8; b++) {
      var l = Math.pow((b + 0.5) / 8, 2);
      if ((Math.max(l, tileLum) + 0.05) / (Math.min(l, tileLum) + 0.05) < 1.8) share += ink[b];
    }
    return share;
  }

  function paint(box, top, bottom) {
    box.style.background = '-webkit-linear-gradient(top, ' + top + ', ' + bottom + ')';
    box.style.background = 'linear-gradient(' + top + ', ' + bottom + ')';
  }

  /** A color that is clearly a hue (Crunchyroll's orange), not black, white or a gray. */
  function colorful(rgb) {
    return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]) >= 96;
  }

  /**
   * The logo's box in its own proportions, as large as object-fit: contain draws it. Chrome 38 (webOS 3) ignores
   * object-fit while a tile next to it animates, and the logo stretched to its 70% x 50% box until the move ended.
   * Not laid out yet (a closed sheet): object-fit stays, and fitLogos() runs when the sheet opens.
   */
  function fitLogo(img) {
    var box = img.parentNode, bw = img.offsetWidth, bh = img.offsetHeight, nw = img.naturalWidth, nh = img.naturalHeight;
    if (!box || !bw || !bh || !nw || !nh || img.style.width) return;
    var s = Math.min(bw / nw, bh / nh);
    img.style.width = nw * s / box.offsetWidth * 100 + '%';
    img.style.height = nh * s / box.offsetHeight * 100 + '%';
  }

  function fitLogos(root) {
    var imgs = root.querySelectorAll('img.logo');
    for (var i = 0; i < imgs.length; i++) if (imgs[i].complete) fitLogo(imgs[i]);
  }

  /** own: the tile has the TV's color for the app, not one of SHELF's. */
  function showLogo(img, box, top, bottom, logo, own) {
    img.className = 'logo';
    img.onload = function () { img.onload = null; fitLogo(img); };
    img.src = logo.src;
    if (img.complete) fitLogo(img);
    var a = rgbOf(top), z = rgbOf(bottom);
    var tileLum = (luminance(a[0], a[1], a[2]) + luminance(z[0], z[1], z[2])) / 2;
    // The tile takes the icon's background when the logo only reads on it, and when that background is the brand's
    // color: LG's bgColor isn't always the icon's (Crunchyroll's is black, on an orange icon).
    if (logo.bg && ((own && colorful(logo.bg)) || unseen(logo.ink, tileLum) > 0.35)) {
      var bg = 'rgb(' + logo.bg.join(',') + ')';
      var hex = '#' + ((1 << 24) | (logo.bg[0] << 16) | (logo.bg[1] << 8) | logo.bg[2]).toString(16).slice(1);
      paint(box, bg, darken(hex, 0.93));
    }
  }

  /** An app's face: its logo on its brand color (or its name, when the icon can't be read). */
  function face(app, box, wordSize) {
    var k = shelfKey(app);
    var top = k ? k[3][0] : app.color ? darken(app.color, 0.92) : '#2A2A2E';
    var bottom = k ? k[3][1] : app.color ? darken(app.color, 0.62) : '#161618';
    paint(box, top, bottom);
    var word = el('div', 'word', box, app.title);
    if (wordSize) word.style.fontSize = wordSize + 'px';
    if (app.icon) {
      var img = el('img', '', box), url = app.icon;
      word.style.visibility = 'hidden';
      img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); word.style.visibility = ''; };
      if (lifted[url]) { showLogo(img, box, top, bottom, lifted[url], !k); return; }
      if (lifted[url] !== false) {
        img.onload = function () {
          img.onload = null;
          if (lifted[url] === undefined) lifted[url] = lift(img);
          if (lifted[url]) showLogo(img, box, top, bottom, lifted[url], !k);
        };
      }
      img.src = url;
    }
  }

  var apps = [], shelf = [], others = [], inputs = [];

  /** shelf_apps in config.properties: the shelf in that order, by id or name (part of it). */
  var WANTED = (CONFIG.shelfApps || []).map(function (s) { return s.toLowerCase(); });

  function pickShelf() {
    if (WANTED.length && Prefs.shelfConfig() !== WANTED.join(',')) {
      Prefs.set('shelf', null);
      Prefs.set('shelfConfig', WANTED.join(','));
    }
    var chosen = Prefs.shelf(), out = [];
    if (chosen) {
      for (var i = 0; i < chosen.length; i++) {
        for (var j = 0; j < apps.length; j++) if (apps[j].id === chosen[i]) out.push(apps[j]);
      }
    } else if (WANTED.length) {
      for (var w = 0; w < WANTED.length; w++) {
        for (var k = 0; k < apps.length; k++) {
          var id = apps[k].id.toLowerCase(), title = apps[k].title.toLowerCase();
          if ((id.indexOf(WANTED[w]) >= 0 || title.indexOf(WANTED[w]) >= 0) && out.indexOf(apps[k]) < 0) { out.push(apps[k]); break; }
        }
      }
      if (!out.length) out = apps.slice(0, FEW_APPS);
    } else {
      for (var s = 0; s < SHELF.length && out.length < FEW_APPS; s++) {
        for (var a = 0; a < apps.length; a++) {
          if ((SHELF[s][1].test(apps[a].id) || SHELF[s][2].test(apps[a].title)) && out.indexOf(apps[a]) < 0) { out.push(apps[a]); break; }
        }
      }
      if (!out.length) out = apps.slice(0, FEW_APPS);
    }
    shelf = out;
    others = apps.filter(function (x) { return shelf.indexOf(x) < 0; });
  }

  // MARK: - Focus

  var Z = {TOP: 'top', CARDS: 'cards', SHELF: 'shelf', DRAWER: 'drawer', APPS: 'apps', SETTINGS: 'settings', EDIT: 'edit',
    LANG: 'lang', CITY: 'city', KEY: 'key', ABOUT: 'about', NEWS: 'news', DETAIL: 'detail', INPUT: 'input', DIAG: 'diag',
    TIMER: 'timer'};
  var st = {zone: Z.SHELF, top: 0, tab: 0, card: 0, shelf: 0, drawer: 0, grid: 0, row: 0, edit: 0, lang: 0,
    city: 0, key: 0, news: 0, detail: 0, timer: 0};
  var cards = [];

  function sheetOpen() {
    return st.zone === Z.APPS || st.zone === Z.SETTINGS || st.zone === Z.EDIT || st.zone === Z.LANG ||
      st.zone === Z.CITY || st.zone === Z.KEY || st.zone === Z.ABOUT ||
      st.zone === Z.NEWS || st.zone === Z.DETAIL || st.zone === Z.INPUT || st.zone === Z.DIAG || st.zone === Z.TIMER;
  }

  function updateFocus() {
    var i, list;
    list = $('tabs').children;
    for (i = 0; i < list.length; i++) {
      setClass(list[i], 'on', i === st.tab);
      setClass(list[i], 'focus', st.zone === Z.TOP && st.top === i);
    }
    list = $('buttons').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.TOP && st.top === 3 + i);
    setClass($('quotes'), 'hide', st.zone === Z.TOP && st.top >= 3);
    layoutCards();
    list = $('cards').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.CARDS && st.card === i);
    list = $('tiles').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.SHELF && st.shelf === i);
    revealShelf();
    list = document.querySelectorAll('#drawer .key');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.DRAWER && st.drawer === i);
    list = document.querySelectorAll('#apps .cell');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.APPS && st.grid === i);
    var rows = Math.max(1, Math.ceil(others.length / 5)), r = Math.floor(st.grid / 5), first = Math.max(0, Math.min(rows - 3, r - 1));
    $('apps').lastChild.style.webkitTransform = $('apps').lastChild.style.transform = 'translateY(' + (-first * 239) + 'px)';
    focusRows($('settings'), st.row, st.zone === Z.SETTINGS);
    focusRows($('shelfedit'), st.edit, st.zone === Z.EDIT);
    focusRows($('langpick'), st.lang, st.zone === Z.LANG);
    focusRows($('news'), st.news, st.zone === Z.NEWS);
    focusRows($('timer'), st.timer, st.zone === Z.TIMER);
    list = document.querySelectorAll('#detail .act');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.DETAIL && st.detail === i);
    if (langHint) langHint.textContent = (st.lang + 1) + ' / ' + languageChoices().length + '  ·  ' + tr('OK picks, Back cancels.');
    focusRows($('citypick'), st.city, st.zone === Z.CITY);
    focusRows($('keypick'), st.key, st.zone === Z.KEY);
    setClass(body, 'drawer-open', st.zone === Z.DRAWER);
    followSoon();
  }

  function focusRows(sheet, index, on) {
    var rows = sheet.querySelectorAll('.row');
    for (var i = 0; i < rows.length; i++) setClass(rows[i], 'focus', on && i === index);
    var holder = sheet.querySelector('.rows');
    if (!holder) return;
    var visible = 7, first = Math.max(0, Math.min(rows.length - visible, index - 3));
    holder.style.webkitTransform = holder.style.transform = 'translateY(' + (-first * 78) + 'px)';
  }

  function nearest(nodes, x) {
    var best = 0, bestD = 1e9;
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect(), d = Math.abs((r.left + r.right) / 2 - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function centerX(node) {
    if (!node) return 960;
    var r = node.getBoundingClientRect();
    return (r.left + r.right) / 2;
  }

  // MARK: - Top: title, tabs, buttons, quotes

  var TAB_KIND = [null, 'movie', 'tv'];

  function renderTop() {
    $('title').textContent = tr('For You');
    var tabs = $('tabs');
    tabs.innerHTML = '';
    var names = [tr('Explore'), tr('Movies'), tr('Shows')];
    for (var i = 0; i < 3; i++) {
      var t = el('button', 'tab', tabs, names[i]);
      hover(t, Z.TOP, i);
    }
    var buttons = $('buttons');
    buttons.innerHTML = '';
    var defs = [['live_tv', tr('light|Live TV')], ['hdmi', tr('HDMI Inputs')], ['settings', tr('light|Settings')]];
    for (var b = 0; b < 3; b++) {
      var r = el('button', 'round' + (b === 2 ? ' last' : ''), buttons);
      r.style.left = (1596 + 88 * b) + 'px';
      sym(defs[b][0], r);
      el('div', 'tip', r, defs[b][1]);
      hover(r, Z.TOP, 3 + b);
    }
  }

  function renderQuotes() {
    var q = $('quotes'), coins = Data.activeCoins();
    q.innerHTML = '';
    for (var i = 0; i < coins.length; i++) {
      var item = el('span', 'q', q);
      coin(coins[i], item);
      el('span', '', item, Data.compact(Data.prices[coins[i]]));
    }
  }

  // MARK: - Picks and background

  function renderCards() {
    var list = Data.picks(TAB_KIND[st.tab]);
    var holder = $('cards');
    setClass(body, 'no-picks', !list.length);
    setClass(body, 'no-key', !Data.hasKey());   // as on Android: no title or tabs that could never show anything
    if (!Data.hasKey() && st.zone === Z.TOP && st.top < 3) st.top = 3;
    var same = list.length === cards.length;
    for (var i = 0; same && i < list.length; i++) same = list[i].id === cards[i].id && list[i].backdrop === cards[i].backdrop && list[i].meta === cards[i].meta;
    if (same && holder.children.length === list.length && list.length) return;
    cards = list;
    holder.innerHTML = '';
    for (var c = 0; c < list.length; c++) {
      var p = list[c], card = el('div', 'card', holder);
      var img = el('div', 'img', card);
      // Narrow: the poster (the backdrop cropped without one); the wide card fades its backdrop in over it, loaded then.
      var poster = el('div', 'layer', img);
      poster.style.backgroundImage = 'url(' + (p.poster ? Data.image(p.poster, 'w342') : Data.image(p.backdrop, 'w780')) + ')';
      el('div', 'layer back', img);
      el('div', 'name', card, p.title);
      if (p.meta) el('div', 'meta', card, p.meta);
      hover(card, Z.CARDS, c);
    }
    st.card = Math.min(st.card, Math.max(0, list.length - 1));
    if (!list.length && st.zone === Z.CARDS) st.zone = Z.SHELF;
    backdrop(wantedBg(list));
    renderPlaceholder(list.length > 0);
    layoutCards();
    updateFocus();
  }

  /** No picks: the shape of them while they load, or why they aren't here and what to do about it. */
  function renderPlaceholder(has) {
    var holder = $('placeholder');
    holder.innerHTML = '';
    setClass(holder, 'on', !has);
    if (has) { setClass(body, 'picks-loading', false); return; }
    var error = Data.recsError ? Data.recsError() : '';
    if (Data.hasKey() && !error) {
      setClass(body, 'picks-loading', true);
      var rects = [[80, 1040], [1160, 320], [1520, 320]];
      for (var i = 0; i < 3; i++) {
        var ghost = el('div', 'ghost', holder);
        ghost.style.left = rects[i][0] + 'px';
        ghost.style.width = rects[i][1] + 'px';
      }
      return;
    }
    setClass(body, 'picks-loading', false);
    var note = el('div', 'note', holder);
    if (!Data.hasKey()) {
      el('div', 'n-title', note, tr('No picks yet'));
      el('div', 'n-body', note, tr('The picks come from TMDB, with your own free key. Add it in Home Settings and they appear here.'));
      el('div', 'n-hint', note, tr('↓ opens the drawer · Home Settings › TMDB key'));
    } else {
      el('div', 'n-title', note, tr("Couldn't load the picks"));
      el('div', 'n-body', note, error === 'TMDB rejected the key' ? tr('TMDB rejected the key. Check it in Home Settings.') : tr('Check the TV’s connection, then open Home Settings to try again.'));
      el('div', 'n-hint', note, tr('Home Settings › TMDB key'));
    }
  }

  /**
   * The card with focus (st.card, also while focus is elsewhere) is the wide one, the others narrow; past the third the
   * row scrolls a card at a time (the holder slides), and the cards at the edges lose their text. Only the holder's
   * transform and the backdrop's opacity animate: the widths change at once (older TVs).
   */
  function layoutCards() {
    var holder = $('cards'), nodes = holder.children, left = 80, scroll = Math.max(0, st.card - 2) * 360;
    for (var i = 0; i < nodes.length; i++) {
      var wide = i === st.card, w = wide ? 1040 : 320, n = nodes[i], at = left - scroll;
      n.style.left = left + 'px';
      n.style.width = w + 'px';
      setClass(n, 'wide', wide);
      setClass(n, 'edge', at < 0 || at > 1740);
      if (wide && !n.getAttribute('data-back') && cards[i]) {
        n.setAttribute('data-back', '1');
        n.querySelector('.back').style.backgroundImage = 'url(' + Data.image(cards[i].backdrop, 'w1280') + ')';
      }
      left += w + 40;
    }
    holder.style.webkitTransform = holder.style.transform = 'translateX(' + (-scroll) + 'px)';
  }

  var bgUrl = null, bgFront = 'bgA';

  var heroUrl = '', heroAt = 0;

  /** Behind the home: the leading headline's picture when the feeds bring one, else the focused pick's. */
  function wantedBg(list) {
    var at = list.length ? Math.min(st.card, list.length - 1) : 0;
    var pick = list.length ? Data.image(list[at].backdrop, 'w300') : '';
    if (!Prefs.get('newsbg', true) || !Feeds.enabled()) return pick;
    var items = Feeds.items(), hero = null;
    for (var i = 0; i < items.length; i++) if (items[i].image) { hero = items[i]; break; }
    if (!hero) return pick;
    // A new headline's photo at most every 15 minutes: it is a 100-550 KB download on a TV.
    if (!heroUrl || Date.now() - heroAt > 900000) { heroUrl = hero.image; heroAt = Date.now(); }
    return heroUrl;
  }

  /** A photo as the background: drawn tiny and stretched, it's already as soft as a heavy blur. */
  function backdrop(url) {
    if (url === bgUrl) return;
    bgUrl = url;
    var next = bgFront === 'bgA' ? 'bgB' : 'bgA';
    if (!url) {
      setClass($('bgA'), 'on', false);
      setClass($('bgB'), 'on', false);
      return;
    }
    var img = new Image();
    img.onload = function () {
      if (bgUrl !== url) return;
      var canvas = $(next), ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setClass(canvas, 'on', true);
      setClass($(bgFront), 'on', false);
      bgFront = next;
    };
    img.src = url;
  }

  // As HomeView's bgFollow: the background follows the focused pick.
  var BG_FOLLOW_MS = 500, bgTimer = 0;

  /** The focused pick's photo as the background once the focus has rested on it: a quick run along the row fades once. */
  function followSoon() {
    clearTimeout(bgTimer);
    bgTimer = setTimeout(function () {
      if (cards.length) backdrop(Data.image(cards[Math.min(st.card, cards.length - 1)].backdrop, 'w300'));
    }, BG_FOLLOW_MS);
  }

  function renderClock() {
    var d = new Date(), c = $('clock');
    c.firstChild.textContent = formatDate('format|h:mm', d.getTime());
    c.lastChild.textContent = formatDate('format|EEEE, MMMM d', d.getTime());
  }

  /** On the minute, so the clock never runs late (the 30-second refresh could, by up to 30 s). */
  function tickClock() {
    renderClock();
    setTimeout(tickClock, 60000 - Date.now() % 60000 + 50);
  }

  // MARK: - Shelf

  var shelfFirst = 0, tileStep = 0, tileLeft = 0;

  function renderShelf() {
    var n = Math.min(shelf.length, SHELF_VISIBLE), gap = 48, pad = 40;
    // 16:9 tiles, as on Android: never taller than 126, and the glass keeps its bottom edge.
    var tw = Math.min(126 * 16 / 9, (1760 - Math.max(0, n - 1) * gap) / Math.max(1, n)), th = tw * 9 / 16;
    var width = n * tw + Math.max(0, n - 1) * gap, left = (1920 - width) / 2;
    var platter = $('platter');
    platter.style.display = n ? '' : 'none';
    platter.style.left = (left - pad) + 'px';
    platter.style.width = (width + 2 * pad) + 'px';
    platter.style.top = (814 + 126 - th) + 'px';
    platter.style.height = (th + 2 * pad) + 'px';
    $('quotes').style.right = (1920 - left - width) + 'px';
    var tiles = $('tiles');
    tiles.innerHTML = '';
    tileStep = tw + gap;
    tileLeft = left;
    shelfFirst = Math.max(0, Math.min(shelfFirst, shelf.length - n));
    for (var i = 0; i < shelf.length; i++) {
      var t = el('div', 'tile', tiles);
      t.style.top = (854 + 126 - th) + 'px';
      t.style.width = tw + 'px';
      t.style.height = th + 'px';
      face(shelf[i], t, wordFit(shelf[i].title, tw, 30));
      hover(t, Z.SHELF, i);
    }
    // More apps than fit: a small arrow inside the glass's edge on each side that has more, where no tile reaches
    // even focused (inside the screen's safe area, as on Android).
    platter.innerHTML = '';
    for (var a = 0; a < 2; a++) {
      var arrow = sym('chevron_right', platter);
      arrow.className += a ? ' more' : ' more back';
      arrow.style.left = (a ? width + 2 * pad - 14 : 14) - 8.5 + 'px';
      arrow.style.top = (pad + th / 2 - 8.5) + 'px';
    }
    st.shelf = Math.min(st.shelf, Math.max(0, shelf.length - 1));
    placeTiles();
  }

  /** The row slides (a transform on #tiles, which old TVs animate), and the apps it takes past the glass fade out. */
  function placeTiles() {
    var row = $('tiles'), tiles = row.children, n = Math.min(shelf.length, SHELF_VISIBLE);
    for (var i = 0; i < shelf.length; i++) {
      var shown = i >= shelfFirst && i < shelfFirst + n;
      tiles[i].style.left = (tileLeft + i * tileStep) + 'px';
      tiles[i].style.opacity = shown ? '' : '0';
      tiles[i].style.pointerEvents = shown ? '' : 'none';
    }
    row.style.webkitTransform = row.style.transform = 'translateX(' + (-shelfFirst * tileStep) + 'px)';
    var arrows = $('platter').children;
    arrows[0].style.visibility = shelfFirst > 0 ? '' : 'hidden';
    arrows[1].style.visibility = shelfFirst + n < shelf.length ? '' : 'hidden';
  }

  /** Scrolls the shelf, one app at a time, so the focused app is shown. */
  function revealShelf() {
    var n = Math.min(shelf.length, SHELF_VISIBLE);
    var first = Math.max(0, Math.min(Math.max(shelfFirst, st.shelf - n + 1), Math.min(st.shelf, shelf.length - n)));
    if (first === shelfFirst || !shelf.length) return;
    shelfFirst = first;
    placeTiles();
  }

  // MARK: - Drawer

  var drawerItems = [], drawerInputs = 0;

  function renderDrawer() {
    var d = $('drawer');
    d.innerHTML = '';
    drawerItems = [];
    for (var i = 0; i < inputs.length; i++) {
      var x = inputs[i];
      drawerItems.push({label: x.label || tr('Live TV'), symbol: x.symbol, off: !x.connected, run: launcher(x.id, x.label)});
    }
    drawerInputs = drawerItems.length;
    if (Feeds.enabled() && Feeds.items().length) drawerItems.push({label: tr('News'), symbol: 'bell', run: openNews});
    drawerItems.push({label: sleepAt ? sleepMinutes() + ' min' : tr('Timer'), symbol: 'bedtime', run: openTimer});
    drawerItems.push({label: tr('All Apps'), symbol: 'apps', run: openApps});
    drawerItems.push({label: tr('Home Settings'), symbol: 'settings', run: openSettings});
    if (TV.canOpenSettings) drawerItems.push({label: tr('TV Settings'), symbol: 'tv_settings', run: tvSettings});
    var n = drawerItems.length, gap = 18, groupGap = 56, groups = drawerInputs > 0 && drawerInputs < n ? 2 : 1;
    var tw = Math.min(230, (1760 - Math.max(0, n - groups) * gap - (groups - 1) * groupGap) / Math.max(1, n));
    var xPos = 80;
    for (var k = 0; k < n; k++) {
      if (k === drawerInputs && k > 0) {
        xPos += groupGap - gap;
        el('div', 'row-title', d, tr('Shortcuts')).style.left = (xPos + 4) + 'px';
      }
      if (k === 0 && drawerInputs) el('div', 'row-title', d, tr('Inputs')).style.left = '84px';
      var item = drawerItems[k], key = el('div', 'key glass' + (item.off ? ' off' : ''), d);
      key.style.left = xPos + 'px';
      key.style.width = tw + 'px';
      sym(item.symbol, key);
      el('div', 'label', key, item.label);
      hover(key, Z.DRAWER, k);
      xPos += tw + gap;
    }
    renderPanels();
    updateFocus();
  }

  function renderPanels() {
    var d = $('drawer');
    var old = d.querySelectorAll('.panel');
    for (var o = 0; o < old.length; o++) d.removeChild(old[o]);
    var wx = Prefs.weather(), coins = Data.activeCoins(), qt = coins.length > 0;
    var split = 80 + 1760 * 0.585;
    if (wx) {
      var w = el('div', 'panel glass', d);
      w.id = 'weather';
      w.style.left = '80px';
      w.style.width = ((qt ? split - 16 : 1840) - 80) + 'px';
      renderWeather(w);
    }
    if (qt) {
      var q = el('div', 'panel glass', d);
      q.id = 'prices';
      var left = wx ? split + 16 : 80;
      q.style.left = left + 'px';
      q.style.width = (1840 - left) + 'px';
      renderPrices(q, coins);
    }
  }

  function renderWeather(card) {
    el('div', 'head', card, Data.city || tr('Weather'));
    var w = Data.weather;
    if (!w) {
      el('div', 'cond', card, tr('No weather data right now.')).style.top = '96px';
      return;
    }
    var now = el('div', 'now', card);
    sym(Data.symbol(w.code, w.isDay), now);
    el('span', 'temp', now, Data.degrees(w.temp));
    el('div', 'cond', card, Data.condition(w.code, w.isDay));
    var extra = [];
    if (w.rain) {
      if (w.rain.inMin !== null) extra.push(trf('Rain in ~{n} min', {n: Math.max(5, Math.round(w.rain.inMin / 5) * 5)}));
      else extra.push(tr('No rain in the next 2 hours'));
    }
    if (w.uv >= 3) extra.push('UV ' + Math.round(w.uv));
    var air = Data.air;
    if (air && air.aqi !== null && air.aqi !== undefined) extra.push('AQI ' + Math.round(air.aqi));
    if (extra.length) el('div', 'extra', card, extra.join(' · '));
    el('div', 'range', card, trf('H:{max}', {max: Data.degrees(w.max)}) + '   ' + trf('L:{min}', {min: Data.degrees(w.min)}));
    el('div', 'split', card);
    // Home Settings → Forecast: the next 6 hours or the next 5 days (the hours until a forecast has days).
    var days = Prefs.forecast() === 'days' && w.days && w.days.length > 0, list = days ? w.days : w.hours, n = days ? 5 : 6;
    var hours = el('div', 'hours', card), width = parseFloat(card.style.width) - 30 - 422, hw = width / n;
    for (var i = 0; list && i < list.length && i < n; i++) {
      var h = el('div', 'hour', hours), x = list[i];
      h.style.left = (hw * i) + 'px';
      h.style.width = hw + 'px';
      el('div', 't', h, days ? Data.weekday(x.at) : Data.hour(x.at));
      sym(Data.symbol(x.code, days || x.day), h);
      var t = el('div', 'd', h, Data.degrees(days ? x.max : x.temp));
      if (days) el('span', 'low', t, Data.degrees(x.min));
    }
    var sun = el('div', 'sun', card);
    if (w.sunrise) { var a = el('span', '', sun); sym('sunrise', a); a.appendChild(document.createTextNode(trf('Sunrise {time}', {time: Data.time(w.sunrise)}))); }
    if (w.sunset) { var b = el('span', '', sun); sym('sunset', b); b.appendChild(document.createTextNode(trf('Sunset {time}', {time: Data.time(w.sunset)}))); }
  }

  function renderPrices(card, coins) {
    el('div', 'head', card, tr('Crypto'));
    var stale = Data.staleness(Data.pricesAt, 5 * 60000);
    el('div', 'side', card, stale ? trf('quotes|{ago}', {ago: stale}) : tr('24h change'));
    for (var j = 0; j < coins.length; j++) {
      var i = coins[j], row = el('div', 'coin', card);
      row.style.top = (86 + 52 * j) + 'px';
      coin(i, row);
      el('span', 'n', row, Data.coinName(i));
      el('span', 'p', row, Data.money(Data.prices[i]));
      var ch = Data.changes[i];
      if (!isNaN(ch)) el('span', 'c ' + (ch >= 0 ? 'up' : 'down'), row, Data.change(ch));
    }
  }

  function openDrawer() {
    if (!drawerItems.length) return;
    var tiles = $('tiles').children;
    st.zone = Z.DRAWER;
    st.drawer = Math.min(drawerItems.length - 1, nearest(document.querySelectorAll('#drawer .key'), centerX(tiles[st.shelf])));
    updateFocus();
  }

  function closeDrawer() {
    var keys = document.querySelectorAll('#drawer .key');
    st.zone = Z.SHELF;
    if (shelf.length) st.shelf = nearest($('tiles').children, centerX(keys[st.drawer]));
    updateFocus();
  }

  // MARK: - News: the headlines the TV read by itself, and the TV's browser for the whole story

  function openLink(url) {
    if (!url) return;
    TV.open(url, function (ok) {
      if (!ok) toast(tr("Couldn't open the TV's browser."));
    });
  }

  function renderNews() {
    var box = $('news').firstChild, list = Feeds.items(), shown = Math.min(list.length, 12);
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('bell', title);
    title.appendChild(document.createTextNode(tr('News')));
    var holder = el('div', 'list', box), rows = el('div', 'rows', holder);
    holder.style.height = Math.min(Math.max(1, shown), 6) * 78 + 'px';
    for (var i = 0; i < shown; i++) {
      var row = el('div', 'row', rows, list[i].title);
      el('span', 'value', row, list[i].source);
      hover(row, Z.NEWS, i);
    }
    if (!shown) el('div', 'row', rows, tr('No headlines right now.'));
    var hint = el('div', 'hint', box, shown ? tr('OK opens it in the TV’s browser.') : tr('Home Settings › News, or check the connection.'));
    var ago = Feeds.ago(Feeds.at());
    if (shown && ago) hint.textContent += '  ·  ' + ago;
    updateFocus();
  }

  function openNews() {
    if (!Feeds.items().length) { toast(tr('No headlines right now.')); return; }
    st.zone = Z.NEWS;
    st.news = 0;
    renderNews();
    setClass($('news'), 'open', true);
    updateFocus();
  }

  // MARK: - The title: what it is, and one button that opens it

  var detailPick = null;

  function openDetail(p) {
    if (!p) return;
    detailPick = p;
    st.detail = 0;
    st.zone = Z.DETAIL;
    renderDetail();
    setClass($('detail'), 'open', true);
    updateFocus();
  }

  function renderDetail() {
    var box = $('detail').firstChild, p = detailPick;
    box.innerHTML = '';
    if (!p) return;
    var art = el('div', 'art', box);
    if (p.backdrop) art.style.backgroundImage = 'url(' + Data.image(p.backdrop, 'w780') + ')';
    el('div', 'shade', box);
    var info = el('div', 'info', box);
    el('div', 'name', info, p.title);
    var meta = p.meta || '';
    if (p.rating) meta = (meta ? meta + ' · ' : '') + p.rating.toFixed(1) + '/10';
    el('div', 'meta', info, meta);
    el('div', 'overview', info, p.overview || '');
    var actions = el('div', 'actions', box), app = Data.appFor(p.app);
    var watch = el('div', 'act' + (app ? '' : ' off'), actions, app ? trf('Watch on {app}', {app: app.title}) : tr('Watch'));
    hover(watch, Z.DETAIL, 0);
    var close = el('div', 'act', actions, tr('Close'));
    hover(close, Z.DETAIL, 1);
  }

  function closeDetail() {
    setClass($('detail'), 'open', false);
    detailPick = null;
    st.zone = Z.SHELF;
    updateFocus();
  }

  // MARK: - Settings typed on the TV: the TMDB key and the city

  var inputKind = '', inputField = null, cityResults = [];

  function openInput(kind) {
    inputKind = kind;
    cityResults = [];
    var box = $('input').firstChild, text = kind === 'key' ? tr('TMDB key') : tr('City');
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym(kind === 'key' ? 'settings' : 'home', title);
    title.appendChild(document.createTextNode(text));
    var field = document.createElement('input');
    field.className = 'field';
    field.type = 'text';
    field.setAttribute('autocorrect', 'off');
    field.setAttribute('autocapitalize', 'off');
    field.setAttribute('spellcheck', 'false');
    field.placeholder = kind === 'key' ? tr('Paste the API Read Access Token') : tr('Type a city name');
    field.value = kind === 'key' ? String(Prefs.get('tmdbKey', '') || '') : (Place.city || '');
    box.appendChild(field);
    el('div', 'hint', box, kind === 'key'
      ? tr('OK saves and restarts Free My TV. Back cancels.')
      : tr('Type the name, then OK searches. Back cancels.'));
    inputField = field;
    setClass($('input'), 'open', true);
    setClass($('settings'), 'open', false);
    st.zone = Z.INPUT;
    setTimeout(function () { try { field.focus(); } catch (e) {} }, 60);
  }

  function closeInput() {
    setClass($('input'), 'open', false);
    inputField = null;
    openSettings();
  }

  function submitInput() {
    if (!inputField) return;
    var value = String(inputField.value || '').replace(/^\s+|\s+$/g, '');
    if (!value) { closeInput(); return; }
    if (inputKind === 'key') {
      Prefs.set('tmdbKey', value);
      toast(tr('Saving and restarting…'));
      setTimeout(function () { try { location.reload(); } catch (e) {} }, 600);
      return;
    }
    searchCity(value);
  }

  function searchCity(name) {
    var x = new XMLHttpRequest(), over = false;
    x.open('GET', 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(name)
      + '&count=5&language=' + I18N.base + '&format=json', true);
    x.timeout = 10000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || over) return;
      over = true;
      var data = null;
      try { data = JSON.parse(x.responseText); } catch (e) {}
      cityResults = data && data.results ? data.results : [];
      if (!cityResults.length) { toast(tr('No city found with that name.')); return; }
      renderCityResults();
    };
    x.ontimeout = x.onerror = function () { if (!over) { over = true; toast(tr('No connection.')); } };
    x.send();
  }

  function renderCityResults() {
    var box = $('input').firstChild;
    box.innerHTML = '';
    el('div', 'title', box, tr('City'));
    var holder = el('div', 'list', box), rows = el('div', 'rows', holder);
    holder.style.height = Math.min(cityResults.length, 5) * 78 + 'px';
    for (var i = 0; i < cityResults.length && i < 5; i++) {
      var r = cityResults[i], where = [r.admin1, r.country].filter(function (s) { return !!s; }).join(', ');
      var row = el('div', 'row', rows, r.name);
      el('span', 'value', row, where);
      hover(row, Z.CITY, i);
    }
    el('div', 'hint', box, tr('OK uses this city. Back goes back.'));
    st.zone = Z.CITY;
    st.city = 0;
    updateFocus();
  }

  function pickCity() {
    var r = cityResults[st.city];
    if (!r) return;
    Prefs.set('lat', r.latitude);
    Prefs.set('lon', r.longitude);
    Prefs.set('cityName', r.name);
    if (r.country_code) Prefs.set('region', r.country_code);
    if (typeof r.id !== 'undefined') Prefs.set('cityId', r.id);
    toast(tr('Saving and restarting…'));
    setTimeout(function () { try { location.reload(); } catch (e) {} }, 600);
  }

  // MARK: - Sleep timer

  var timerRowsNow = [];

  function timerRows() {
    var rows = [], opts = [15, 30, 60, 90], i;
    for (i = 0; i < opts.length; i++) {
      (function (n) {
        rows.push({label: trf('Turn off in {n} min', {n: n}),
          step: function () { setSleep(n); closeSheets(); }});
      })(opts[i]);
    }
    if (sleepAt) rows.push({label: tr('Cancel timer'), value: sleepMinutes() + ' min', step: function () { cancelSleep(); }});
    rows.push({label: tr('Turn the TV off'), step: function () { closeSheets(); turnOffNow(); }});
    return rows;
  }

  function renderTimer() {
    var box = $('timer').firstChild;
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('bedtime', title);
    title.appendChild(document.createTextNode(tr('Sleep timer')));
    timerRowsNow = timerRows();
    var holder = el('div', 'list', box), rows = el('div', 'rows', holder);
    holder.style.height = Math.min(timerRowsNow.length, 7) * 78 + 'px';
    for (var i = 0; i < timerRowsNow.length; i++) {
      var r = timerRowsNow[i], row = el('div', 'row', rows, r.label);
      if (r.value) el('span', 'value', row, r.value);
      hover(row, Z.TIMER, i);
    }
    el('div', 'hint', box, sleepAt ? trf('Turning off in {n} min', {n: sleepMinutes()})
      : tr('The TV turns off when the timer ends.'));
    if (st.zone === Z.TIMER) updateFocus();
  }

  function openTimer() {
    st.zone = Z.TIMER;
    st.timer = 0;
    renderTimer();
    setClass($('settings'), 'open', false);
    setClass($('timer'), 'open', true);
    updateFocus();
  }

  // MARK: - Diagnostics: what this app can and can't read on this TV

  function openDiag() {
    var box = $('diag').firstChild, status = Feeds.status(), sources = Feeds.sources();
    box.innerHTML = '';
    el('div', 'title', box, tr('Diagnostics'));
    function line(name, value, state) {
      var row = el('div', 'line' + (state ? ' ' + state : ''), box);
      el('b', '', row, name + ': ');
      row.appendChild(document.createTextNode(value));
    }
    var tv = TV.status ? TV.status() : {source: TV.name};
    line('App', 'Free My TV custom 1.2 · ' + TV.name);
    line('Apps on this TV', apps.length + ' (' + (tv.source || 'unknown') + ')', apps.length ? 'good' : 'bad');
    if (tv.pairing) line('System app list', tv.pairing, tv.pairing.indexOf('paired') === 0 ? 'good' : '');
    line('TMDB key', Data.hasKey() ? 'set (' + Data.keyHint() + ')' : 'missing', Data.hasKey() ? 'good' : 'bad');
    line('City', (Place.city || tr('Automatic')) + ' · ' + Place.lat + ', ' + Place.lon);
    line('Picks', cards.length + ' shown · ' + (Data.loading() ? 'loading' : (Data.recsError() || 'ok')),
      Data.recsError() ? 'bad' : '');
    line('Headlines', status.count + ' · ' + (Feeds.at() ? Feeds.ago(Feeds.at()) || 'now' : 'never'),
      status.count ? 'good' : 'bad');
    for (var i = 0; i < sources.length; i++) {
      var why = sources[i].error === 'no connection' ? 'no connection, or the site denies the TV (CORS)' : sources[i].error;
      line('  ' + sources[i].name, (sources[i].ok ? 'ok' : 'failed') + ' · ' + sources[i].count + ' · '
        + sources[i].ms + ' ms' + (why ? ' · ' + why : ''), sources[i].ok ? 'good' : 'bad');
    }
    var al = Feeds.alert();
    line('Weather alert', al ? al.event + ' · ' + al.severity : 'none', al ? 'bad' : '');
    el('div', 'hint', box, tr('Back closes. Feeds come from rss_feeds in config.properties.'));
    st.zone = Z.DIAG;
    setClass($('settings'), 'open', false);
    setClass($('diag'), 'open', true);
    updateFocus();
  }

  // MARK: - The weather alert, when INMET has one for this city

  var barSeq = 0, barIndex = 0, barTimer = 0;

  /** off | rotate | marquee: how the headlines move along the top strip. */
  function barMode() { return Prefs.get('bar', 'rotate'); }

  /** The strip at the very top: the weather alert on the left, the headlines next to it. */
  function renderAlert() {
    var box = $('alert'), al = Feeds.enabled() ? Feeds.alert() : null;
    var list = Feeds.enabled() ? Feeds.items() : [], mode = barMode();
    if (barTimer) { clearInterval(barTimer); barTimer = 0; }
    box.innerHTML = '';
    box.onclick = null;
    if (!al && (!list.length || mode === 'off')) { setClass(box, 'on', false); return; }
    setClass(box, 'nochip', !al);
    var bar = el('div', 'bar', box);
    if (al) {
      var chip = el('div', 'chip', bar);
      var dot = el('span', 'dot', chip);
      dot.style.backgroundColor = al.color;
      var text = trf('{event} · {severity}', {event: al.event, severity: al.severity});
      if (al.until) text += ' · ' + trf('until {when}', {when: Feeds.when(al.until)});
      el('span', 'ct', chip, text);
      chip.onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); openLink(al.link); };
    }
    if (list.length && mode !== 'off') {
      var track = el('div', 'track', bar);
      if (mode === 'marquee') marquee(track, list);
      else rotate(track, list);
    }
    setClass(box, 'on', true);
  }

  /** One headline at a time, 7s each: the way TV news does it, and readable from the sofa. */
  function rotate(track, list) {
    var line = el('div', 'hl', track);
    function paint() {
      var it = list[barIndex % list.length];
      line.innerHTML = '';
      el('b', '', line, it.source);
      line.appendChild(document.createTextNode(' · ' + it.title));
    }
    barIndex = 0;
    paint();
    line.onclick = function () { var it = list[barIndex % list.length]; if (it) openLink(it.link); };
    barTimer = setInterval(function () {
      barIndex = (barIndex + 1) % list.length;
      line.style.opacity = '0';
      setTimeout(function () { if (!line.parentNode) return; paint(); line.style.opacity = '1'; }, 280);
    }, 7000);
  }

  /** The whole list sliding: the marquee, for whoever prefers motion. */
  function marquee(track, list) {
    // Eight headlines, not thirty: a 30-item marquee would be a 26,000px layer on a TV's GPU.
    list = list.slice(0, 8);
    var text = '', i;
    for (i = 0; i < list.length; i++) {
      text += (i ? '\u00a0\u00a0\u00a0\u00b7\u00a0\u00a0\u00a0' : '') + list[i].source + ' · ' + list[i].title;
    }
    var mq = el('div', 'mq', track);
    el('span', '', mq, text);
    el('span', '', mq, text);
    var name = 'fmvbar' + (++barSeq);
    setTimeout(function () {
      var w = mq.firstChild.offsetWidth;
      if (!w) return;
      var style = document.getElementById('barstyle');
      if (!style) { style = document.createElement('style'); style.id = 'barstyle'; document.head.appendChild(style); }
      style.textContent = '@-webkit-keyframes ' + name + ' { from { -webkit-transform: translate3d(0,0,0); } to { -webkit-transform: translate3d(-' + w + 'px,0,0); } }' +
        '@keyframes ' + name + ' { from { transform: translate3d(0,0,0); } to { transform: translate3d(-' + w + 'px,0,0); } }';
      mq.style.animation = name + ' ' + (w / 90) + 's linear infinite';
      mq.style.webkitAnimation = name + ' ' + (w / 90) + 's linear infinite';
    }, 60);
  }

  // MARK: - All Apps

  function renderApps() {
    var sheet = $('apps');
    sheet.firstChild.textContent = tr('All Apps');
    var grid = sheet.lastChild;
    grid.innerHTML = '';
    for (var i = 0; i < others.length; i++) {
      var r = Math.floor(i / 5), c = i % 5, cell = el('div', 'cell', grid);
      cell.style.left = (130 + c * 340) + 'px';
      cell.style.top = (196 + r * 239) + 'px';
      face(others[i], el('div', 'face', cell), wordFit(others[i].title, 300, 34));
      el('div', 'label', cell, others[i].title);
      hover(cell, Z.APPS, i);
    }
  }

  function openApps() {
    renderApps();
    st.zone = Z.APPS;
    st.grid = 0;
    setClass($('apps'), 'open', true);
    fitLogos($('apps'));
    updateFocus();
  }

  function closeSheets() {
    setClass($('apps'), 'open', false);
    setClass($('settings'), 'open', false);
    setClass($('shelfedit'), 'open', false);
    setClass($('langpick'), 'open', false);
    setClass($('about'), 'open', false);
    closeField('citypick');
    closeField('keypick');
    setClass($('citypick'), 'open', false);
    setClass($('keypick'), 'open', false);
    setClass($('news'), 'open', false);
    setClass($('detail'), 'open', false);
    setClass($('input'), 'open', false);
    setClass($('diag'), 'open', false);
    setClass($('timer'), 'open', false);
    detailPick = null;
    langHint = null;
    st.zone = Z.SHELF;
    updateFocus();
  }

  // MARK: - Home Settings

  function settingRows() {
    var unit = Prefs.temperature(), theme = Prefs.theme();
    var auto = tr('Automatic'), picked = pickedLanguage();
    var rows = [
      {label: tr('Language'), value: picked === 'auto' ? auto : I18N.languageName(picked), opens: true, language: true,
        step: function (d) { if (d >= 0) openLanguages(); }},
      {label: tr('Temperature'), value: unit === 'C' ? '°C' : unit === 'F' ? '°F' : tr('unit|Automatic'),
        step: function (d) { cycle('temperature', ['auto', 'C', 'F'], unit, d); renderPanels(); }},
      {label: tr('Theme'), value: theme === 'light' ? tr('Light') : theme === 'dark' ? tr('Dark') : auto,
        step: function (d) { cycle('theme', ['auto', 'light', 'dark'], theme, d); checkNight(); }},
      {label: tr('Picks per tab'), value: String(Prefs.cards()),
        step: function (d) { Prefs.set('cards', 3 + (Prefs.cards() - 3 + (d || 1) + 4) % 4); renderCards(); }},
      {label: tr('Watch from the screensaver'), toggle: Prefs.saverWatch(),
        step: function () { Prefs.set('saverWatch', !Prefs.saverWatch()); }},
      {label: tr('Weather widget'), toggle: Prefs.weather(),
        step: function () { Prefs.set('weather', !Prefs.weather()); renderPanels(); }},
      {label: tr('City'), value: Prefs.city() || '—', opens: true, city: true,
        step: function (d) { if (d >= 0) openCities(); }},
      {label: tr('Forecast'), value: Prefs.forecast() === 'days' ? tr('Next days') : tr('Next hours'),
        step: function (d) { cycle('forecast', ['hours', 'days'], Prefs.forecast(), d); renderPanels(); }},
      {label: tr('Quotes widget'), toggle: Prefs.quotes(),
        step: function () { Prefs.set('quotes', !Prefs.quotes()); Data.settingsChanged(); }}
    ];
    var names = ['Bitcoin', 'Ethereum', 'Solana', tr('Dollar')];
    var count = Data.currency === 'BRL' ? 4 : 3;
    for (var i = 0; i < count; i++) {
      (function (i) {
        rows.push({label: names[i], toggle: Prefs.quotes() && Prefs.coin(i), dim: !Prefs.quotes(),
          step: function () { if (Prefs.quotes()) { Prefs.setCoin(i, !Prefs.coin(i)); Data.settingsChanged(); } }});
      })(i);
    }
    rows.push({label: tr('TMDB key'), value: Prefs.tmdbKey().length >= 4 ? '•••• ' + Prefs.tmdbKey().slice(-4) : tr('Not set'), opens: true, tmdb: true,
      step: function (d) { if (d >= 0) openKey(); }});
    var sv = Data.services();
    if (sv.length) {
      var someOff = false;   // only the services this TV has count
      for (var q = 0; q < sv.length; q++) someOff = someOff || Prefs.serviceOff(sv[q].key);
      rows.push({label: tr('Picks from'), value: someOff ? tr('services|Some') : tr('services|All'),
        step: function () { Prefs.set('servicesOff', []); Data.settingsChanged(); }});
      for (var j = 0; j < sv.length; j++) {
        (function (key, name) {
          rows.push({label: name, toggle: !Prefs.serviceOff(key),
            step: function () { Prefs.setServiceOff(key, !Prefs.serviceOff(key)); Data.refresh(); Data.settingsChanged(); }});
        })(sv[j].key, sv[j].name);
      }
    }
    rows.push({label: tr('Headlines on the bar'), opens: true,
      value: barMode() === 'off' ? tr('Off') : barMode() === 'marquee' ? tr('Scrolling') : tr('Rotating'),
      step: function (d) { cycle('bar', ['rotate', 'marquee', 'off'], barMode(), d); renderAlert(); }});
    rows.push({label: tr('News background'), toggle: Prefs.get('newsbg', true),
      step: function () { Prefs.set('newsbg', !Prefs.get('newsbg', true)); backdrop(wantedBg(cards)); }});
    rows.push({label: tr('News'), toggle: Feeds.enabled(),
      step: function () { Prefs.set('news', !Feeds.enabled()); if (Feeds.enabled()) { Feeds.refresh(true); Feeds.refreshAlert(true); } renderDrawer(); renderAlert(); }});
    rows.push({label: tr('Diagnostics'), value: '›', step: function (d) { if (d >= 0) openDiag(); }});
    rows.push({label: tr('Sleep timer'), value: sleepAt ? sleepMinutes() + ' min' : tr('Off'), opens: true,
      step: function (d) { if (d >= 0) openTimer(); }});
    rows.push({label: tr('Dim'), value: dimName(Prefs.get('dim', 'auto')), opens: true,
      step: function (d) { cycle('dim', ['off', 'low', 'medium', 'high', 'auto'], Prefs.get('dim', 'auto'), d); applyDim(); }});
    rows.push({label: tr('Screensaver'), value: saverMode() === 'photos' ? tr('Photos') : tr('Clock'), opens: true,
      step: function (d) { cycle('saver', ['clock', 'photos'], saverMode(), d); }});
    rows.push({label: tr('Shelf'), value: '›', shelf: true, step: function (d) { if (d >= 0) openShelfEdit(); }});
    rows.push({label: tr('About this TV'), value: '›', about: true, step: function (d) { if (d >= 0) openAbout(); }});
    if (TV.canOpenSettings) rows.push({label: tr('TV Settings'), value: '›', step: function (d) { if (d >= 0) tvSettings(); }});
    return rows;
  }

  function cycle(name, values, current, d) {
    var i = values.indexOf(current);
    Prefs.set(name, values[(i + (d || 1) + values.length) % values.length]);
  }

  var rowsNow = [];

  function renderSettings() {
    var box = $('settings').firstChild;
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('settings', title);
    title.appendChild(document.createTextNode(tr('Home Settings')));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    rowsNow = settingRows();
    list.style.height = Math.min(rowsNow.length, 7) * 78 + 'px';
    for (var i = 0; i < rowsNow.length; i++) {
      var r = rowsNow[i], row = el('div', 'row' + (r.dim ? ' dim' : ''), holder, r.label);
      if (r.toggle !== undefined) setClass(el('div', 'toggle', row), 'on', r.toggle);
      else {
        var v = el('span', 'value', row);
        if (r.value === '›') v.textContent = '›';
        else if (r.opens) { v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
        else { el('span', 'chev', v, '‹'); v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
      }
      hover(row, Z.SETTINGS, i);
    }
    el('div', 'hint', box, tr('OK or the arrows change the value.'));
    updateFocus();
  }

  function openSettings() {
    st.zone = Z.SETTINGS;
    st.row = 0;
    renderSettings();
    setClass($('settings'), 'open', true);
    updateFocus();
  }

  // MARK: - Language: a list of every catalogue in its own name, as on Android (moving through it doesn't switch the app)

  var langHint = null;

  function languageChoices() {
    return ['auto'].concat(I18N.languages());
  }

  /** The language in use: "auto", or the catalogue the setting resolved to ("pt-BR" in config.properties is "pt"). */
  function pickedLanguage() {
    return Prefs.language() === 'auto' ? 'auto' : I18N.lang;
  }

  function renderLanguages() {
    var box = $('langpick').firstChild, choices = languageChoices(), current = choices.indexOf(pickedLanguage());
    box.innerHTML = '';
    el('div', 'title', box, tr('Language'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(choices.length, 7) * 78 + 'px';
    for (var i = 0; i < choices.length; i++) {
      var row = el('div', 'row', holder, choices[i] === 'auto' ? tr('Automatic') : I18N.languageName(choices[i]));
      if (i === current) sym('check', el('span', 'value', row));
      hover(row, Z.LANG, i);
    }
    langHint = el('div', 'hint', box);
    updateFocus();
  }

  function openLanguages() {
    setClass($('settings'), 'open', false);
    st.zone = Z.LANG;
    st.lang = Math.max(0, languageChoices().indexOf(pickedLanguage()));
    renderLanguages();
    setClass($('langpick'), 'open', true);
    updateFocus();
  }

  /** OK: the language under the focus; Back: none. Either way, back to Home Settings, on the Language row. */
  function closeLanguages(pick) {
    setClass($('langpick'), 'open', false);
    langHint = null;
    var code = languageChoices()[st.lang];
    if (pick && code !== pickedLanguage()) {
      Prefs.set('language', code);
      I18N.set(Prefs.language());
      renderAll();
      Data.refresh();   // the picks' titles and genres come in the new language
    }
    openSettings();
    for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i].language) st.row = i;
    updateFocus();
  }

  // MARK: - Text fields: typed with the TV's keyboard (the city, the TMDB key)

  /** A row with a text field; on the TV, the focus in it brings up the keyboard. */
  function textField(holder, zone, value, placeholder, label) {
    var field = el('input', '', el('div', 'row field', holder));
    field.type = 'text';
    field.value = value;
    field.placeholder = placeholder;
    field.setAttribute('aria-label', label);
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('spellcheck', 'false');
    hover(field.parentNode, zone, 0);
    return field;
  }

  function fieldOf(sheet) { return $(sheet).querySelector('input'); }

  function typingIn(sheet) { var f = fieldOf(sheet); return !!f && document.activeElement === f; }

  /** Into the field: the TV shows its keyboard. */
  function openField(sheet) {
    var f = fieldOf(sheet);
    if (!f) return;
    f.focus();
    try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) {}
  }

  function closeField(sheet) {
    if (typingIn(sheet)) fieldOf(sheet).blur();
  }

  // MARK: - City: typed with the TV's keyboard, found by Open-Meteo, as on Android (the weather is for its coordinates)

  var cityFound = [], cityStatus = '', cityTimer = 0, citySeq = 0;

  /** The field to type in, the Search row, then the places found. */
  function cityRows() { return 2 + cityFound.length; }

  function renderCities() {
    var box = $('citypick').firstChild, old = fieldOf('citypick'), typed = old ? old.value : '', inField = typingIn('citypick');
    box.innerHTML = '';
    el('div', 'title', box, tr('City'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(cityRows(), 7) * 78 + 'px';
    textField(holder, Z.CITY, typed, tr("Type the city's name"), tr('City'));
    var search = el('div', 'row', holder, tr('Search'));
    sym('chevron_right', el('span', 'value', search));
    hover(search, Z.CITY, 1);
    for (var i = 0; i < cityFound.length; i++) {
      var row = el('div', 'row', holder, cityFound[i].label);
      hover(row, Z.CITY, 2 + i);
    }
    el('div', 'hint', box, cityStatus || tr('OK picks, Back cancels.'));
    if (inField) openField('citypick');   // a message that went away while typing: the keyboard stays
    updateFocus();
  }

  function openCities() {
    setClass($('settings'), 'open', false);
    st.zone = Z.CITY;
    st.city = 0;
    cityFound = [];
    cityStatus = '';
    $('citypick').firstChild.innerHTML = '';
    renderCities();
    setClass($('citypick'), 'open', true);
    openField('citypick');
  }

  function setCityStatus(text) {
    cityStatus = text;
    clearTimeout(cityTimer);
    // Clears only the hint: a new render would rebuild the field and interrupt the TV's keyboard while someone types.
    if (text && text !== tr('Searching…')) cityTimer = setTimeout(function () {
      cityStatus = '';
      var hint = st.zone === Z.CITY && $('citypick').querySelector('.hint');
      if (hint) hint.textContent = tr('OK picks, Back cancels.');
    }, 4000);
    if (st.zone === Z.CITY) renderCities();
  }

  function searchCity() {
    var f = fieldOf('citypick'), name = f ? f.value : '';
    closeField('citypick');
    if (!name.trim()) { st.city = 0; openField('citypick'); updateFocus(); return; }
    if (cityStatus === tr('Searching…')) return;
    setCityStatus(tr('Searching…'));
    var mine = ++citySeq;   // an answer for a sheet already closed (and opened again) is dropped
    Data.findCity(name, function (err, found) {
      if (mine !== citySeq) return;
      if (st.zone !== Z.CITY) { cityStatus = ''; return; }
      cityFound = found || [];
      if (cityFound.length) st.city = 2;   // on the first place found
      setCityStatus(err ? trf("Couldn't search now: {error}", {error: err.message}) : cityFound.length ? '' : tr('No city with that name.'));
    });
  }

  /** OK on a place: the weather moves there. Back (pick false): nothing changes. Either way, back on the City row. */
  function closeCities(pick) {
    var place = pick && cityFound[st.city - 2];
    closeField('citypick');
    setClass($('citypick'), 'open', false);
    cityFound = [];
    citySeq++;
    clearTimeout(cityTimer);
    cityStatus = '';
    if (place) {
      Prefs.setCity(place.city, place.lat, place.lon);
      Data.cityChanged();
    }
    openSettings();
    for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i].city) st.row = i;
    updateFocus();
  }

  function activateCity() {
    if (st.city === 0) openField('citypick');
    else if (st.city === 1) searchCity();
    else closeCities(true);
  }

  // MARK: - TMDB key: typed on the TV, so builds without one (the releases) get the picks too; TMDB checks it first

  var keyStatus = '', keyWarn = false, keyTimer = 0, keySeq = 0, keyAsking = false;

  function keyRows() { return keyAsking ? 2 : Prefs.tmdbKeyOnTV() ? 3 : 2; }

  function keySteps() {
    return tr("The key brings the picks: what's trending on your streaming apps, with their photos on the screensaver.") + '\n'
      + tr('Free, and it takes two minutes:') + '\n1. ' + tr('Create an account at themoviedb.org.')
      + '\n2. ' + tr('Open Settings → API and request a developer key.');
  }

  function renderKey() {
    var box = $('keypick').firstChild, old = fieldOf('keypick'), typed = old ? old.value : '', inField = typingIn('keypick');
    box.innerHTML = '';
    el('div', 'title', box, keyAsking ? tr('Remove the TMDB key?') : tr('TMDB key'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = keyRows() * 78 + 'px';
    if (keyAsking) {
      hover(el('div', 'row', holder, tr('Cancel')), Z.KEY, 0);
      hover(el('div', 'row', holder, tr('Remove')), Z.KEY, 1);
      updateFocus();
      return;
    }
    var keyField = textField(holder, Z.KEY, typed, tr('API Read Access Token or API Key'), tr('TMDB key'));
    // A v3 key is lowercase hex: the TV's keyboard mustn't capitalize it (the city's field wants capitals).
    keyField.setAttribute('autocapitalize', 'none');
    keyField.setAttribute('autocorrect', 'off');
    var save = el('div', 'row', holder, tr('Save'));
    sym('chevron_right', el('span', 'value', save));
    hover(save, Z.KEY, 1);
    if (Prefs.tmdbKeyOnTV()) hover(el('div', 'row', holder, tr('Remove the key')), Z.KEY, 2);
    if (keyStatus) setClass(el('div', 'hint', box, keyStatus), 'warn', keyWarn);
    el('div', 'hint steps', box, keySteps());
    if (inField) openField('keypick');
    updateFocus();
  }

  function openKey() {
    setClass($('settings'), 'open', false);
    st.zone = Z.KEY;
    st.key = 0;
    keyStatus = '';
    keyAsking = false;
    $('keypick').firstChild.innerHTML = '';
    renderKey();
    setClass($('keypick'), 'open', true);
    openField('keypick');
  }

  function setKeyStatus(text, warn) {
    keyStatus = text;
    keyWarn = !!warn;
    clearTimeout(keyTimer);
    if (text && text !== tr('Checking the key with TMDB…')) keyTimer = setTimeout(function () {
      keyStatus = '';
      var line = st.zone === Z.KEY && $('keypick').querySelector('.hint:not(.steps)');
      if (line) line.parentNode.removeChild(line);
    }, 6000);
    if (st.zone === Z.KEY) renderKey();
  }

  function cleanKey(typed) {
    var key = typed.replace(/\s+/g, '');
    return /^[A-Za-z0-9._-]{16,1024}$/.test(key) ? key : '';
  }

  function saveKey() {
    var f = fieldOf('keypick'), typed = f ? f.value : '', key = cleanKey(typed);
    closeField('keypick');
    if (!typed.replace(/\s+/g, '')) { st.key = 0; openField('keypick'); updateFocus(); return; }
    if (keyStatus === tr('Checking the key with TMDB…')) return;
    if (!key) { setKeyStatus(tr("That doesn't look like a TMDB key."), true); return; }
    setKeyStatus(tr('Checking the key with TMDB…'));
    var mine = ++keySeq;   // an answer for a sheet already closed is dropped
    Data.checkKey(key, function (err) {
      if (mine !== keySeq || st.zone !== Z.KEY) return;
      if (err) { setKeyStatus(err.rejected ? tr('TMDB refused this key.') : trf("Couldn't reach TMDB: {error}", {error: err.message}), true); return; }
      Prefs.set('tmdbKey', key);
      if (fieldOf('keypick')) fieldOf('keypick').value = '';
      Data.keyChanged();
      setKeyStatus(tr('Saved. The picks arrive in a moment.'));
    });
  }

  /** Back to config.properties' key (none in the releases): the picks go. */
  function removeKey() {
    Prefs.set('tmdbKey', undefined);   // left out of the saved settings
    closeKey();
    Data.keyChanged();
  }

  /** Back on the TMDB key row of Home Settings. */
  function closeKey() {
    closeField('keypick');
    setClass($('keypick'), 'open', false);
    keySeq++;
    clearTimeout(keyTimer);
    keyStatus = '';
    keyAsking = false;
    var f = fieldOf('keypick');
    if (f) f.value = '';
    openSettings();
    for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i].tmdb) st.row = i;
    updateFocus();
  }

  function askRemoveKey(on) {
    keyAsking = on;
    keyStatus = '';
    clearTimeout(keyTimer);
    st.key = on ? 0 : 2;
    renderKey();
  }

  function activateKey() {
    if (keyAsking) { if (st.key === 1) removeKey(); else askRemoveKey(false); }
    else if (st.key === 0) openField('keypick');
    else if (st.key === 1) saveKey();
    else askRemoveKey(true);
  }

  // MARK: - About this TV: what to quote when reporting a problem, without LG's or Samsung's slow menus

  function renderAbout(info) {
    var box = $('about').firstChild;
    box.innerHTML = '';
    el('div', 'title', box, tr('About this TV'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    var rows = [
      [tr('Model'), info && info.model], [tr('Firmware'), info && info.firmware], [tr('System'), info && info.system],
      [tr('IP address'), info && info.ip], [tr('Time zone'), TV.zone()], ['Free My TV', info && info.version]
    ];
    for (var i = 0; i < rows.length; i++) {
      var row = el('div', 'row', holder), label = el('span', '', row, rows[i][0]);
      fitValue(row, label, el('span', 'value', row, info ? rows[i][1] || tr('Unavailable') : '…'));
    }
    el('div', 'hint', box, tr('Back closes.'));
  }

  /** A long value (Samsung's firmware) gets smaller instead of running over its label, and ends in "…" if even the smallest size is too wide. */
  function fitValue(row, label, value) {
    var room = row.clientWidth - label.offsetWidth - 2 * 24 - 24;   // the row's padding, and a gap after the label
    for (var size = 30; value.offsetWidth > room && size > 18; size -= 2) value.style.fontSize = size - 2 + 'px';
    if (value.offsetWidth > room) { value.style.maxWidth = room + 'px'; setClass(value, 'cut', true); }
  }

  function openAbout() {
    setClass($('settings'), 'open', false);
    st.zone = Z.ABOUT;
    renderAbout(null);
    setClass($('about'), 'open', true);
    updateFocus();
    TV.about(function (info) { if (st.zone === Z.ABOUT) renderAbout(info); });
  }

  function closeAbout() {
    setClass($('about'), 'open', false);
    openSettings();
    for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i].about) st.row = i;
    updateFocus();
  }

  // MARK: - Shelf editor: which apps, in what order

  function editList() {
    var ids = shelf.map(function (a) { return a.id; });
    return {ids: ids, rows: apps.slice().sort(function (a, b) {
      var ia = ids.indexOf(a.id), ib = ids.indexOf(b.id);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1;
    })};
  }

  function renderShelfEdit() {
    var box = $('shelfedit').firstChild, e = editList();
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('apps', title);
    title.appendChild(document.createTextNode(tr('Shelf')));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(e.rows.length, 7) * 78 + 'px';
    for (var i = 0; i < e.rows.length; i++) {
      var a = e.rows[i], at = e.ids.indexOf(a.id), row = el('div', 'row', holder, a.title);
      var place = el('span', 'value', row, at >= 0 ? '#' + (at + 1) : tr('shelf|Off'));
      if (at >= 0) sym('check', place).style.marginLeft = '16px';   // on the shelf: a check, as in the pickers
      hover(row, Z.EDIT, i);
    }
    el('div', 'hint', box, tr('OK adds or removes an app. ← → change the order.'));
    updateFocus();
  }

  function openShelfEdit() {
    setClass($('settings'), 'open', false);
    st.zone = Z.EDIT;
    st.edit = 0;
    renderShelfEdit();
    setClass($('shelfedit'), 'open', true);
    updateFocus();
  }

  function editShelf(dx) {
    var e = editList(), app = e.rows[st.edit];
    if (!app) return;
    var ids = e.ids.slice(), at = ids.indexOf(app.id);
    if (dx === 0) {
      if (at >= 0) ids.splice(at, 1);
      else ids.push(app.id);
    } else {
      if (at < 0) return;
      var to = Math.max(0, Math.min(ids.length - 1, at + dx));
      ids.splice(at, 1);
      ids.splice(to, 0, app.id);
    }
    Prefs.set('shelf', ids);
    pickShelf();
    renderShelf();
    var again = editList();
    for (var i = 0; i < again.rows.length; i++) if (again.rows[i].id === app.id) st.edit = i;
    renderShelfEdit();
  }

  // MARK: - Opening things

  function launcher(id, name) {
    return function () {
      TV.launch(id, null, function (ok) {
        if (!ok) toast(trf("Couldn't open {app}.", {app: name || id}));
      });
    };
  }

  function tvSettings() {
    TV.settings(function (ok) {
      if (!ok) toast(tr("Couldn't open TV Settings"));
    });
  }

  function liveTV() {
    for (var i = 0; i < inputs.length; i++) if (inputs[i].key === 'live') return inputs[i];
    return null;
  }

  function activate() {
    savePos();
    switch (st.zone) {
      case Z.TOP:
        if (st.top < 3) return;
        if (st.top === 3) { var live = liveTV(); if (live) launcher(live.id, tr('Live TV'))(); }
        else if (st.top === 4) { st.zone = Z.SHELF; openDrawer(); st.drawer = 1 < drawerInputs ? 1 : 0; updateFocus(); }
        else openSettings();
        return;
      case Z.CARDS:
        openDetail(cards[st.card]);
        return;
      case Z.NEWS:
        if (Feeds.items()[st.news]) openLink(Feeds.items()[st.news].link);
        return;
      case Z.TIMER:
        if (timerRowsNow[st.timer]) { timerRowsNow[st.timer].step(); if (st.zone === Z.TIMER) renderTimer(); }
        return;
      case Z.DETAIL:
        var p = detailPick, app = p && Data.appFor(p.app);
        if (st.detail === 0 && app) { closeDetail(); launcher(app.id, app.title)(); }
        else if (st.detail === 1) closeDetail();
        return;
      case Z.SHELF:
        if (shelf[st.shelf]) launcher(shelf[st.shelf].id, shelf[st.shelf].title)();
        return;
      case Z.DRAWER:
        if (drawerItems[st.drawer]) drawerItems[st.drawer].run();
        return;
      case Z.APPS:
        if (others[st.grid]) launcher(others[st.grid].id, others[st.grid].title)();
        return;
      case Z.SETTINGS:
        if (rowsNow[st.row]) { rowsNow[st.row].step(1); if (st.zone === Z.SETTINGS) renderSettings(); }
        return;
      case Z.EDIT:
        editShelf(0);
        return;
      case Z.LANG:
        closeLanguages(true);
        return;
      case Z.CITY:
        activateCity();
        return;
      case Z.KEY:
        activateKey();
        return;
      case Z.ABOUT:
        closeAbout();
        return;
    }
  }

  function selectTab(i) {
    if (i === st.tab) return;
    st.tab = i;
    // A tab opens at its first pick, its row at the start: at once, as on Android, not sliding from the last tab's place.
    st.card = 0;
    var holder = $('cards');
    holder.style.webkitTransition = holder.style.transition = 'none';
    renderCards();
    layoutCards();   // renderCards returns early when this tab's picks are the same
    void holder.offsetWidth;   // the row is laid out where it lands before the slide comes back
    holder.style.webkitTransition = holder.style.transition = '';
  }

  function move(dx, dy) {
    var tiles = $('tiles').children, cardNodes = $('cards').children;
    switch (st.zone) {
      case Z.SHELF:
        if (dx) st.shelf = Math.max(0, Math.min(shelf.length - 1, st.shelf + dx));
        else if (dy > 0) { openDrawer(); return; }
        else if (dy < 0) {
          if (cards.length) { st.zone = Z.CARDS; st.card = nearest(cardNodes, centerX(tiles[st.shelf])); }
          else { st.zone = Z.TOP; st.top = Data.hasKey() ? st.tab : 3; }
        }
        break;
      case Z.CARDS:
        if (dx) st.card = Math.max(0, Math.min(cards.length - 1, st.card + dx));
        else if (dy < 0) { st.zone = Z.TOP; st.top = st.tab; }
        else if (shelf.length) { st.zone = Z.SHELF; st.shelf = nearest(tiles, centerX(cardNodes[st.card])); }
        break;
      case Z.TOP:
        if (dx) {
          st.top = Math.max(Data.hasKey() ? 0 : 3, Math.min(5, st.top + dx));   // without the picks the tabs can't hold focus
          if (st.top < 3) selectTab(st.top);   // as on Apple TV: focusing a tab selects it
        } else if (dy > 0) {
          if (cards.length) { st.zone = Z.CARDS; st.card = Math.min(cards.length - 1, st.top < 3 ? 0 : cards.length - 1); }
          else st.zone = Z.SHELF;
        }
        break;
      case Z.DRAWER:
        if (dx) st.drawer = Math.max(0, Math.min(drawerItems.length - 1, st.drawer + dx));
        else if (dy < 0) { closeDrawer(); return; }
        break;
      case Z.APPS:
        var g = st.grid + dx + dy * 5;
        if (g >= 0 && g < others.length && (dx === 0 || Math.floor(g / 5) === Math.floor(st.grid / 5))) st.grid = g;
        break;
      case Z.SETTINGS:
        if (dy) st.row = Math.max(0, Math.min(rowsNow.length - 1, st.row + dy));
        else if (dx && rowsNow[st.row]) {
          var r = rowsNow[st.row];
          if (r.value !== '›') { r.step(dx); if (st.zone === Z.SETTINGS) renderSettings(); }
        }
        break;
      case Z.EDIT:
        if (dy) st.edit = Math.max(0, Math.min(apps.length - 1, st.edit + dy));
        else if (dx) editShelf(dx);
        break;
      case Z.LANG:
        if (dy) st.lang = Math.max(0, Math.min(languageChoices().length - 1, st.lang + dy));
        break;
      case Z.NEWS:
        if (dy) st.news = Math.max(0, Math.min(Math.max(0, Math.min(Feeds.items().length, 12) - 1), st.news + dy));
        break;
      case Z.DETAIL:
        if (dx) st.detail = Math.max(0, Math.min(1, st.detail + dx));
        break;
      case Z.CITY:
        if (dy) st.city = Math.max(0, Math.min(cityRows() - 1, st.city + dy));
        break;
      case Z.KEY:
        if (dy) st.key = Math.max(0, Math.min(keyRows() - 1, st.key + dy));
        break;
      case Z.TIMER:
        if (dy) st.timer = Math.max(0, Math.min(timerRowsNow.length - 1, st.timer + dy));
        break;
    }
    updateFocus();
  }

  function back() {
    if (st.zone === Z.INPUT) { closeInput(); return; }
    if (st.zone === Z.DIAG) { setClass($('diag'), 'open', false); openSettings(); return; }
    if (st.zone === Z.TIMER) { closeSheets(); return; }
    if (st.zone === Z.DETAIL) { closeDetail(); return; }
    if (st.zone === Z.NEWS) { closeSheets(); return; }
    if (st.zone === Z.EDIT) {
      setClass($('shelfedit'), 'open', false);
      openSettings();
      for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i].shelf) st.row = i;   // back on the Shelf row, whatever follows it
      updateFocus();
      return;
    }
    if (st.zone === Z.LANG) { closeLanguages(false); return; }
    if (st.zone === Z.CITY) { closeCities(false); return; }
    if (st.zone === Z.KEY) { if (keyAsking) askRemoveKey(false); else closeKey(); return; }
    if (st.zone === Z.ABOUT) { closeAbout(); return; }
    if (sheetOpen()) { closeSheets(); return; }
    if (st.zone === Z.DRAWER) { closeDrawer(); return; }
    if (st.zone !== Z.SHELF && shelf.length) { st.zone = Z.SHELF; updateFocus(); return; }
    TV.back();
  }

  /** The pointer focuses what it's over (the Magic Remote, or a mouse when previewing). */
  function sheetZone(zone) {
    return zone === Z.APPS || zone === Z.SETTINGS || zone === Z.EDIT || zone === Z.LANG || zone === Z.CITY ||
      zone === Z.KEY || zone === Z.ABOUT || zone === Z.NEWS || zone === Z.DETAIL || zone === Z.TIMER;
  }

  function hover(node, zone, index) {
    node.onmouseover = function () {
      if (saverOn || (sheetOpen() !== sheetZone(zone))) return;
      if (zone === Z.DRAWER && st.zone !== Z.DRAWER) return;
      if (zone !== Z.DRAWER && st.zone === Z.DRAWER && zone !== Z.SHELF) return;
      if (zone === Z.TOP && index < 3 && !Data.hasKey()) return;   // the tabs are hidden without the picks
      if (zone === Z.SHELF && st.zone === Z.DRAWER) closeDrawer();
      st.zone = zone;
      if (zone === Z.TOP) { st.top = index; if (index < 3) selectTab(index); }
      else if (zone === Z.CARDS) st.card = index;
      else if (zone === Z.SHELF) st.shelf = index;
      else if (zone === Z.DRAWER) st.drawer = index;
      else if (zone === Z.APPS) st.grid = index;
      else if (zone === Z.SETTINGS) st.row = index;
      else if (zone === Z.EDIT) st.edit = index;
      else if (zone === Z.LANG) st.lang = index;
      else if (zone === Z.CITY) st.city = index;
      else if (zone === Z.KEY) st.key = index;
      else if (zone === Z.NEWS) st.news = index;
      else if (zone === Z.DETAIL) st.detail = index;
      else if (zone === Z.TIMER) st.timer = index;
      updateFocus();
    };
    node.onclick = function () { node.onmouseover(); activate(); };
  }

  // MARK: - Toast

  var toastTimer = 0;
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    setClass(t, 'on', true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { setClass(t, 'on', false); }, 6000);
  }

  // MARK: - Night, clock, screensaver

  var lastNight = null;

  function checkNight() {
    var night = Data.isNight(Date.now());
    setClass(body, 'night', night);
    if (night === lastNight) return;
    lastNight = night;
    document.documentElement.style.background = night ? '#0B0B0D' : '';
    try { localStorage.setItem('fmtv.night', night ? 'true' : 'false'); } catch (e) {}   // for index.html, next start
  }

  var saverOn = false, idleAt = Date.now(), saverIndex = 0, saverTimer = 0, saverPick = null, SAVER_AFTER = 5 * 60000;

  /** The screensaver's photos: picks with an app on the TV. */
  function saverPhotos() {
    return Data.showcase().filter(function (p) { return p.backdrop && Data.usable(p.app); });
  }

  function showSaver() {
    var photos = saverPhotos();
    saverOn = true;
    saverPick = null;
    var s = $('saver');
    s.innerHTML = '';
    var a = el('div', 'photo', s), b = el('div', 'photo', s);
    el('div', 'shade', s);
    var clock = el('div', 'clock', s);
    el('div', 'time', clock);
    el('div', 'date', clock);
    el('div', 'title', clock);
    var hint = el('div', 'hint', clock);
    var front = a;
    function next() {
      if (!saverOn) return;
      var p = photos.length ? photos[saverIndex++ % photos.length] : null;
      var back = front === a ? b : a;
      if (p) {
        back.style.backgroundImage = 'url(' + Data.image(p.backdrop, 'w1280') + ')';
        back.style.webkitTransform = back.style.transform = 'scale(1.0)';
        clock.children[2].textContent = p.title;
        saverPick = p;
        // With Watch from the screensaver on, OK opens this title's app (any other key only closes).
        var app = Prefs.saverWatch() && Data.appFor(p.app);
        hint.textContent = app ? trf('Press OK to watch on {app} · any other button to close', {app: app.title}) : '';
        setTimeout(function () {
          setClass(back, 'on', true);
          setClass(front, 'on', false);
          back.style.webkitTransform = back.style.transform = 'scale(1.08) translateX(-1.5%)';
          front = back;
        }, 60);
      }
      tickSaverClock(clock);
      saverTimer = setTimeout(next, 12000);
    }
    setClass(s, 'on', true);
    next();
  }

  function tickSaverClock(clock) {
    var d = new Date();
    clock.firstChild.textContent = formatDate('format|h:mm', d.getTime());
    clock.children[1].textContent = formatDate('format|EEEE, MMMM d', d.getTime());
  }

  function hideSaver() {
    saverOn = false;
    clearTimeout(saverTimer);
    setClass($('saver'), 'on', false);
  }

  // MARK: - Ambient: the clock on its own, when the room is quiet

  var ambientOn = false, ambientTimer = 0;

  /** "clock" (the default here) or "photos": what the screen shows when nobody touches it. */
  function saverMode() { return Prefs.get('saver', 'clock'); }

  function showAmbient() {
    var a = $('ambient');
    a.innerHTML = '';
    var shift = el('div', 'shift', a);
    var clock = el('div', 'clock', shift, formatDate('format|h:mm', Date.now()));
    el('div', 'date', shift, formatDate('format|EEEE, MMMM d', Date.now()));
    var side = el('div', 'side', shift), w = Data.weather;
    el('div', 'temp', side, w ? Data.degrees(w.temp) : '—');
    if (w) el('div', 'cond', side, Data.condition(w.code, w.isDay));
    var item = Feeds.enabled() ? Feeds.items()[0] : null;
    if (item) {
      el('div', 'news', side, item.title);
      el('div', 'src', side, item.source);
    }
    var al = Feeds.enabled() ? Feeds.alert() : null;
    if (al) el('div', 'alertline', side, trf('{event} · {severity}', {event: al.event, severity: al.severity}));
    ambientOn = true;
    setClass(a, 'on', true);
    ambientTimer = setInterval(tickAmbient, 30000);
    tickAmbient();
  }

  function tickAmbient() {
    if (!ambientOn) return;
    var a = $('ambient'), clock = a.querySelector('.clock'), shift = a.querySelector('.shift'), d = new Date();
    if (clock) clock.textContent = formatDate('format|h:mm', d.getTime());
    var date = a.querySelector('.date');
    if (date) date.textContent = formatDate('format|EEEE, MMMM d', d.getTime());
    if (shift) {
      // A few pixels every half minute: a static clock on an OLED is what burns in.
      var dx = Math.round(Math.sin(d.getMinutes() * 0.7) * 6), dy = Math.round(Math.cos(d.getMinutes() * 0.9) * 5);
      shift.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    }
  }

  function hideAmbient() {
    ambientOn = false;
    clearInterval(ambientTimer);
    setClass($('ambient'), 'on', false);
  }

  // MARK: - Dim, screen off and the sleep timer

  function dimName(v) {
    return v === 'low' ? tr('Low') : v === 'medium' ? tr('Medium') : v === 'high' ? tr('High')
      : v === 'auto' ? tr('Automatic') : tr('Off');
  }

  function dimLevel() {
    var v = Prefs.get('dim', 'auto');
    if (v === 'auto') { var h = new Date().getHours(); return h >= 22 || h < 7 ? 2 : 0; }
    return v === 'low' ? 1 : v === 'medium' ? 2 : v === 'high' ? 3 : 0;
  }

  function applyDim() {
    var level = dimLevel();
    $('dim').className = 'layer' + (level ? ' d' + level : '');
  }

  var blackOn = false;

  function screenOff() {
    blackOn = true;
    setClass($('black'), 'on', true);
    TV.screenOff(function (ok) {
      if (!ok && window.PalmSystem) toast(tr('Screen off: any key comes back.'));
    });
  }

  function wakeScreen() {
    if (!blackOn) return false;
    blackOn = false;
    setClass($('black'), 'on', false);
    return true;
  }

  var SLEEP_KEY = 'fmtv.sleepAt', sleepAt = 0, sleepFive = false;
  (function () {
    try { sleepAt = parseInt(localStorage.getItem(SLEEP_KEY) || '0', 10) || 0; } catch (e) {}
    if (sleepAt && sleepAt < Date.now()) sleepAt = 0;   // it ended while the TV was off
  })();

  function saveSleep() {
    try {
      if (sleepAt) localStorage.setItem(SLEEP_KEY, String(sleepAt));
      else localStorage.removeItem(SLEEP_KEY);
    } catch (e) {}
  }

  function sleepMinutes() { return sleepAt ? Math.max(0, Math.ceil((sleepAt - Date.now()) / 60000)) : 0; }

  function setSleep(minutes) {
    sleepAt = Date.now() + minutes * 60000;
    sleepFive = false;
    saveSleep();
    toast(trf('Turning off in {n} min', {n: minutes}));
    renderTimer();
    renderDrawer();
  }

  function cancelSleep() {
    sleepAt = 0;
    saveSleep();
    toast(tr('Timer cancelled'));
    renderTimer();
    renderDrawer();
  }

  function turnOffNow() {
    TV.powerOff(function (ok) {
      if (!ok) {
        screenOff();
        toast(tr("Couldn't turn the TV off. Hold the power key."));
      }
    });
  }

  function tickSleep() {
    if (!sleepAt) return;
    var left = sleepAt - Date.now();
    if (left <= 0) { sleepAt = 0; saveSleep(); turnOffNow(); return; }
    if (left <= 5 * 60000 && !sleepFive) { sleepFive = true; toast(trf('Turning off in {n} min', {n: 5})); }
  }

  function poke(ok) {
    idleAt = Date.now();
    if (!saverOn) return false;
    var app = ok && saverPick && Prefs.saverWatch() && Data.appFor(saverPick.app);
    hideSaver();
    if (app) launcher(app.id, app.title)();
    return true;
  }

  // MARK: - Keys

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (poke(k === TV.keys.ok)) { e.preventDefault(); return; }   // the first press only wakes the screen (or OK watches)
    if (typing(k)) return;
    if (k === TV.keys.left) move(-1, 0);
    else if (k === TV.keys.right) move(1, 0);
    else if (k === TV.keys.up) move(0, -1);
    else if (k === TV.keys.down) move(0, 1);
    else if (k === TV.keys.ok) activate();
    else if (k === TV.keys.back || k === 27 || k === 8) back();
    else return;
    e.preventDefault();
  });
  document.addEventListener('mousemove', function () { poke(); });

  /**
   * In a text field, the keys type (← → move in the text, Delete erases). OK or the keyboard's Done searches (or saves); Back,
   * its Cancel or ↑ ↓ leave the field. Samsung's keyboard sends Done as 65376 and Cancel as 65385. True: handled here.
   */
  function typing(k) {
    var sheet = st.zone === Z.CITY ? 'citypick' : st.zone === Z.KEY ? 'keypick' : '';
    if (!sheet || !typingIn(sheet)) return false;
    if (k === TV.keys.ok || k === 65376) { if (st.zone === Z.CITY) searchCity(); else saveKey(); }
    else if (k === TV.keys.back || k === 27 || k === 65385) { closeField(sheet); updateFocus(); }
    else if (k === TV.keys.up || k === TV.keys.down) { closeField(sheet); move(0, k === TV.keys.up ? -1 : 1); }
    return true;   // anything else types into the field
  }

  // MARK: - Start

  function renderAll() {
    renderTop();
    renderQuotes();
    cards = [];
    renderCards();
    renderShelf();
    renderDrawer();
    renderClock();
    checkNight();
    if (st.zone === Z.SETTINGS) renderSettings();
    updateFocus();
  }

  /** hide_apps in config.properties: left out of the shelf, All Apps and the picks, by id or name (part of it). */
  var HIDE = (CONFIG.hideApps || []).map(function (s) { return s.toLowerCase(); });
  function hidden(app) {
    var id = (app.id || '').toLowerCase(), title = (app.title || '').toLowerCase();
    for (var i = 0; i < HIDE.length; i++) if (id.indexOf(HIDE[i]) >= 0 || title.indexOf(HIDE[i]) >= 0) return true;
    return false;
  }

  function loadApps(done) {
    TV.apps(function (list) {
      apps = list.filter(function (a) { return !hidden(a); });
      Data.setApps(apps);
      pickShelf();
      TV.inputs(function (list2) {
        inputs = list2;
        if (done) done();
      });
    });
  }

  /** Where the person was, so opening the app again doesn't send them back to the first tab. */
  function savePos() {
    try { sessionStorage.setItem('fmtv.pos', JSON.stringify({tab: st.tab, shelf: st.shelf, at: Date.now()})); } catch (e) {}
  }

  function restorePos() {
    var p = null;
    try { p = JSON.parse(sessionStorage.getItem('fmtv.pos')); } catch (e) {}
    st.zone = Z.SHELF;
    if (p && Date.now() - p.at < 30 * 60000) {
      if (p.tab >= 0 && p.tab < 3 && p.tab !== st.tab) { st.tab = p.tab; renderCards(); }
      if (p.shelf >= 0 && p.shelf < shelf.length) st.shelf = p.shelf;
    } else {
      st.shelf = 0;
    }
    updateFocus();
  }

  /** Back to the home screen (the app was opened again): the shelf, everything closed, the first tab at its first pick. */
  function reset() {
    hideSaver();
    closeSheets();
    st.zone = Z.SHELF;
    st.shelf = 0;
    st.card = 0;
    selectTab(0);
    updateFocus();
    restInDrawer();   // drawer_first: out again at once, not only after the TV lists its apps
  }

  Feeds.onChange(function () {
    renderAlert();
    backdrop(wantedBg(cards));
    if (st.zone === Z.NEWS) renderNews();
    renderDrawer();
  });

  Data.onChange(function () {
    renderQuotes();
    renderCards();
    renderPanels();
    checkNight();
  });

  /** drawer_first: the home screen rests with the drawer open (shelf in the middle, inputs and weather below). */
  function restInDrawer() {
    if (!CONFIG.drawerFirst || !drawerItems.length || st.zone !== Z.SHELF) return;
    st.zone = Z.DRAWER;
    st.drawer = 0;
    updateFocus();
  }

  function reopened() {
    // LG: with handlesRelaunch the app has to come to the front itself, or opening it again while it runs shows nothing.
    if (window.PalmSystem && window.PalmSystem.activate) window.PalmSystem.activate();
    reset();
    loadApps(function () { restorePos(); renderShelf(); renderDrawer(); restInDrawer(); Data.refresh(); Feeds.refresh(); });
  }

  window.addEventListener('resize', fit);
  document.addEventListener('webOSRelaunch', reopened);   // LG: opened again while running
  window.addEventListener('appcontrol', reopened);        // Samsung: the same
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hideSaver(); return; }
    idleAt = Date.now();
    loadApps(function () { renderShelf(); renderDrawer(); updateFocus(); Data.refresh(); });
  });

  I18N.set(Prefs.language());
  checkNight();   // now, from the last forecast: not after the TV lists its apps, with the day look until then
  // LG's screensaver waits only when ours will show: not under a sheet (ours waits there), and not without photos.
  TV.holdScreenSaver(function () { return !sheetOpen() && saverPhotos().length > 0; });
  fit();
  renderTop();
  renderAlert();
  applyDim();
  tickClock();
  loadApps(function () {
    renderAll();
    restorePos();
    restInDrawer();
    Data.refresh();
    Feeds.refresh();
    // The alert list is the heavy one (a few hundred KB): after the first paint, never in front of it.
    setTimeout(function () { Feeds.refreshAlert(); }, 3000);
  });
  setInterval(function () {
    checkNight();
    Data.refresh();
    Feeds.refresh();
    Feeds.refreshAlert();
    savePos();
    tickSleep();
    applyDim();
    if (!blackOn && !saverOn && !ambientOn && !sheetOpen() && Date.now() - idleAt > SAVER_AFTER) {
      if (saverMode() === 'photos') showSaver(); else showAmbient();
    }
    if (saverOn) tickSaverClock($('saver').querySelector('.clock'));
    if (ambientOn) tickAmbient();
  }, 30000);

  // For the browser preview and tests.
  window.FreeMyTV = {state: st, move: move, activate: activate, back: back, showSaver: showSaver, hideSaver: hideSaver,
    showAmbient: showAmbient, hideAmbient: hideAmbient, setSleep: setSleep, applyDim: applyDim, toast: toast,
    bg: function () { return bgUrl; }};
})();
