import test from 'node:test';
import assert from 'node:assert';
import { normalizeQuery, buildSearchIndex, searchIndex } from './settingsSearch.mjs';

test('normalizeQuery lowercases, collapses spaces and maps ё→е', () => {
  assert.strictEqual(normalizeQuery('  ТЁМА   Оформления '), 'тема оформления');
});

test('normalizeQuery handles null', () => {
  assert.strictEqual(normalizeQuery(null), '');
});

test('buildSearchIndex indexes tab labels', () => {
  const index = buildSearchIndex({
    tabMeta: [{ id: 'appearance', label: 'Внешний вид', kicker: 'Оформление' }],
    groups: {},
  });
  assert.ok(index.some((e) => e.title === 'Внешний вид'));
});

test('buildSearchIndex indexes groups without items (theme/accent)', () => {
  const index = buildSearchIndex({
    tabMeta: [{ id: 'appearance', label: 'Внешний вид' }],
    groups: { appearance: [{ id: 'theme', title: 'Тема', desc: 'Фон' }] },
  });
  assert.ok(index.some((e) => e.title === 'Тема'));
});

test('buildSearchIndex indexes items with their tab and anchor', () => {
  const index = buildSearchIndex({
    tabMeta: [{ id: 'appearance', label: 'Внешний вид' }],
    groups: { appearance: [{ id: 'shape', title: 'Форма', items: [{ key: 'roundness', title: 'Скругление', sub: 'Углы' }] }] },
  });
  const hit = index.find((e) => e.title === 'Скругление');
  assert.ok(hit);
  assert.strictEqual(hit.tab, 'appearance');
  assert.strictEqual(hit.anchor, 'shape');
});

test('buildSearchIndex indexes island tabs as nav entries', () => {
  const index = buildSearchIndex({
    tabMeta: [],
    groups: {},
    islandTabs: [{ id: 'player', label: 'Плеер', fixed: true }, { id: 'buffer', label: 'Буфер' }],
  });
  assert.ok(!index.some((e) => e.title.includes('Плеер')), 'fixed tab must not be indexed');
  assert.ok(index.some((e) => e.title.includes('Буфер')));
});

test('searchIndex finds a tab label by query', () => {
  const index = buildSearchIndex({
    tabMeta: [{ id: 'appearance', label: 'Внешний вид' }],
    groups: {},
  });
  const r = searchIndex(index, 'внешний');
  assert.ok(r.length >= 1);
});

test('searchIndex finds theme section by exact title', () => {
  const index = buildSearchIndex({
    tabMeta: [{ id: 'appearance', label: 'Внешний вид' }],
    groups: { appearance: [{ id: 'theme', title: 'Тема' }] },
  });
  const r = searchIndex(index, 'Тема');
  assert.ok(r.some((e) => e.title === 'Тема'));
});

test('searchIndex is tolerant to ё/е spelling', () => {
  const index = buildSearchIndex({
    tabMeta: [{ id: 'island', label: 'Остров' }],
    groups: { island: [{ id: 'x', title: 'Свёрнутый вид', items: [{ key: 'a', title: 'Ёмкость' }] }] },
  });
  const r = searchIndex(index, 'емкость');
  assert.ok(r.length >= 1);
});

test('buildSearchIndex indexes groups even when tabMeta omits the tab', () => {
  const index = buildSearchIndex({
    tabMeta: [],
    groups: { system: [{ id: 'startup', title: 'Запуск' }] },
  });
  assert.ok(index.some((e) => e.title === 'Запуск'));
});

test('searchIndex returns empty for empty query', () => {
  const index = buildSearchIndex({ tabMeta: [{ id: 'a', label: 'A' }], groups: {} });
  assert.deepStrictEqual(searchIndex(index, '   '), []);
});
