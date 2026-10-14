import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const menuPath = new URL('../../client/src/components/UpdatesMenu.tsx', import.meta.url);
const cssPath = new URL('../../client/src/styles.css', import.meta.url);
const rgb = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
const luminance = (values: number[]) => values.reduce((sum, value, i) => {
  const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  return sum + linear * [0.2126, 0.7152, 0.0722][i];
}, 0);
const contrast = (a: number[], b: number[]) => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};
const rule = (css: string, selector: string) => {
  const start = css.indexOf(selector + ' {');
  assert.ok(start >= 0, 'Missing CSS rule: ' + selector);
  const end = css.indexOf('}', start);
  return css.slice(start, end);
};
const color = (declarations: string) => {
  const hex = declarations.match(/(?:^|[;{])\s*color:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(hex, 'Missing explicit text color');
  return rgb(hex);
};

test('new habit tracker news is first, while notes and previous releases remain available', async () => {
  const menu = await readFile(menuPath, 'utf8');
  assert.match(menu, /LATEST_NEWS_ID = '2026-10-14-miniapp-habit-tracker'/);
  const dates = ['14 октября 2026', '12 октября 2026', '11 октября 2026', '8 октября 2026'];
  for (const date of dates) assert.ok(menu.includes(date), 'Missing date: ' + date);
  for (let i = 1; i < dates.length; i++) {
    assert.ok(menu.indexOf(dates[i - 1]) < menu.indexOf(dates[i]), 'News not in newest-first order');
  }
  for (const phrase of [
    'Привычки в Mini App: теперь с календарём и статистикой',
    'Календарь привычки по месяцам',
    'Ваш прогресс в цифрах',
    'Больше места для главного',
    'Личные заметки: всё важное в одном месте',
    'Создание и редактирование изображений',
    'Правки в Word и Excel', 'PNG, JPG или WebP',
    'DOCX или XLSX', 'Документы без ручного копирования'
  ]) {
    assert.ok(menu.includes(phrase), phrase);
  }
  assert.match(menu, /hasUnreadNews/);
  assert.doesNotMatch(menu, /text-fuchsia-300|text-cyan-300|text-violet-300/);
});

test('habit tracker announcement uses distinct backgrounds in both themes and shared news tags', async () => {
  const [menu, css] = await Promise.all([readFile(menuPath, 'utf8'), readFile(cssPath, 'utf8')]);
  assert.match(menu, /updates-lesson updates-news-latest updates-news-habits/);
  assert.match(menu, /updates-news-habits-feature/);
  assert.match(menu, /updates-news-tag--cyan/);
  for (const selector of [
    '.updates-news-habits',
    '.updates-news-habits-feature',
    "body[data-theme='dark'] .updates-news-habits",
    "body[data-theme='dark'] .updates-news-habits-feature"
  ]) {
    assert.match(rule(css, selector), /background:/);
    assert.match(rule(css, selector), /border-color:|border:/);
  }
});

test('all news badges have accessible light and dark text contrast', async () => {
  const css = await readFile(cssPath, 'utf8');
  const panel = rgb('#0f172a');
  for (const name of ['fuchsia', 'cyan', 'violet']) {
    const light = rule(css, '.updates-news-tag--' + name);
    const dark = rule(css, "body[data-theme='dark'] .updates-news-tag--" + name);
    const background = light.match(/background:\s*(#[0-9a-f]{6})/i)?.[1];
    assert.ok(background, name + ' missing light background');
    assert.ok(contrast(color(light), rgb(background)) >= 4.5, name + ' light theme contrast');
    const translucent = dark.match(/background:\s*rgba\((\d+),(\d+),(\d+),\s*([.\d]+)\)/);
    assert.ok(translucent, name + ' missing dark background');
    const alpha = Number(translucent[4]);
    const blended = [0,1,2].map(i => Number(translucent[i+1]) / 255 * alpha + panel[i] * (1 - alpha));
    assert.ok(contrast(color(dark), blended) >= 4.5, name + ' dark theme contrast');
    assert.match(rule(css, '.updates-news-date--' + name), /color:/);
    assert.match(rule(css, "body[data-theme='dark'] .updates-news-date--" + name), /color:/);
  }
  for (const name of ['image', 'office']) {
    assert.match(rule(css, '.updates-news-feature--' + name), /color:/);
    assert.match(rule(css, "body[data-theme='dark'] .updates-news-feature--" + name), /color:/);
  }
});
