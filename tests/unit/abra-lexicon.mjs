import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, finalize, skeleton, collisions, byWord, SPECIALS, COLORS } from '../../src/abra/lexicon.js';
import { WORDS } from '../../src/abra/words-data.js';

const one = (text) => { const r = parse(text); assert.equal(r.actions.length, 1, `${text}: ${JSON.stringify(r.actions.map((a) => a.kind))}`); return r.actions[0]; };

test('a word, its plural, and a counted, coloured, sized phrase', () => {
  assert.deepEqual([one('כלב').kind, one('כלב').word, one('כלב').count], ['noun', 'כלב', 1]);
  assert.equal(one('כלבים').count, 3);
  const three = one('שלושה כלבים כחולים');
  assert.deepEqual([three.word, three.count, three.colorId], ['כלב', 3, 'blue']);
  const big = one('כלב כחול ענק');
  assert.deepEqual([big.colorId, big.scale], ['blue', 2.2]);
  assert.equal(one('חתול צבעוני').rainbow, true);
  assert.equal(one('מיליון נמלים').count, 24);
  assert.equal(parse('כלב וחתול').actions.length, 2);
});

test('spelling is forgiven and quietly put right on the line', () => {
  assert.equal(parse('שלומ').shown, 'שלום');                     // final letters
  assert.equal(parse('צפור').shown, 'ציפור');                    // a missing helper yod
  assert.equal(one('צפור').word, 'ציפור');
  assert.equal(one('הכלב').word, 'כלב');                         // the definite article
  assert.equal(one('פרפרים').count, 3);                          // a plural nobody listed
  assert.equal(finalize(skeleton('ךלב םים')), 'כלב מים');
});

test('words the page does not know become names, and אני makes anything a name', () => {
  assert.deepEqual([one('גבריאל').kind, one('גבריאל').text], ['name', 'גבריאל']);
  assert.equal(one('חיים').kind, 'name');                        // not "three animals"
  const me = one('אני זאב');
  assert.deepEqual([me.kind, me.text, me.me], ['name', 'זאב', true]);
  assert.equal(one('אני').id, 'me');
});

test('phrases, magic words and bare modifiers', () => {
  assert.equal(one('איש שלג').word, 'איש שלג');
  for (const [text, id] of [['יום הולדת', 'birthday'], ['אברא כדברא', 'abra'], ['לילה טוב', 'goodnight'], ['לילה', 'night'], ['דף חדש', 'clear'], ['לא', 'no'], ['סוף', 'bye'], ['קשת בענן', 'rainbow']]) assert.equal(one(text).id, id, text);
  assert.equal(one('עננים').count, 3);
  assert.deepEqual([one('כחול').kind, one('כחול').colorId], ['modify', 'blue']);
  assert.equal(one('חמישה').count, 5);
  assert.deepEqual(parse('').actions, []);
  assert.deepEqual(parse('abc 123 !?').actions, []);
});

test('the dictionary is sound: one meaning per spelling, Hebrew only, likes that exist', () => {
  assert.deepEqual(collisions, []);
  const hebrew = /^[א-ת]+( [א-ת]+)*$/u;
  const kinds = new Set(['walk', 'person', 'fly', 'swim', 'float', 'drive', 'plant', 'food', 'thing', 'building', 'sky']);
  for (const e of WORDS) {
    for (const form of [e.w, e.pl, ...(e.alt || [])].filter(Boolean)) assert.match(form, hebrew, form);
    assert.ok(kinds.has(e.k), `${e.w}: ${e.k}`);
    assert.ok(e.s >= 0.3 && e.s <= 3.2, `${e.w}: ${e.s}`);
    for (const liked of e.likes || []) assert.ok(byWord.has(liked), `${e.w} likes ${liked}`);
    assert.equal(one(e.w).word, e.w, e.w);                       // every word finds itself
  }
  assert.ok(WORDS.length > 400);
  assert.equal(new Set(SPECIALS.map((s) => s.id)).size, SPECIALS.length);
  assert.equal(new Set(COLORS.map((c) => c.id)).size, COLORS.length);
});
