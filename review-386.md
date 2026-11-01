Thanks @rickkbarbosa! This is the split we asked for in #215: real patterns for the strings, `{n} min` reused, every
catalogue, and the air-quality host named in Privacy. We tried it in the LG and Samsung previews, with Open-Meteo's
answers played back at a fixed clock. Since this line shows on every LG and Samsung TV, a few things need another pass
first.

**What the line says**

1. **The minutes don't count down.** They're worked out when the forecast arrives and kept until the next one (up to
   30 minutes). With rain due at 20:45, the card said "Rain in ~40 min" at 20:07 and still at 20:32.
2. **While it rains**, the card says "Rain" and then "Rain in ~10 min". The step we're in is skipped once it's 7
   minutes old.
3. **With no step ahead**, it still says "No rain in the next 2 hours". That happens with a forecast cached before the
   TV was turned off and no network. Where the time zone is off by half an hour (India, Nepal), Open-Meteo also starts
   the 8 steps 30 to 45 minutes back, so "2 hours" covers barely more than one.
4. **"UV 8" shows at night**, because it's the day's highest.

**The card**

5. **The two columns no longer line up.** The high/low moved down to 258 px and got smaller, while sunrise and sunset
   stay at 236. On main, and on Android, they share one baseline. The high/low now also sits below the end of the
   divider.
6. **The everyday line gets cut.** It's cut at 352 px, so during the day the UV and AQI often disappear. "No rain in the
   next 2 hours · UV 8 · AQI 42" is 404 px in English, 469 in Portuguese, 524 in German, 523 in Russian and 533 in
   Polish. In Russian and Finnish, even the rain line is cut.

**Requests and README**

7. **Air quality is fetched even with the weather card off**, although the card is the only place it shows. A host
   that doesn't answer is asked again every 30 seconds: https and then http on 2015-2016 Samsungs.
8. **The README** should say these are LG and Samsung only. The Privacy line now lists Open-Meteo's hosts but not the
   city search, `geocoding-api.open-meteo.com`.

Below is a patch for 1–4, 7 and 8 that you can apply as it is (`git apply`):

- It keeps the 15-minute steps and reads them when the card is drawn. It asks for 14 steps, so a 30-minute-old
  forecast still reaches two hours, also in half-hour zones.
- A small timer redraws the card when its line would change.
- It says nothing about rain while it rains, or when the steps don't reach two hours.
- It shows UV only by day.
- It asks the air-quality host only while the weather card is on, and waits 5 minutes after a failure.

For 5 and 6, one idea: show the line only when it has something to say (rain coming, a high UV by day, an AQI from
"moderate" up), and leave the card as it is on main otherwise. When it does show, line up the last rows of both
columns. "No rain in the next 2 hours" is the longest part and the least useful; without it, most of the cuts go away.
What do you think?


<details><summary>Patch for 1–4, 7 and 8</summary>

