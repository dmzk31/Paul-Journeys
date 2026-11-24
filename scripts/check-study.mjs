import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as study from '../assets/study.js';
const require = createRequire(import.meta.url);
// Pass an existing jsdom installation as the optional first argument.
const { JSDOM } = require(process.argv[2] || 'jsdom');
const read = name => JSON.parse(fs.readFileSync(new URL('../assets/data/'+name, import.meta.url), 'utf8'));
const guide = read('study-guide.json'), letters = read('letters.json'), atlas = read('journeys.json');
globalThis.document = new JSDOM('<!doctype html><html><body></body></html>').window.document;
study.configureStudy(guide, letters);
assert.equal(letters.letters.length, 14);
assert.equal(new Set(letters.letters.map(b=>b.id)).size, 14);
assert.deepEqual(letters.letters.map(b=>b.name), ['羅馬書','哥林多前書','哥林多後書','加拉太書','以弗所書','腓立比書','歌羅西書','帖撒羅尼迦前書','帖撒羅尼迦後書','提摩太前書','提摩太後書','提多書','腓利門書','希伯來書']);
assert.deepEqual([1,2,3,4].map(id=>study.journeyLetters(id).length), [0,3,3,4]);
for (const book of letters.letters) {
  for (const field of ['author','date','location','recipients','theme']) assert.ok(book[field]?.length, book.name+field);
  if (book.journey !== null) for (const place of book.places) assert.ok(atlas.journeys[book.journey-1].stops.some(s=>s.place===place));
}
assert.match(letters.letters.find(b=>b.id==='galatians').location, /^該是/);
assert.match(letters.letters.find(b=>b.id==='1-timothy').location, /^很可能/);
assert.match(letters.letters.find(b=>b.id==='hebrews').date, /^可能/);
assert.ok(letters.letters.filter(b=>['1-timothy','2-timothy','titus','hebrews'].includes(b.id)).every(b=>b.journey===null));
assert.deepEqual(study.placeLetters('Corinth',2,12).map(b=>b.name), ['加拉太書','帖撒羅尼迦前書','帖撒羅尼迦後書']);
assert.deepEqual(study.placeLetters('Corinth',3,5).map(b=>b.name), ['羅馬書']);
assert.equal(study.placeLetters('Miletus',3,10).length, 0, 'Hebrews must not be assigned to journey three');
assert.equal(study.placeLetters('Rome',4,13).length, 4, 'second imprisonment must stay separate');
assert.equal(study.placeLetters('Philippi',3,6).length, 0, 'do not assign 2 Corinthians to the return visit');
assert.equal(guide.journeys.reduce((n,j)=>n+j.events.length,0), 50);
assert.equal(guide.journeys.reduce((n,j)=>n+j.points.length,0), 19);
for (const journey of guide.journeys) {
  assert.equal(journey.stopEvents.length, atlas.journeys[journey.id-1].stops.length);
  journey.events.forEach((event,index) => {
    assert.ok(event.ref.startsWith('徒'));
    for (const point of event.points) assert.ok(journey.points[point]);
    for (const source of event.sources) assert.ok(guide.sources[source]);
    for (const stop of event.stops) assert.ok(journey.stopEvents[stop].includes(index));
  });
}
assert.equal(study.stopEvents(1,1).length, 0, 'Seleucia must not inherit Antioch departure');
assert.equal(study.stopEvents(1,3)[0].place, '帕弗');
assert.equal(study.stopEvents(1,8)[0].place, '特庇');
assert.equal(study.stopEvents(1,9)[0].place, '回訪各城');
const host = document.createElement('div');
study.renderJourneyStudy(host, 1);
assert.equal(host.querySelectorAll('.study-event').length, 10);
assert.equal(host.querySelectorAll('details[open]').length, 0, 'content must start collapsed');
study.renderLetterLibrary(host);
assert.equal(host.querySelectorAll('.letter-card').length, 14);
const hebrews = host.querySelector('[data-book="hebrews"]');
assert.ok(hebrews.textContent.includes('依《新約聖經恢復本》書介的著者認定'));
assert.equal(hebrews.querySelectorAll('dt').length, 5);
for (const [filter,count] of [['2',3],['3',3],['4',4],['released',3],['imprisoned',1]]) {
  study.renderLetterLibrary(host, filter); assert.equal(host.querySelectorAll('.letter-card').length, count);
}
study.renderStopStudy(host, 1, 9);
assert.ok(host.textContent.includes('回訪並堅固門徒'));
assert.ok(host.querySelector('a').href.includes('44_40.html'));
study.renderStopStudy(host, 1, 1); assert.ok(host.hidden);
study.renderStationLetters(host, 'Rome', 4, 13); assert.ok(!host.hidden); assert.equal(host.querySelectorAll('.letter-card').length,4);
console.log('PASS: 50 events, source links, visit bindings, 14 introductions, stage filters, tentative wording and collapsed DOM rendering.');
