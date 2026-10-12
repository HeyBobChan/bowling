// Validate the deployable multi-page site, catching missing game entry points,
// broken assets, and accidental replacement of the roster with the bowling game.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { games } = JSON.parse(readFileSync(resolve(root, 'games.json'), 'utf8'));
const output = resolve(root, 'dist');
const lobby = readFileSync(resolve(output, 'index.html'), 'utf8');
assert.equal((lobby.match(/class="game-card"/g) || []).length, games.length);
assert.ok(!lobby.includes('<!-- GAME_'), 'Unrendered roster placeholder');
assert.ok(!lobby.includes('<script'), 'The lobby should not load a game engine');
assert.equal(new Set(games.map((g) => g.page)).size, games.length, 'Duplicate game entry');
assert.equal(new Set(games.map((g) => g.id)).size, games.length, 'Duplicate game ID');

for (const game of games) {
  assert.notEqual(game.page, 'index.html', 'The index is reserved for the roster');
  assert.equal(game.path, `/${game.page}`);
  assert.ok(lobby.includes(`href="${game.path}"`), `Missing roster link: ${game.id}`);
  assert.ok(lobby.includes(`id="title-${game.id}"`), `Missing accessible title: ${game.id}`);
  const html = readFileSync(resolve(output, game.page), 'utf8');
  assert.ok(html.includes('class="game-home" href="/"'), `Missing return link: ${game.id}`);
  assert.ok(html.includes('<script type="module"'), `Missing game script: ${game.id}`);
}

for (const page of ['index.html', ...games.map((g) => g.page)]) {
  const html = readFileSync(resolve(output, page), 'utf8');
  for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"#?]*)"/g)) {
    assert.ok(existsSync(resolve(output, url === '/' ? 'index.html' : url.slice(1))), `${page}: missing ${url}`);
  }
}
console.log(`Site verified: roster, ${games.length} game pages, return links, and all HTML asset references.`);
