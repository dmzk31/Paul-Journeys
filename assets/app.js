const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const empty = () => ({ type: 'FeatureCollection', features: [] });
const feature = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } });
const collection = (features) => ({ type: 'FeatureCollection', features });
const modeNames = { start: '出發', land: '陸路', sea: '海路', drift: '海上漂流（示意）', uncertain: '交通方式未詳' };
let data, map, current, progress = 0, selected = 0, playing = false, mode = '2d';
let segments = [], markers = [], traveller, lastFrame = 0, lastDraw = 0, lastFollow = 0, frame = 0;
let ready = false, toastTimer;
let companionSegment = -1;
let activePanel = null;
const panelNames = { journeys: '選擇行程', stops: '站點與事件', companions: '同行者與經文', playback: '播放設定', camera: '調整視角' };
const companionStatuses = { direct: '經文明載', context: '上下文接續', inferred: '敘事推定', translation: '依所附譯文', escort: '押送者' };

function openExplorer(name) {
  if (!ready || !panelNames[name]) return;
  if (['journeys', 'stops', 'companions'].includes(name)) pause();
  if (activePanel && activePanel !== name) $('journey-panel').append($(`panel-${activePanel}`));
  activePanel = name;
  $('explorer-title').textContent = panelNames[name];
  $('explorer-body').append($(`panel-${name}`));
  document.querySelectorAll('[data-panel]').forEach((button) => button.setAttribute('aria-expanded', String(button.dataset.panel === name)));
  if (!$('explorer-dialog').open) $('explorer-dialog').showModal();
  $('explorer-dialog').scrollTop = 0;
}

function closeExplorer() {
  if ($('explorer-dialog').open) $('explorer-dialog').close();
}

function restoreExplorer() {
  if (activePanel) $('journey-panel').append($(`panel-${activePanel}`));
  activePanel = null;
  document.querySelectorAll('[data-panel]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
}

function notify(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3600);
}

function fail(message) {
  $('loading').hidden = false;
  $('loading').classList.add('error');
  $('loading').replaceChildren();
  const heading = document.createElement('strong');
  heading.textContent = '暫時無法展開地圖';
  const detail = document.createElement('span');
  detail.textContent = message;
  $('loading').append(heading, detail);
  $('play-btn').disabled = true;
}

