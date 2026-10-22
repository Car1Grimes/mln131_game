import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { IntroView } from '../../shared/protocol';
import { QuestionIntro, QuestionPrompt } from './QuestionIntro';

const intro: IntroView = { questionNumber: 2, totalQuestions: 6, prompt: 'Đây là sự kiện lịch sử nào?', introStartedAt: 10_000, startsAt: 15_000 };
const seconds = (now: number) => renderToStaticMarkup(<QuestionIntro intro={intro} serverNow={now} />).match(/data-seconds="(\d)"/)![1];

describe('QuestionIntro', () => {
  it('shows number, preparation label and orientation question; no answer form or clue', () => {
    const html = renderToStaticMarkup(<QuestionIntro intro={intro} serverNow={10_000} />);
    expect(html).toContain('Chuẩn bị');
    expect(html).toContain('<strong>2</strong>');
    expect(html).toContain('Đây là sự kiện lịch sử nào?');
    expect(html).not.toMatch(/<input|<form|<video|<img/);
  });

  it('counts 5 → 1 from the server times; a late joiner sees the remaining seconds', () => {
    expect(seconds(10_000)).toBe('5');
    expect(seconds(10_999)).toBe('5');
    expect(seconds(11_000)).toBe('4');
    expect(seconds(13_500)).toBe('2'); // joined 3.5 s late: never restarts at 5
    expect(seconds(14_001)).toBe('1');
    expect(seconds(15_400)).toBe('1'); // waiting for the server's active view: never 0 or negative
    expect(seconds(9_000)).toBe('5'); // a client clock slightly behind is clamped
  });

  it('the prompt banner renders the text only when present', () => {
    expect(renderToStaticMarkup(<QuestionPrompt prompt="" />)).toBe('');
    expect(renderToStaticMarkup(<QuestionPrompt prompt="Câu hỏi?" />)).toContain('data-testid="question-prompt"');
  });
});