```diff
diff --git a/README.md b/README.md
index a0e1cebd..18dac045 100644
--- a/README.md
+++ b/README.md
@@ -22,7 +22,7 @@ Open source. Built with Claude Code. One button to undo.
 - **Trending, not sponsored.** Three fresh picks every hour (up to six, in Home Settings) from what's trending this week and the latest releases, only from apps you already have, and from the services you choose. The focused one opens wide and the others show their posters. Movies and Shows get their own tabs, and on Google TV your own [Plex library](#your-plex-library-optional) can join in.
 - **Continue Watching** (Google TV and Android TV). *Home Settings* → *Top of the screen* puts what you left halfway in your apps on top, with its progress, and OK picks it up in its app. Or a big clock, or the picks.
 - **Your TMDB key from your phone.** *Home Settings* → *TMDB key* shows a QR code: scan it and paste the key. On LG and Samsung, type it with the remote.
-- **Weather and markets, one press away.** The hour-by-hour forecast (or the next 5 days), sunrise and sunset, rain in the next two hours, UV and air quality, and live crypto prices.
+- **Weather and markets, one press away.** The hour-by-hour forecast (or the next 5 days), sunrise and sunset, and live crypto prices; on LG and Samsung, also rain in the next two hours, the UV index and the air quality.
 - **What's playing.** Music, a podcast or the radio going on in the background shows on the home screen and the screensaver: the title, the artist and the app, from any app that tells Android what it plays (*Home Settings*, off until you turn it on).
 - **The status at a glance, and a mouse** (Google TV and Android TV). *Home Settings* → *Status icons* puts Wi-Fi or Ethernet, Bluetooth audio and a USB drive at the top of the home screen; off, nothing listens for them. A mouse or an air-mouse remote works too: hover moves the focus, the wheel scrolls, a click picks.
 - **Light by day, dark by night.** It follows your city's real sunset, the way your phone does.
@@ -336,7 +336,7 @@ reference (fix them by hand); the others were machine-made, and corrections from
 
 ## Privacy
 
-No accounts, no analytics, no tracking. The app talks to TMDB, Open-Meteo (their forecast at api.open-meteo.com and their air quality at air-quality-api.open-meteo.com, with the coordinates you set, or your time zone's main city), and Binance only when `show_crypto=true`, Watchmode only when you set a `watchmode_key`, your Plex server only when you set a `plex_url`, your Immich server only when you set one, and Trakt (api.trakt.tv) only when you set a `trakt_client_id` and sign in on the TV. On Google TV and Android TV, the APK from the release asks GitHub (api.github.com) once a week, or when you press *Updates*, for the latest release, and when there's a newer one downloads it from github.com and GitHub's download server (release-assets.githubusercontent.com); a build you made yourself asks only when you press *Updates*. The *Now Playing widget* reads what apps are playing (title, artist, the app) through a notification listener, the only way Android shares it: Free My TV allows the listener only while the widget is on, never reads a notification with it, and asks Android to unbind it as soon as it connects, so it stays unbound. What's playing never leaves the TV. While *Home Settings* → *TMDB key* shows its QR code (5 minutes at most), the TV answers on your home network at that code's address, for one key; the key goes to TMDB only, to check it. Continue Watching (Home Settings) reads what your apps note on the TV itself and shows only pictures already on the TV: it downloads nothing. *Home Settings* → *Status icons* reads only whether the TV has Wi-Fi or Ethernet, a Bluetooth audio device and a mounted USB drive, and only while the row is on: on Android 12 and newer it asks for *Nearby devices* (BLUETOOTH_CONNECT) for the Bluetooth part, and none of it leaves the TV. Your settings stay on your computer and your TV.
+No accounts, no analytics, no tracking. The app talks to TMDB, Open-Meteo (their forecast at api.open-meteo.com, the city search at geocoding-api.open-meteo.com and, on LG and Samsung while the weather card is on, their air quality at air-quality-api.open-meteo.com, with the coordinates you set, or your time zone's main city), and Binance only when `show_crypto=true`, Watchmode only when you set a `watchmode_key`, your Plex server only when you set a `plex_url`, your Immich server only when you set one, and Trakt (api.trakt.tv) only when you set a `trakt_client_id` and sign in on the TV. On Google TV and Android TV, the APK from the release asks GitHub (api.github.com) once a week, or when you press *Updates*, for the latest release, and when there's a newer one downloads it from github.com and GitHub's download server (release-assets.githubusercontent.com); a build you made yourself asks only when you press *Updates*. The *Now Playing widget* reads what apps are playing (title, artist, the app) through a notification listener, the only way Android shares it: Free My TV allows the listener only while the widget is on, never reads a notification with it, and asks Android to unbind it as soon as it connects, so it stays unbound. What's playing never leaves the TV. While *Home Settings* → *TMDB key* shows its QR code (5 minutes at most), the TV answers on your home network at that code's address, for one key; the key goes to TMDB only, to check it. Continue Watching (Home Settings) reads what your apps note on the TV itself and shows only pictures already on the TV: it downloads nothing. *Home Settings* → *Status icons* reads only whether the TV has Wi-Fi or Ethernet, a Bluetooth audio device and a mounted USB drive, and only while the row is on: on Android 12 and newer it asks for *Nearby devices* (BLUETOOTH_CONNECT) for the Bluetooth part, and none of it leaves the TV. Your settings stay on your computer and your TV.
 
 ## Credits
 
diff --git a/web/data.js b/web/data.js
index 66f9cc58..e9f74b3a 100644
--- a/web/data.js
+++ b/web/data.js
@@ -153,10 +153,11 @@ var Data = (function () {
 
   function place() { return Prefs.latitude() + ',' + Prefs.longitude(); }
   // Both forecasts in one answer, the next 48 hours and today plus 5 days: Home Settings → Forecast switches without
-  // asking again, and offline too. The next two hours in 15-minute steps tell the card whether rain is coming.
+  // asking again, and offline too. 14 steps of 15 minutes tell the card whether rain comes in the next two hours, even
+  // from a forecast 30 minutes old (where the time zone is off by half an hour, they start up to 45 minutes back).
   var QUERY = '&current=temperature_2m,weather_code,is_day'
       + '&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,weather_code,uv_index_max'
-      + '&minutely_15=precipitation,precipitation_probability&forecast_minutely_15=8'
+      + '&minutely_15=precipitation,precipitation_probability&forecast_minutely_15=14'
       + '&hourly=temperature_2m,weather_code,is_day&timezone=auto&forecast_days=6&forecast_hours=48';
   var weather = null, weatherAt = 0, fetchingWeather = false;
   (function () {
@@ -181,17 +182,15 @@ var Data = (function () {
       uv: dl.uv_index_max ? dl.uv_index_max[0] : null,
       sunrise: localTime(dl.sunrise[0], off), sunset: localTime(dl.sunset[0], off), hours: [], days: []
     };
-    // The next two hours in 15-minute steps: enough for "rain in ~40 min" without a second request. A slot counts as
-    // rain from a 50% chance or 0.2 mm of it; the first one is when it starts.
+    // The 15-minute steps, [start, rain]: a step counts as rain from a 50% chance or 0.2 mm of it. rainIn reads them at
+    // the moment the card is drawn, not when the forecast came.
     var mr = o.minutely_15;
     if (mr && mr.time) {
-      w.rain = {inMin: null};
+      w.steps = [];
       for (var k = 0; k < mr.time.length; k++) {
-        var when = localTime(mr.time[k], off);
-        if (when < now - 7 * 60000) continue;   // the step it's in now
         var pr = mr.precipitation_probability ? mr.precipitation_probability[k] || 0 : 0;
         var mm = mr.precipitation ? mr.precipitation[k] || 0 : 0;
-        if (w.rain.inMin === null && (pr >= 50 || mm >= 0.2)) w.rain.inMin = Math.max(0, Math.round((when - now) / 60000));
+        w.steps.push([localTime(mr.time[k], off), pr >= 50 || mm >= 0.2]);
       }
     }
     var hr = o.hourly;
@@ -211,6 +210,20 @@ var Data = (function () {
     return w;
   }
 
+  /**
+   * Rain in the next two hours at `now`: the minutes until it starts, 0 while the step we're in has it, -1 if no step up
+   * to two hours from now has any, null when the steps don't reach that far (an older forecast, offline).
+   */
+  function rainIn(now) {
+    var s = weather && weather.steps, STEP = 15 * 60000, end = now + 2 * 3600000;
+    if (!s || !s.length) return null;
+    for (var i = 0; i < s.length && s[i][0] < end; i++) {
+      if (s[i][0] + STEP <= now) continue;   // already over
+      if (s[i][1]) return Math.max(0, Math.round((s[i][0] - now) / 60000));
+    }
+    return s[s.length - 1][0] + STEP >= end ? -1 : null;
+  }
+
   function refreshWeather() {
     var now = Date.now();
     if (fetchingWeather || (now - weatherAt < 30 * 60000 && now >= weatherAt)) return;
@@ -234,7 +247,7 @@ var Data = (function () {
    * cache and its own key, and a TV that can't reach it still shows the weather.
    */
   var AIR_QUERY = 'current=us_aqi,pm2_5&timezone=auto';
-  var air = null, airAt = 0, fetchingAir = false;
+  var air = null, airAt = 0, airTried = 0, fetchingAir = false;
   (function () {
     var a = stored('air');
     if (a && a.place === place() && a.query === AIR_QUERY) { air = a.body; airAt = a.at; }
@@ -242,7 +255,9 @@ var Data = (function () {
 
   function refreshAir() {
     var now = Date.now();
-    if (fetchingAir || (now - airAt < 30 * 60000 && now >= airAt)) return;
+    // Only for the weather card; a host that didn't answer is asked again 5 minutes later, not at every 30-second tick.
+    if (!Prefs.weather() || fetchingAir || (now - airAt < 30 * 60000 && now >= airAt) || (now - airTried < 5 * 60000 && now >= airTried)) return;
+    airTried = now;
     fetchingAir = true;
     var at = place();
     getMeteo('air-quality-api.open-meteo.com/v1/air-quality?latitude=' + Prefs.latitude() + '&longitude='
@@ -693,9 +708,10 @@ var Data = (function () {
     settingsChanged: function () { pricesAt = 0; refreshPrices(); changed(); },
     findCity: findCity,
     /** Another city picked: its weather now (none shown until it comes). */
-    cityChanged: function () { weather = null; weatherAt = 0; air = null; airAt = 0; refreshWeather(); refreshAir(); changed(); },
+    cityChanged: function () { weather = null; weatherAt = 0; air = null; airAt = 0; airTried = 0; refreshWeather(); refreshAir(); changed(); },
     get weather() { return weather; },
     get air() { return air; },
+    rainIn: rainIn,
     get weatherAt() { return weatherAt; },
     prices: prices,
     changes: changes,
diff --git a/web/home.js b/web/home.js
index a2d781b6..c5aa1df1 100644
--- a/web/home.js
+++ b/web/home.js
@@ -648,15 +648,8 @@
     sym(Data.symbol(w.code, w.isDay), now);
     el('span', 'temp', now, Data.degrees(w.temp));
     el('div', 'cond', card, Data.condition(w.code, w.isDay));
-    var extra = [];
-    if (w.rain) {
-      extra.push(w.rain.inMin === null ? tr('No rain in the next 2 hours')
-        : trf('Rain in ~{time}', {time: trf('{n} min', {n: Math.max(5, Math.round(w.rain.inMin / 5) * 5)})}));
-    }
-    if (w.uv >= 3) extra.push(trf('UV {n}', {n: Math.round(w.uv)}));
-    var air = Data.air;
-    if (air && air.aqi !== null && air.aqi !== undefined) extra.push(trf('AQI {n}', {n: Math.round(air.aqi)}));
-    if (extra.length) el('div', 'extra', card, extra.join(' · '));
+    extraShown = weatherExtra(w);
+    if (extraShown) el('div', 'extra', card, extraShown);
     el('div', 'range', card, trf('H:{max}', {max: Data.degrees(w.max)}) + '   ' + trf('L:{min}', {min: Data.degrees(w.min)}));
     el('div', 'split', card);
     // Home Settings → Forecast: the next 6 hours or the next 5 days (the hours until a forecast has days).
@@ -676,6 +669,25 @@
     if (w.sunset) { var b = el('span', '', sun); sym('sunset', b); b.appendChild(document.createTextNode(trf('Sunset {time}', {time: Data.time(w.sunset)}))); }
   }
 
+  var extraShown = '';
+
+  /** The line under the condition: rain in the next two hours, the UV index by day, the air quality. */
+  function weatherExtra(w) {
+    var extra = [], rain = Data.rainIn(Date.now());
+    // 0: it rains now, which the line above says; null: the forecast doesn't reach two hours from now (offline).
+    if (rain > 0) extra.push(trf('Rain in ~{time}', {time: trf('{n} min', {n: Math.max(5, Math.round(rain / 5) * 5)})}));
+    else if (rain === -1) extra.push(tr('No rain in the next 2 hours'));
+    if (w.uv >= 3 && w.isDay) extra.push(trf('UV {n}', {n: Math.round(w.uv)}));   // the day's highest, so not at night
+    var air = Data.air;
+    if (air && air.aqi !== null && air.aqi !== undefined) extra.push(trf('AQI {n}', {n: Math.round(air.aqi)}));
+    return extra.join(' · ');
+  }
+
+  // "Rain in ~40 min" counts down between forecasts: the card is drawn again when its line would read otherwise.
+  setInterval(function () {
+    if (Prefs.weather() && Data.weather && weatherExtra(Data.weather) !== extraShown) renderPanels();
+  }, 60000);
+
   function renderPrices(card, coins) {
     el('div', 'head', card, tr('Crypto'));
     var stale = Data.staleness(Data.pricesAt, 5 * 60000);
```

</details>
