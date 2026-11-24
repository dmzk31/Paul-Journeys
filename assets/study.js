// Supplied manuscript and Recovery Version introductions remain distinct sources.
let guide, introductions;
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
export function configureStudy(manuscript, letters) { guide = manuscript; introductions = letters; }
export function studyJourney(id) { return guide.journeys.find(j => j.id === id); }
export function stopEvents(id, index) {
  const journey = studyJourney(id);
  return (journey.stopEvents[index] || []).map(i => journey.events[i]);
}
export function journeyLetters(id) { return introductions.letters.filter(book => book.journey === id); }
export function placeLetters(place, id, index) {
  return introductions.letters.filter(book => book.journey === id && book.places.includes(place) &&
    (!book.stopIndexes || index === undefined || book.stopIndexes.includes(index)));
}
function sourceLinks(ids) {
  const links = element('p', undefined, 'study-sources');
  for (const id of [...new Set(ids)]) {
    const source = guide.sources[id];
    const a = element('a', `《${source.book}》第${source.message}篇`);
    a.href = source.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    if (source.title) a.title = source.title;
    links.append(a);
  }
  return links;
}
function pointCard(point) {
  const details = element('details', undefined, 'study-point');
  details.append(element('summary', point.title));
  const body = element('div', undefined, 'study-point-body');
  point.paragraphs.forEach(text => body.append(element('p', text)));
  body.append(sourceLinks(point.sources)); details.append(body);
  return details;
}
function appendPoints(container, journey, events) {
  const ids = [...new Set(events.flatMap(event => event.points))];
  if (!ids.length) return;
  container.append(element('h3', '職事內容與屬靈意義'));
  for (const index of ids) container.append(pointCard(journey.points[index]));
}
export function renderStopStudy(container, id, index) {
  container.replaceChildren();
  const events = stopEvents(id, index);
  appendPoints(container, studyJourney(id), events);
  container.hidden = !container.childElementCount;
}
export function appendVisitStudy(container, id, index) {
  appendPoints(container, studyJourney(id), stopEvents(id, index));
}
export function renderJourneyStudy(container, id) {
  const journey = studyJourney(id);
  container.replaceChildren();
  container.append(element('p', '依提供稿件整理；各項附書名與篇號。', 'study-note'));
  const points = element('details', undefined, 'study-section');
  points.append(element('summary', `職事內容與屬靈意義 · ${journey.points.length}項`));
  journey.points.forEach(point => points.append(pointCard(point)));
  const events = element('details', undefined, 'study-section');
  events.append(element('summary', `重要事件 · ${journey.events.length}筆`));
  for (const event of journey.events) {
    const card = element('article', undefined, 'study-event');
    const title = element('div', undefined, 'study-event-heading');
    title.append(element('strong', event.place), element('span', event.ref, 'reference'));
    card.append(title, element('p', event.text));
    appendPoints(card, journey, [event]); events.append(card);
  }
  container.append(points, events);
  if (journey.background.length) {
    const background = element('details', undefined, 'study-section');
    background.append(element('summary', '行程背景'));
    journey.background.forEach(text => background.append(element('p', text)));
    container.append(background);
  }
}
export function letterCard(book) {
  const card = element('details', undefined, 'letter-card'); card.dataset.book = book.id;
  const summary = element('summary');
  summary.append(element('strong', book.name), element('span', book.phase, 'letter-phase'));
  card.append(summary);
  const fields = element('dl', undefined, 'letter-fields');
  for (const [label, key] of [['著者','author'],['著時','date'],['著地','location'],['受者','recipients'],['主題','theme']]) {
    fields.append(element('dt', label), element('dd', book[key]));
  }
  card.append(fields);
  if (book.placeScope) card.append(element('p', book.placeScope, 'study-note'));
  if (book.id === 'hebrews') card.append(element('p', '依《新約聖經恢復本》書介的著者認定，列入保羅書信。', 'study-note'));
  return card;
}
export function renderLetters(container, books) {
  container.replaceChildren(); books.forEach(book => container.append(letterCard(book)));
}
export function renderStationLetters(container, place, id, index) {
  const books = placeLetters(place, id, index); container.replaceChildren(); container.hidden = !books.length;
  if (!books.length) return;
  container.append(element('h3', id === 4 ? '抵達羅馬後寫成的書信' : '本次行程在此地寫成的書信'));
  renderLetters(container.appendChild(element('div', undefined, 'letter-list')), books);
}
export function renderLetterLibrary(container, filter = 'all') {
  const books = introductions.letters.filter(book => filter === 'all' ||
    (filter === 'released' ? book.phase === '第一次被囚獲釋後' :
      filter === 'imprisoned' ? book.phase === '第二次被囚' : book.journey === Number(filter)));
  renderLetters(container, books);
}
