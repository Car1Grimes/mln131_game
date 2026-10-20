import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RoundReveal } from '../../shared/protocol';
import { RevealTable } from './RevealTable';

const LONG = 'Chi đoàn Kinh tế Chính trị Mác Lênin K67';
const reveal: RoundReveal = {
  roundId: 'round-q1-abcdef',
  questionNumber: 1,
  canonicalAnswer: 'BAO CẤP',
  submissions: [
    { teamId: 't1', teamName: LONG, answer: 'bao cấp', responseMs: 6400, orderRank: 1, correct: true, points: 50 },
    { teamId: 't5', teamName: 'Đội 5', answer: null, responseMs: null, orderRank: null, correct: false, points: 0 },
  ],
  standingsBefore: [],
  standingsAfter: [],
  attribution: null,
};

describe('RevealTable (M3.3-C mobile layout)', () => {
  const html = renderToStaticMarkup(<RevealTable reveal={reveal} />);
  const rows = html.split('<tr').slice(2);

  it('keeps six columns; the time column can be hidden on phones by class', () => {
    expect(html.match(/<th[ >]/g)).toHaveLength(6);
    expect(html).toContain('<th class="cell-time">Thời điểm</th>');
  });

  it('names sit in a truncatable span carrying the full name as a tooltip', () => {
    expect(rows[0]).toContain(`<span class="cell-name-text" title="${LONG}">${LONG}</span>`);
  });

  it('an answered row repeats its time under the answer (secondary on phones); a missing answer has no time', () => {
    expect(rows[0]).toContain('<span class="cell-time-sub">6,4 s</span>');
    expect(rows[0]).toContain('<td class="cell-time">6,4 s</td>');
    expect(rows[1]).not.toContain('cell-time-sub');
    expect(rows[1]).toContain('<td class="cell-time">—</td>');
  });

  it('points and result unchanged', () => {
    expect(rows[0]).toMatch(/<td>Đúng<\/td><td class="num">\+50<\/td>/);
    expect(rows[1]).toMatch(/<td>Không nộp<\/td><td class="num">0<\/td>/);
  });
});
