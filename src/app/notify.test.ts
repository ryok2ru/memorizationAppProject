import { describe, expect, it } from 'vitest';
import { buildNotifyPayload, buildShortcutUrl, needsRefresh, notifyTimeOnDay } from './notify';
import { DEFAULT_SETTINGS, type Word } from '../domain/types';
import { newCardFields } from '../domain/fsrs';
import { addDays } from '../domain/dates';

const now = new Date(2026, 8, 18, 21, 30, 0).getTime();
const mk = (id: string, due: number, state: 0 | 2 = 2): Word => ({
  id,
  folderId: 'f',
  englishTerm: id,
  japaneseDefinition: id,
  memo: '',
  createdAt: now,
  updatedAt: now,
  ...newCardFields(now),
  state,
  due,
});
const settings = { ...DEFAULT_SETTINGS, notifyEnabled: true, notifyTime: '08:00', notifyDays: 3 };

describe('buildNotifyPayload', () => {
  it('counts carried-over words per day and writes different bodies', () => {
    const words = [
      mk('overdue', addDays(now, -2)),
      mk('tomorrowMorning', notifyTimeOnDay(now, 1, '08:00') - 1000),
      mk('tomorrowAfternoon', notifyTimeOnDay(now, 1, '08:00') + 3600000), // 明日 9:00 → 2 日目から
      mk('day3', notifyTimeOnDay(now, 3, '08:00')),
      mk('new', now, 0), // New は数えない
      mk('far', addDays(now, 30)),
    ];
    const p = buildNotifyPayload(words, settings, now);
    expect(p.v).toBe(1);
    expect(p.list).toBe('VocaVault');
    expect(p.items).toEqual([
      { at: '2026-09-19 08:00', title: '今日は2語の復習があります' },
      { at: '2026-09-20 08:00', title: '復習が溜まっています。今日は3語' },
      { at: '2026-09-21 08:00', title: '復習が溜まっています。今日は4語' },
    ]);
  });

  it('omits days with zero and reflects notify time', () => {
    const words = [mk('a', notifyTimeOnDay(now, 2, '21:15'))];
    const p = buildNotifyPayload(words, { ...settings, notifyTime: '21:15' }, now);
    expect(p.items).toEqual([
      { at: '2026-09-20 21:15', title: '復習が溜まっています。今日は1語' },
      { at: '2026-09-21 21:15', title: '復習が溜まっています。今日は1語' },
    ]);
  });

  it('caps notifyDays at 30 and floors at 1', () => {
    const words = [mk('a', addDays(now, -1))];
    expect(buildNotifyPayload(words, { ...settings, notifyDays: 100 }, now).items).toHaveLength(30);
    expect(buildNotifyPayload(words, { ...settings, notifyDays: 0 }, now).items).toHaveLength(1);
  });

  it('returns empty items when nothing is due', () => {
    expect(buildNotifyPayload([mk('n', now, 0)], settings, now).items).toEqual([]);
  });
});

describe('buildShortcutUrl', () => {
  it('encodes the shortcut name and JSON', () => {
    const url = buildShortcutUrl({ v: 1, list: 'VocaVault', items: [{ at: '2026-09-19 08:00', title: '今日は1語の復習があります' }] });
    expect(url.startsWith('shortcuts://run-shortcut?name=' + encodeURIComponent('VocaVault通知') + '&input=text&text=')).toBe(true);
    const text = new URL(url).searchParams.get('text');
    expect(JSON.parse(text!)).toEqual({ v: 1, list: 'VocaVault', items: [{ at: '2026-09-19 08:00', title: '今日は1語の復習があります' }] });
    expect(url).not.toContain(' ');
    expect(url).not.toContain('"');
  });
});

describe('needsRefresh', () => {
  it('is true after 2 days', () => {
    expect(needsRefresh(null, now)).toBe(false);
    expect(needsRefresh(now - 86400000, now)).toBe(false);
    expect(needsRefresh(now - 2 * 86400000, now)).toBe(true);
  });
});