function densify(points) {
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const steps = Math.max(12, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 16));
    for (let n = 1; n <= steps; n++) {
      const t = n / steps;
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

function coordinateAt(points, t) {
  const f = Math.max(0, Math.min(1, t)) * (points.length - 1);
  const i = Math.min(Math.floor(f), points.length - 2), part = f - i;
  return [points[i][0] + (points[i + 1][0] - points[i][0]) * part,
    points[i][1] + (points[i + 1][1] - points[i][1]) * part];
}

function partial(points, t) {
  const at = Math.floor(t * (points.length - 1));
  return [...points.slice(0, at + 1), coordinateAt(points, t)];
}

function drawProgress() {
  if (!ready || !segments.length) return;
  const count = Math.floor(progress), fraction = progress - count;
  const done = segments.slice(0, count).map((s) => feature(s.coordinates, { mode: s.mode, arrivalIndex: s.arrivalIndex }));
  if (fraction > 0 && segments[count]) done.push(feature(partial(segments[count].coordinates, fraction), { mode: segments[count].mode, arrivalIndex: segments[count].arrivalIndex }));
  map.getSource('completed').setData(collection(done));
  const position = progress >= segments.length ? segments.at(-1).coordinates.at(-1) : coordinateAt(segments[count].coordinates, fraction);
  traveller.setLngLat(position);
  $('progress').value = String(progress);
  $('progress').setAttribute('aria-valuetext', `${current.stops[count].name}，第 ${count + 1} 站，共 ${current.stops.length} 站`);
  const percent = progress / segments.length * 100;
  $('progress').style.setProperty('--progress', `${percent}%`);
  if (count !== selected) showStop(count);
  renderCompanions(fraction > 0 && segments[count] ? count + 1 : count);
  if (playing && $('follow-camera').checked && performance.now() - lastFollow > 500) {
    lastFollow = performance.now();
    map.easeTo({ center: position, duration: reducedMotion ? 0 : 600, essential: false });
  }
}

function pause() {
  playing = false;
  cancelAnimationFrame(frame);
  $('play-label').textContent = '播放';
  $('play-icon').textContent = '▶';
  $('play-btn').setAttribute('aria-label', '播放本次行程');
}

function animate(time) {
  if (!playing) return;
  const elapsed = Math.min(time - lastFrame, 100);
  lastFrame = time;
  progress = Math.min(segments.length, progress + elapsed / 2800 * Number($('speed').value));
  if (time - lastDraw > 65 || progress === segments.length) {
    drawProgress();
    lastDraw = time;
  }
  if (progress >= segments.length) {
    pause();
    notify('本次行程播放完成，可選擇另一段旅程。');
    return;
  }
  frame = requestAnimationFrame(animate);
}

function play() {
  if (!ready) return;
  if (playing) { pause(); return; }
  if (progress >= segments.length) { progress = 0; showStop(0); drawProgress(); }
  playing = true;
  lastFrame = performance.now();
  $('play-label').textContent = '暫停';
  $('play-icon').textContent = 'Ⅱ';
  $('play-btn').setAttribute('aria-label', '暫停行程播放');
  frame = requestAnimationFrame(animate);
}

function showStop(index) {
  selected = Math.max(0, Math.min(current.stops.length - 1, index));
  const stop = current.stops[selected], place = data.places[stop.place];
  $('station-step').textContent = `第 ${selected + 1} 站 ／ 共 ${current.stops.length} 站`;
  $('station-mode').textContent = stop.returning ? '回程探訪' : stop.approximate ? '地區概略標記' : modeNames[stop.mode];
  $('station-name').textContent = stop.name;
  $('station-title').textContent = stop.title;
  $('station-text').textContent = stop.text;
  $('station-note').hidden = !stop.note;
  $('station-note').textContent = stop.note || '';
  $('station-ref').textContent = stop.ref;
  $('place-source').href = place.source;
  $('play-position').textContent = `${selected + 1} / ${current.stops.length}`;
  $('current-location').textContent = stop.name;
  $('current-station').setAttribute('aria-label', `查看${stop.name}的站點與事件，第${selected + 1}站`);
  $('prev-btn').disabled = selected === 0;
  $('next-btn').disabled = selected === current.stops.length - 1;
  for (const button of $('stop-list').querySelectorAll('button')) {
    const i = Number(button.dataset.index);
    button.classList.toggle('active', i === selected);
    button.classList.toggle('visited', i < selected);
    if (i === selected) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
  for (const m of markers) {
    const active = m.place === stop.place;
    m.element.classList.toggle('active', active);
    m.element.classList.toggle('visited', m.indices.some((i) => i < selected));
    m.element.setAttribute('aria-pressed', String(active));
  }
  layoutLabels();
  renderCompanions(selected);
  updateHash();
}

function openScriptures(refs) {
  $('dialog-title').textContent = '同行者的經文根據';
  const intro = document.createElement('p');
  intro.textContent = '以下引文取自參考資料中的《使徒行傳》，移除註號並合併同節分段；推定與上下文接續的判斷另在同行者註記中標示。';
  $('dialog-body').replaceChildren(intro);
  for (const ref of [...new Set(refs)]) {
    const heading = document.createElement('h3'); heading.textContent = ref;
    const quote = document.createElement('blockquote'); quote.textContent = data.scriptureEvidence[ref].text;
    $('dialog-body').append(heading, quote);
  }
  $('info-dialog').showModal();
}

function scriptureButton(refs) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'companion-citation';
  button.textContent = refs.join('、');
  button.setAttribute('aria-label', `查閱經文：${refs.join('、')}`);
  button.addEventListener('click', () => openScriptures(refs));
  return button;
}

function renderCompanions(index) {
  if (companionSegment === index) return;
  companionSegment = index;
  const stop = current.stops[index], profile = data.companionProfiles[stop.companionProfile];
  $('companion-scope').textContent = index === 0 ? `${stop.name}：出發時的同行情況` : `${current.stops[index - 1].name} 至 ${stop.name}`;
  $('companion-people').replaceChildren();
  for (const person of profile.people) {
    const li = document.createElement('li'), heading = document.createElement('div');
    heading.className = 'companion-person-heading';
    const name = document.createElement('strong'); name.textContent = person.name;
    const status = document.createElement('span'); status.className = 'companion-status'; status.textContent = companionStatuses[person.status];
    heading.append(name, status);
    const role = document.createElement('p'); role.textContent = person.role;
    li.append(heading, role, scriptureButton(person.refs));
    $('companion-people').append(li);
  }
  if (!profile.people.length) {
    const li = document.createElement('li'); li.className = 'companion-unknown';
    li.textContent = '本段未列可確認的具名同行者。';
    $('companion-people').append(li);
  }
  $('companion-note').textContent = profile.note;
  $('companion-note').hidden = !profile.note;
  $('companion-change').textContent = stop.companionChange || '';
  $('companion-change').hidden = !stop.companionChange;
  $('companion-related').hidden = !profile.related.length;
  $('companion-related').open = false;
  $('companion-related-body').replaceChildren();
  for (const related of profile.related) {
    const paragraph = document.createElement('p'); paragraph.textContent = related.text;
    $('companion-related-body').append(paragraph, scriptureButton(related.refs));
  }
  const allRefs = [...new Set([...profile.refs, ...(stop.companionChangeRefs || []), ...profile.people.flatMap((person) => person.refs), ...profile.related.flatMap((person) => person.refs)])];
  $('companion-evidence').textContent = `查閱本段經文（${allRefs.length}節）`;
  $('companion-evidence').onclick = () => openScriptures(allRefs);
  const names = profile.people.filter((person) => !person.name.includes('未逐') && !person.name.startsWith('同船的其他')).map((person) => person.status === 'inferred' ? '路加（推定）' : person.status === 'escort' ? '押送隊伍' : person.name);
  $('map-companions-caption').textContent = names.length ? names.join('、') : '本段具名同行者未詳';
  $('map-companions-caption').title = `${$('companion-scope').textContent}；詳見同行者註記與經文`;
}

function goTo(index, focusMap = true) {
  pause();
  progress = Math.max(0, Math.min(current.stops.length - 1, index));
  showStop(Math.floor(progress));
  drawProgress();
  if (focusMap) {
    map.easeTo({ center: data.places[current.stops[selected].place].coordinates, duration: reducedMotion ? 0 : 750 });
  }
}

function fitJourney(duration = 800) {
  if (!ready) return;
  const bounds = new maplibregl.LngLatBounds();
  for (const segment of segments) for (const coordinate of segment.coordinates) bounds.extend(coordinate);
  const mobile = innerWidth <= 720;
  map.fitBounds(bounds, { padding: { top: mobile ? 30 : 48, bottom: mobile ? 38 : 52, left: mobile ? 38 : 75, right: mobile ? 38 : 75 },
    maxZoom: 6.4, pitch: mode === '3d' ? 43 : 0, bearing: 0, duration: reducedMotion ? 0 : duration });
}

function layoutLabels() {
  if (!map || !current) return;
  const boxes = [], rect = $('map').getBoundingClientRect();
  const priority = [...markers].sort((a, b) => Number(b.place === current.stops[selected].place) - Number(a.place === current.stops[selected].place));
  const points = markers.map((marker) => ({ place: marker.place, ...map.project(data.places[marker.place].coordinates) }));
  for (const m of priority) {
    const p = map.project(data.places[m.place].coordinates);
    const label = m.element.querySelector('.place-label');
    const width = label.offsetWidth, height = label.offsetHeight;
    const isActive = m.place === current.stops[selected].place;
    const candidates = [
      { l: p.x + 13, t: p.y - height / 2 },
      { l: p.x - 13 - width, t: p.y - height / 2 },
      { l: p.x - width / 2, t: p.y - height - 14 },
      { l: p.x - width / 2, t: p.y + 14 },
    ].map((b) => ({ ...b, r: b.l + width, b: b.t + height }));
    let box = candidates.find((b) => b.l >= 6 && b.r <= rect.width - 6 && b.t >= 6 && b.b <= rect.height - 22
      && !boxes.some((a) => b.l - 4 < a.r && b.r + 4 > a.l && b.t - 4 < a.b && b.b + 4 > a.t)
      && !points.some((other) => other.place !== m.place && other.x > b.l - 8 && other.x < b.r + 8 && other.y > b.t - 8 && other.y < b.b + 8));
    const pointVisible = p.x > 0 && p.x < rect.width && p.y > 0 && p.y < rect.height - 16;
    if (!box && isActive && pointVisible) {
      const l = Math.max(6, Math.min(rect.width - width - 6, p.x + 13));
      const t = Math.max(6, Math.min(rect.height - height - 22, p.y - height / 2));
      box = { l, r: l + width, t, b: t + height };
    }
    const show = pointVisible && !!box && (isActive || map.getZoom() > 2.1);
    m.element.classList.toggle('label-hidden', !show);
    if (show) {
      label.style.left = `${box.l - p.x + 18}px`;
      label.style.top = `${box.t - p.y + 18}px`;
      boxes.push(box);
    }
  }
}

function selectJourney(id, initialStop = 0) {
  pause();
  current = data.journeys.find((j) => j.id === id) || data.journeys[0];
  progress = 0; selected = -1;
  companionSegment = -1;
  document.documentElement.style.setProperty('--accent', current.color);
  $('journey-name').textContent = current.name;
  $('journey-ref').textContent = current.ref;
  $('journey-summary').textContent = current.summary;
  $('companions').textContent = current.companions;
  $('journey-books').textContent = current.books;
  $('stop-total').textContent = `${current.stops.length} 個路線節點`;
  $('map-journey-caption').textContent = current.name;
  $('progress').max = String(current.stops.length - 1);
  for (const button of $('journey-tabs').children) button.setAttribute('aria-pressed', String(Number(button.dataset.id) === current.id));
  $('stop-list').replaceChildren();
  current.stops.forEach((stop, i) => {
    const li = document.createElement('li'), button = document.createElement('button');
    button.type = 'button'; button.dataset.index = i;
    const label = document.createElement('span'); label.textContent = stop.name;
    const meta = document.createElement('small'); meta.textContent = stop.returning ? '回訪' : stop.approximate ? '地區' : String(i + 1).padStart(2, '0');
    button.append(label, meta);
    button.addEventListener('click', () => { goTo(i); closeExplorer(); });
    li.append(button); $('stop-list').append(li);
  });
  segments = current.stops.slice(1).map((stop, i) => ({ mode: stop.mode, arrivalIndex: i + 1,
    coordinates: densify([data.places[current.stops[i].place].coordinates, ...(stop.via || []), data.places[stop.place].coordinates]) }));
  const route = collection(segments.map((s) => feature(s.coordinates, { mode: s.mode, arrivalIndex: s.arrivalIndex })));
  map.getSource('route').setData(route);
  for (const layer of ['route-land', 'route-sea', 'route-uncertain', 'completed-land', 'completed-sea', 'completed-uncertain']) map.setPaintProperty(layer, 'line-color', current.color);
  markers.forEach((m) => m.marker.remove()); markers = [];
  const unique = new Map();
  current.stops.forEach((stop, i) => {
    if (!unique.has(stop.place)) unique.set(stop.place, []);
    unique.get(stop.place).push(i);
  });
  unique.forEach((indices, placeId) => {
    const place = data.places[placeId], element = document.createElement('button');
    element.className = 'place-marker'; element.type = 'button';
    element.setAttribute('aria-label', `${place.name}，顯示此站事件`);
    const dot = document.createElement('span'); dot.className = 'dot';
    const label = document.createElement('span'); label.className = 'place-label'; label.textContent = place.name;
    element.append(dot, label);
    element.addEventListener('click', (e) => { e.stopPropagation(); goTo(indices.find((i) => i > selected) ?? indices[0]); openExplorer('stops'); });
    const marker = new maplibregl.Marker({ element }).setLngLat(place.coordinates).addTo(map);
    markers.push({ marker, element, indices, place: placeId });
  });
  goTo(Math.min(current.stops.length - 1, initialStop), false);
  fitJourney();
  $('stop-list').scrollTop = 0;
}

function setMode(value, fit = true) {
  if (!ready) return;
  mode = value;
  map.setProjection({ type: mode === '3d' ? 'globe' : 'mercator' });
  $('mode-2d').classList.toggle('active', mode === '2d');
  $('mode-3d').classList.toggle('active', mode === '3d');
  $('mode-2d').setAttribute('aria-pressed', String(mode === '2d'));
  $('mode-3d').setAttribute('aria-pressed', String(mode === '3d'));
  $('pitch').disabled = mode === '2d';
  $('camera-tip').textContent = mode === '3d' ? '可用滑桿，或右鍵／雙指拖曳調整視角。' : '切換至3D，即可調整傾斜角度。';
  map.setMaxPitch(mode === '3d' ? 65 : 0);
  if (fit) fitJourney();
  else map.easeTo({ pitch: mode === '3d' ? 43 : 0, duration: reducedMotion ? 0 : 650 });
  updateHash();
}

function updateHash() {
  const hash = `journey=${current.id}&stop=${selected + 1}&view=${mode}`;
  history.replaceState(null, '', `#${hash}`);
}

function cameraChanged() {
  const bearing = Math.round(map.getBearing()), pitch = Math.round(map.getPitch());
  $('bearing').value = bearing;
  $('pitch').value = pitch;
  $('bearing-value').textContent = `${bearing}°`;
  $('pitch-value').textContent = `${pitch}°`;
  $('north-indicator').style.transform = `rotate(${-bearing}deg)`;
  layoutLabels();
}

function openDialog(type) {
  if (type === 'companions') {
    $('dialog-title').textContent = '同行者如何分段與引用經文';
    $('dialog-body').innerHTML = `<p>每站的同行者註記指「由前站抵達本站」的一段；第一站列出發情況。播放途中則顯示正在前往的路段。每位人物的經文出處都可點開閱讀。</p><h3>經文明載</h3><p>經文在相關段落直接點名或明說該群體同行；不表示每一個中途站都有再次點名。</p><h3>上下文接續</h3><p>人物在前後文可見，依敘事銜接列示；若該小段沒有重新具名，會明白註記。</p><h3>敘事推定</h3><p>「我們」顯示敘事者參與；將敘事者稱作路加，依所附文件卷首的作者說明，並不是經文在每一站直接寫出路加的名字。也不把16章的「我們」延伸到其後所有路段。</p><h3>分隊與不同角色</h3><p>先行、留守、接待、護送、押送分別說明。徒20:4的七人名單不等於每段都與保羅同船；猶流是押送百夫長，不列為宣教同工。拿孫的列示依所附徒21:16的譯文。</p><h3>經文未詳</h3><p>沒有足夠經文確定姓名時，標為未詳；這不等於斷言保羅獨行。相關人物仍可在「分隊、會合與其他相關人物」查看，但不當成本段確定同行名單。</p>`;
  } else if (type === 'help') {
    $('dialog-title').textContent = '地圖操作說明';
    $('dialog-body').innerHTML = `<h3>電腦操作</h3><p>左鍵拖曳移動地圖，滾輪縮放。3D 模式下，按住右鍵拖曳可旋轉與傾斜；也可按「調整視角」使用方向與角度滑桿。</p><h3>手機與平板</h3><p>單指拖曳移動，雙指張合縮放，雙指旋轉調整方向；在3D模式下，雙指平行上下拖曳可調整傾斜。按下底部「視角」即可開啟方向與傾斜滑桿。</p><h3>逐站探索</h3><p>按「行程」選擇旅程，按主畫面的「播放」開始，也可按「站點」選擇城市。清單平時收合，選擇後會回到地圖。實線表示陸路，虛線表示海路，點線表示海上漂流或交通方式未詳。回程會保留重訪同一城市的站次。</p><h3>播放與視角</h3><p>可暫停、切換速度、拖動進度，或逐站前後移動。「視角跟隨」會將地圖中心跟隨旅程移動；手動拖曳地圖後會停止跟隨。按「播放設定」調整進度與速度，按「視角」開啟縮放、朝北及地球全景工具；按「完整路線」恢復全程視野。</p><h3>鍵盤與分享</h3><p>所有主要控制都可用 Tab 選取。聚焦地圖後可用方向鍵移動、加減鍵縮放；進度與視角滑桿可用方向鍵調整。網址會記住行程、站次與2D／3D模式，可複製分享。</p>`;
  } else {
    $('dialog-title').textContent = '資料來源與閱讀方式';
    $('dialog-body').innerHTML = `<h3>行程、事件與經文出處</h3><p>依提供的《保羅的行程v2》（主要參考，第9–18頁）、《保羅的行程v1》、《使徒行傳》，及《使徒行傳一至二十八章鳥瞰、保羅的四次行程、十四封書信的著時》整理。本站事件說明為摘要，經文欄提供查讀位置。</p><h3>四次行程的分段</h3><p>第一次：徒13:4下–14:28；第二次：徒15:40–18:22；第三次：徒18:23–21:17；第四次：徒27:1–28:31。第四次依參考資料指「被解往羅馬」的航程；徒21–26章的被捕、受審與上訴作為背景。</p><h3>地點與路線</h3><p>城市座標採 <a href="https://www.openbible.info/geo/" target="_blank" rel="noopener noreferrer">OpenBible.info Bible Geocoding</a> 的主要候選地點，依其識別評分選取，資料授權為 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>。地區概略標記不代表確定停靠城市。路線依經文次序繪製為示意連線，非精確古道路或航跡；部分途經小站未逐一列出。古代港口與現代海岸線可能不重合。</p><h3>地圖底圖與程式庫</h3><p>海岸線與陸地採 <a href="https://www.naturalearthdata.com/downloads/50m-physical-vectors/" target="_blank" rel="noopener noreferrer">Natural Earth 1:50m Land</a>（公有領域）。底圖使用現代地理輪廓，不表示古代行政疆界。互動地圖採 <a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">MapLibre GL JS 5.6.2</a>（BSD-3-Clause）。2D為平面地圖，3D為可旋轉、傾斜的地球投影，不含地形高程。</p><h3>書信著時</h3><p>書信資訊沿用參考資料的安排，屬著時整理，不是《使徒行傳》直接逐項記載。羅馬獲釋後的行程與「可能／也許」的著時推定，未併入四次行程的確定站序。</p>`;
  }
  $('info-dialog').showModal();
}

function bindControls() {
  $('play-btn').addEventListener('click', play);
  $('prev-btn').addEventListener('click', () => goTo(selected - 1));
  $('next-btn').addEventListener('click', () => goTo(selected + 1));
  $('restart-btn').addEventListener('click', () => { goTo(0, false); fitJourney(); closeExplorer(); });
  $('progress').addEventListener('input', () => { pause(); progress = Number($('progress').value); drawProgress(); });
  $('mode-2d').addEventListener('click', () => setMode('2d'));
  $('mode-3d').addEventListener('click', () => setMode('3d'));
  $('fit-btn').addEventListener('click', () => fitJourney());
  $('zoom-in').addEventListener('click', () => map.zoomIn({ duration: reducedMotion ? 0 : 300 }));
  $('zoom-out').addEventListener('click', () => map.zoomOut({ duration: reducedMotion ? 0 : 300 }));
  $('reset-bearing').addEventListener('click', () => map.easeTo({ bearing: 0, duration: reducedMotion ? 0 : 500 }));
  $('globe-btn').addEventListener('click', () => { closeExplorer(); setMode('3d', false); map.easeTo({ center: [28, 28], zoom: 1.25, pitch: 0, bearing: 0, duration: reducedMotion ? 0 : 1200 }); });
  document.querySelectorAll('[data-panel]').forEach((button) => {
    button.disabled = false;
    button.addEventListener('click', () => openExplorer(button.dataset.panel));
  });
  $('explorer-close').addEventListener('click', closeExplorer);
  $('explorer-dialog').addEventListener('close', restoreExplorer);
  $('bearing').addEventListener('input', () => map.setBearing(Number($('bearing').value)));
  $('pitch').addEventListener('input', () => map.setPitch(Number($('pitch').value)));
  $('help-btn').addEventListener('click', () => openDialog('help'));
  $('companion-method').addEventListener('click', () => openDialog('companions'));
  $('sources-btn').addEventListener('click', () => openDialog('sources'));
  $('dialog-close').addEventListener('click', () => $('info-dialog').close());
  for (const id of ['info-dialog', 'explorer-dialog']) $(id).addEventListener('click', (e) => {
    if (e.target !== $(id)) return;
    const r = $(id).getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $(id).close();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  map.on('dragstart', () => { $('follow-camera').checked = false; });
  map.on('move', cameraChanged);
  map.on('resize', layoutLabels);
  for (const layer of ['route-land', 'route-sea', 'route-uncertain', 'completed-land', 'completed-sea', 'completed-uncertain']) {
    map.on('click', layer, (event) => {
      const index = Number(event.features?.[0]?.properties?.arrivalIndex);
      if (Number.isInteger(index) && index > 0 && index < current.stops.length) { goTo(index, false); openExplorer('companions'); }
    });
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }
  window.addEventListener('resize', () => map.resize());
  new ResizeObserver(() => map.resize()).observe(document.querySelector('.map-stage'));
  window.addEventListener('hashchange', () => {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.has('journey')) return;
    const id = Number(h.get('journey')), at = Math.max(0, (Number(h.get('stop')) || 1) - 1);
    if (id !== current.id && data.journeys.some((j) => j.id === id)) selectJourney(id, at);
    else goTo(at, false);
    const view = h.get('view') === '3d' ? '3d' : '2d';
    if (view !== mode) setMode(view);
  });
}

async function init() {
  try {
    if (!globalThis.maplibregl) throw new Error('地圖程式未載入，請確認網站檔案完整。');
    const response = await fetch(new URL('./data/journeys.json', import.meta.url));
    if (!response.ok) throw new Error('行程資料未載入，請確認網站已完整上傳。');
    data = await response.json();
    const initial = new URLSearchParams(location.hash.slice(1));
    const initialId = Number(initial.get('journey')) || 1;
    const initialStop = Math.max(0, (Number(initial.get('stop')) || 1) - 1);
    const initialView = initial.get('view') === '3d' ? '3d' : '2d';
    const land = await fetch(new URL('./data/land.geojson', import.meta.url));
    if (!land.ok) throw new Error('底圖資料未載入，請確認 assets/data/land.geojson 已上傳。');
    const landData = await land.json();
    map = new maplibregl.Map({ container: 'map', center: [28, 36], zoom: 4, minZoom: .7, maxZoom: 10,
      maxPitch: 0, attributionControl: false, renderWorldCopies: false,
      style: { version: 8, projection: { type: 'mercator' }, sources: { land: { type: 'geojson', data: landData } },
        layers: [{ id: 'ocean', type: 'background', paint: { 'background-color': '#244e5b' } },
          { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#e9e7ce' } },
          { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': '#9caa91', 'line-width': .8, 'line-opacity': .65 } }] } });
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Natural Earth · OpenBible.info' }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');
    let loadTimeout = setTimeout(() => { if (!ready) fail('地圖載入較久。請重新整理；若仍無法顯示，請確認瀏覽器支援 WebGL，且網站檔案完整。'); }, 25000);
    map.on('error', (event) => {
      console.error('Map error:', event.error);
      if (!ready) fail('無法建立互動地圖。請使用支援 WebGL 的瀏覽器，或重新整理頁面。');
    });
    map.on('load', () => {
      clearTimeout(loadTimeout);
      for (const id of ['route', 'completed']) map.addSource(id, { type: 'geojson', data: empty() });
      for (const [source, prefix, opacity, width] of [['route', 'route', .6, 2.3], ['completed', 'completed', 1, 3.4]]) {
        for (const kind of ['land', 'sea', 'uncertain']) {
          const filter = kind === 'uncertain' ? ['in', ['get', 'mode'], ['literal', ['drift', 'uncertain']]] : ['==', ['get', 'mode'], kind];
          const paint = { 'line-color': '#bd8138', 'line-width': width, 'line-opacity': opacity };
          if (kind === 'sea') paint['line-dasharray'] = [2.3, 1.6];
          if (kind === 'uncertain') paint['line-dasharray'] = [.6, 1.6];
          map.addLayer({ id: `${prefix}-${kind}`, type: 'line', source, filter, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint });
        }
      }
      const el = document.createElement('div'); el.className = 'traveller'; el.setAttribute('aria-hidden', 'true');
      traveller = new maplibregl.Marker({ element: el }).setLngLat([36, 36]).addTo(map);
      const regions = [['小亞細亞', [31.8, 40.1]], ['馬其頓', [22.4, 41.6]], ['亞該亞', [22.2, 37.2]], ['敘利亞', [38.1, 35.2]], ['猶太地', [36, 31.5]], ['義大利', [12.4, 43]], ['地 中 海', [23.4, 33.3], true], ['居比路', [33.15, 34.65]], ['革哩底', [24.8, 35.6]]];
      for (const [label, coordinate, water] of regions) {
        const element = document.createElement('div'); element.className = 'region-label' + (water ? ' water' : ''); element.textContent = label; element.setAttribute('aria-hidden', 'true');
        new maplibregl.Marker({ element }).setLngLat(coordinate).addTo(map);
      }
      data.journeys.forEach((journey) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'journey-tab'; button.dataset.id = journey.id;
        button.style.setProperty('--tab-color', journey.color);
        const dot = document.createElement('i'); dot.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span'); label.textContent = journey.name;
        button.append(dot, label); button.addEventListener('click', () => { selectJourney(journey.id); closeExplorer(); });
        $('journey-tabs').append(button);
      });
      ready = true;
      bindControls();
      selectJourney(initialId, initialStop);
      setMode(initialView);
      $('pitch').disabled = mode === '2d';
      $('loading').hidden = true;
      if (innerWidth <= 720) document.querySelector('.gesture-hint').textContent = '單指移動 · 雙指縮放、旋轉 · 3D雙指上下調整傾斜';
    });
  } catch (error) {
    console.error(error);
    fail(location.protocol === 'file:' ? '請透過本機預覽伺服器或 GitHub Pages 開啟網頁；直接雙擊 HTML 無法讀取地圖資料。' : error.message || '地圖載入失敗，請重新整理後再試。');
  }
}
init();
