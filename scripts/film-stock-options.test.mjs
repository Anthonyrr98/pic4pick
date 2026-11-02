import assert from 'node:assert/strict';
import test from 'node:test';
import { collectFilmStockOptions } from '../src/utils/filmStockOptions.js';

test('film-stock history includes saved photos and legacy tags without duplicates', () => {
  assert.deepEqual(collectFilmStockOptions([
    { filmStock: 'Fuji C200' },
    { film_stock: 'Kodak Gold 200' },
    { tags: '旅行, film_stock:FUJIFILM SIMPLE ACE 400' },
    { tags: ['街头', 'FILM_STOCK:Kodak Portra 400'] },
    '  fuji c200 ', '', null, { filmStock: 42 },
  ]), ['Fuji C200', 'Kodak Gold 200', 'FUJIFILM SIMPLE ACE 400', 'Kodak Portra 400']);
});

test('invalid stored history does not prevent opening the form', () => {
  for (const value of [null, 'not an array', {}, 42]) {
    assert.deepEqual(collectFilmStockOptions(value), []);
  }
});
