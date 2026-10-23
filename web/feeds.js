/*
 * News and weather alerts for the home screen, kept in localStorage so they open with numbers:
 *  - headlines from a few feeds the TV can read on its own (RSS 2.0, Atom, and TabNews' JSON);
 *  - INMET's severe-weather alerts, only the ones that cover this city.
 * Plain ES5: older TVs run a Chromium from 2015-2017. Text from a feed is never inserted as HTML: only textContent.
 *
 * Most publishers don't answer a browser cross-origin request (no Access-Control-Allow-Origin), so the default list
 * is made of the ones that do. rss_feeds= in config.properties adds others, served by a proxy that sends the header.
 */
var Feeds = (function () {
  'use strict';

  var STORE = 'fmtv.feeds', ALERT_STORE = 'fmtv.alert';
  var TTL = 15 * 60000, ALERT_TTL = 60 * 60000;
  var PER_FEED = 8, MAX_ITEMS = 30;

  var items = [], at = 0, sources = [], lastError = '';
  var alert = null, alertAt = 0;
  var busy = false, listeners = [];

  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function stored(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function changed() { for (var i = 0; i < listeners.length; i++) listeners[i](); }

  /** GET a text document; done(error, body). */
  function get(url, done) {
    var x = new XMLHttpRequest(), over = false;
    x.open('GET', url, true);
    x.timeout = 8000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || over) return;
      over = true;
      if (x.status !== 200) { done(new Error('HTTP ' + x.status)); return; }
      done(null, x.responseText);
    };
    x.ontimeout = x.onerror = function () { if (!over) { over = true; done(new Error('no connection')); } };
    x.send();
  }

  var ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#8217': '’', '#8216': '‘',
    '#8220': '“', '#8221': '”', '#8211': '–', '#8212': '—'};

  /** Feed text as plain text: tags dropped, the few entities a TV font needs decoded, whitespace collapsed. */
  function clean(s, max) {
    s = String(s || '').replace(/<[^>]*>/g, ' ');
    s = s.replace(/&([a-zA-Z#0-9]+);/g, function (all, name) {
      return ENTITIES.hasOwnProperty(name) ? ENTITIES[name] : all;
    });
    s = s.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return max && s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function host(url) {
    var m = /^https?:\/\/([^\/]+)/.exec(url || '');
    return m ? m[1].replace(/^www\./, '') : '';
  }

  /** The first value of a tag inside a node, as text. */
  function tag(node, names) {
    for (var i = 0; i < names.length; i++) {
      var list = node.getElementsByTagName(names[i]);
      if (list.length && clean(list[0].textContent)) return list[0].textContent;
    }
    return '';
  }

  /** An Atom or RSS link. */
  function linkOf(node) {
    var links = node.getElementsByTagName('link');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (href) return href;
      var text = clean(links[i].textContent);
      if (text) return text;
    }
    return clean(tag(node, ['guid', 'id']));
  }

  function timeOf(node) {
    var raw = clean(tag(node, ['pubDate', 'published', 'updated', 'dc:date', 'date']));
    var ms = raw ? Date.parse(raw) : 0;
    return ms && !isNaN(ms) ? ms : Date.now();
  }

  /** RSS items or Atom entries from an XML document, as [{title, link, at, source}]. */
  function parseXml(xml, fallbackName) {
    var doc = null;
    try { doc = new DOMParser().parseFromString(xml, 'text/xml'); } catch (e) { return []; }
    if (!doc || doc.getElementsByTagName('parsererror').length) return [];
    var nodes = doc.getElementsByTagName('item');
    if (!nodes.length) nodes = doc.getElementsByTagName('entry');
    var name = fallbackName || clean(tag(doc.documentElement, ['title']));
    var out = [];
    for (var i = 0; i < nodes.length && out.length < PER_FEED; i++) {
      var n = nodes[i], title = clean(tag(n, ['title']), 150), link = linkOf(n);
      if (!title || !link) continue;
      out.push({title: title, link: link, at: timeOf(n), source: name});
    }
    return out;
  }

  /** TabNews' JSON, as [{title, link, at, source}]. */
  function parseTabNews(text) {
    var list = null;
    try { list = JSON.parse(text); } catch (e) { return []; }
    var out = [];
    for (var i = 0; list && i < list.length && out.length < PER_FEED; i++) {
      var c = list[i];
      if (!c || !c.title || !c.slug || !c.owner_username) continue;
      out.push({title: clean(c.title, 150), link: 'https://www.tabnews.com.br/' + c.owner_username + '/' + c.slug,
        at: Date.parse(c.published_at) || Date.now(), source: 'TabNews'});
    }
    return out;
  }

  var DEFAULTS = [
    {name: 'Manual do Usuário', url: 'https://manualdousuario.net/feed/', kind: 'xml'},
    {name: 'ESPN', url: 'https://www.espn.com.br/espn/rss/news', kind: 'xml'},
    {name: 'TabNews', url: 'https://www.tabnews.com.br/api/v1/contents?strategy=new&per_page=8', kind: 'json'}
  ];

  /** The feeds this build reads: rss_feeds= from config.properties, else the defaults that answer the TV directly. */
  function feedList() {
    var custom = CONFIG.rssFeeds || [];
    if (!custom.length) return Place.country === 'BR' ? DEFAULTS : [];
    var out = [];
    for (var i = 0; i < custom.length; i++) {
      var url = custom[i];
      out.push({name: host(url), url: url, kind: /tabnews\.com\.br\/api/.test(url) ? 'json' : 'xml'});
    }
    return out;
  }

  function enabled() {
    return Prefs.get('news', CONFIG.news !== false);
  }

  /** What this TV's city is called, for the weather alerts. */
  function cityName() {
    return Prefs.get('cityName', '') || Place.city || '';
  }

  function normalize(s) {
    var from = 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';
    var to = 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN';
    s = String(s || '');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), k = from.indexOf(c);
      out += k >= 0 ? to.charAt(k) : c;
    }
    return out.toLowerCase();
  }

  /** The alerts that cover this city, as [{event, severity, color, until, link}]. */
  function covering(list, city) {
    var want = normalize(city) + ' -', out = [];
    for (var i = 0; list && i < list.length; i++) {
      var a = list[i];
      if (!a || a.encerrado) continue;
      var where = normalize(a.municipios || '');
      if (want.length > 3 && where.indexOf(want) < 0) continue;
      out.push({event: a.descricao || '', severity: a.severidade || '', color: a.aviso_cor || '#FFD60A',
        until: Date.parse(a.fim || '') || 0, link: 'https://avisos.inmet.gov.br/' + (a.id || '')});
    }
    return out;
  }

  function weight(severity) {
    var s = normalize(severity);
    if (s.indexOf('grande perigo') >= 0) return 3;
    if (s.indexOf('potencial') >= 0) return 1;
    return s.indexOf('perigo') >= 0 ? 2 : 1;
  }

  /** "hoje" and "futuro" alerts from INMET, as the worst one covering this city (or null). */
  function alertFrom(body, city) {
    var data = null;
    try { data = JSON.parse(body); } catch (e) { return null; }
    var all = [], today = data && data.hoje, soon = data && data.futuro;
    for (var i = 0; today && i < today.length; i++) all.push(today[i]);
    for (var j = 0; soon && j < soon.length; j++) all.push(soon[j]);
    var list = covering(all, city), best = null;
    for (var k = 0; k < list.length; k++) if (!best || weight(list[k].severity) > weight(best.severity)) best = list[k];
    return best;
  }

  function refreshAlert(force) {
    var city = cityName();
    if (!enabled() || !city) { alert = null; return; }
    var now = Date.now(), cached = stored(ALERT_STORE);
    if (cached && cached.city === city) {
      if (!alert) alert = cached.alert || null;
      if (!alertAt) alertAt = cached.at || 0;
      if (!force && alertAt && now - alertAt < ALERT_TTL && now >= alertAt) return;
    }
    get('https://apiprevmet3.inmet.gov.br/avisos/ativos', function (err, body) {
      if (err) return;
      alert = alertFrom(body, city);
      alertAt = Date.now();
      store(ALERT_STORE, {city: city, alert: alert, at: alertAt});
      changed();
    });
  }

  function finish(list) {
    busy = false;
    list.sort(function (a, b) { return b.at - a.at; });
    var seen = {}, out = [];
    for (var i = 0; i < list.length && out.length < MAX_ITEMS; i++) {
      if (!list[i].link || seen[list[i].link]) continue;
      seen[list[i].link] = true;
      out.push(list[i]);
    }
    items = out;
    at = Date.now();
    lastError = out.length ? '' : 'empty';
    store(STORE, {items: items, at: at, sources: sources});
    changed();
  }

  function refresh(force) {
    if (!enabled() || busy) return;
    var now = Date.now(), cached = stored(STORE);
    if (cached && !items.length) {
      items = cached.items || [];
      at = at || cached.at || 0;
      sources = sources.length ? sources : (cached.sources || []);
    }
    if (!force && at && items.length && now - at < TTL && now >= at) return;
    busy = true;
    sources = [];
    var list = feedList(), all = [];
    if (!list.length) { finish([]); return; }
    (function next(i) {
      if (i >= list.length) { finish(all); return; }
      var started = Date.now(), feed = list[i];
      get(feed.url, function (err, body) {
        var got = err ? [] : (feed.kind === 'json' ? parseTabNews(body) : parseXml(body, feed.name));
        sources.push({name: feed.name, url: feed.url, ok: !err && got.length > 0, count: got.length,
          ms: Date.now() - started, error: err ? err.message : ''});
        for (var k = 0; k < got.length; k++) all.push(got[k]);
        next(i + 1);
      });
    })(0);
  }

  (function () {
    var cached = stored(STORE);
    if (cached) { items = cached.items || []; at = cached.at || 0; sources = cached.sources || []; }
    var a = stored(ALERT_STORE);
    if (a) { alert = a.alert || null; alertAt = a.at || 0; }
  })();

  return {
    onChange: function (fn) { listeners.push(fn); },
    enabled: enabled,
    refresh: refresh,
    refreshAlert: refreshAlert,
    items: function () { return items; },
    at: function () { return at; },
    sources: function () { return sources; },
    status: function () { return {busy: busy, error: lastError, count: items.length, at: at}; },
    alert: function () { return alert; },
    city: cityName,
    /** "18h", "24/10 18h": when an alert ends. */
    when: function (ms) {
      if (!ms) return '';
      var d = new Date(ms), now = new Date();
      function two(n) { return (n < 10 ? '0' : '') + n; }
      var hour = two(d.getHours()) + 'h' + (d.getMinutes() >= 30 ? '30' : '');
      var sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      return sameDay ? hour : two(d.getDate()) + '/' + two(d.getMonth() + 1) + ' ' + hour;
    },
    /** "12 min ago", "3 h ago", or empty when fresh. */
    ago: function (ms) {
      if (!ms) return '';
      var m = Math.floor((Date.now() - ms) / 60000);
      if (m < 2) return '';
      if (m < 60) return trf('{n} min ago', {n: m});
      return trf('{n} h ago', {n: Math.floor(m / 60)});
    }
  };
})();
