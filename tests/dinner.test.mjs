// 夕飯の献立（lib/dinner.js）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysFrom, addDaysYmd, cleanDish, dishKey, menuMap, weekMenu, sortDishes, hasDish, nextOrder, menuRecord, DISH_MAX } from '../lib/dinner.js';

test('日付：7日ぶん（月・年をまたぐ）', () => {
  assert.deepEqual(daysFrom('2026-12-29', 7), ['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04']);
  assert.equal(addDaysYmd('2026-03-01', -1), '2026-02-28');
});
test('メニュー名：空白をそろえ、40文字まで。同じメニューの見分け', () => {
  assert.equal(cleanDish('　カレー  ライス '), 'カレー ライス');
  assert.equal(cleanDish('あ'.repeat(50)).length, DISH_MAX);
  assert.equal(cleanDish(null), '');
  assert.equal(dishKey('カレー ライス'), dishKey('カレーライス'));
  assert.equal(dishKey('ＣＵＲＲＹ'), dishKey('curry'));
  assert.ok(hasDish([{ name: 'カレーライス' }], ' カレー ライス'));
  assert.ok(!hasDish([{ name: 'カレー' }], 'すし'));
});
test('献立：1週間の表（未定もふくむ）・形のおかしいものは捨てる', () => {
  const m = menuMap([{ date: '2026-11-10', dish: 'カレー' }, { date: 'x', dish: 'すし' }, { date: '2026-11-12', dish: '  ' }, null]);
  assert.deepEqual(m, { '2026-11-10': 'カレー' });
  const w = weekMenu(m, '2026-11-10');
  assert.equal(w.length, 7); assert.deepEqual(w[0], { date: '2026-11-10', dish: 'カレー' }); assert.equal(w[1].dish, '');
});
test('メニュー一覧：並び・次の番号・保存データ', () => {
  assert.deepEqual(sortDishes([{ name: 'b', order: 2 }, { name: 'a', order: 1 }, { name: '' }]).map((x) => x.name), ['a', 'b']);
  assert.equal(nextOrder([]), 0); assert.equal(nextOrder([{ order: 3 }, { order: 1 }]), 4); assert.equal(nextOrder([{ order: 9999 }]), 9999);
  assert.deepEqual(menuRecord('2026-11-10', ' カレー '), { date: '2026-11-10', dish: 'カレー' });
});
