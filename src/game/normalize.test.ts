import { describe, expect, it } from 'vitest';
import { answerLetterGroups, isCorrectAnswer, normalizeAnswer } from './normalize';
import { QUESTIONS } from '../content/questions';

describe('normalizeAnswer', () => {
  it('removes Vietnamese diacritics and lowercases', () => {
    expect(normalizeAnswer('BAO CẤP')).toBe('baocap');
    expect(normalizeAnswer('Cách Mạng Tháng Mười')).toBe('cachmangthangmuoi');
    expect(normalizeAnswer('PHÁT TRIỂN BỀN VỮNG')).toBe('phattrienbenvung');
  });

  it('maps đ and Đ to d', () => {
    expect(normalizeAnswer('ĐỔI MỚI')).toBe('doimoi');
    expect(normalizeAnswer('đổi mới')).toBe('doimoi');
  });

  it('ignores whitespace, punctuation, underscores and hyphens', () => {
    expect(normalizeAnswer('  hợp_tác - xã!! ')).toBe('hoptacxa');
    expect(normalizeAnswer('W.T.O.')).toBe('wto');
    expect(normalizeAnswer('bao\tcấp\n')).toBe('baocap');
  });

  it('treats decomposed (NFD) input the same as precomposed', () => {
    expect(normalizeAnswer('BAO CẤP'.normalize('NFD'))).toBe('baocap');
  });
});

describe('isCorrectAnswer', () => {
  it('accepts normalized variants of the canonical answer', () => {
    expect(isCorrectAnswer('bao cap', 'BAO CẤP')).toBe(true);
    expect(isCorrectAnswer('BAOCAP', 'BAO CẤP')).toBe(true);
    expect(isCorrectAnswer('doi-moi', 'ĐỔI MỚI')).toBe(true);
    expect(isCorrectAnswer('w t o', 'WTO')).toBe(true);
    expect(isCorrectAnswer('cach mang thang muoi', 'CÁCH MẠNG THÁNG MƯỜI')).toBe(true);
  });

  it('rejects synonyms, alternative words and partial answers', () => {
    expect(isCorrectAnswer('Tổ chức Thương mại Thế giới', 'WTO')).toBe(false);
    expect(isCorrectAnswer('Cách mạng Nga', 'CÁCH MẠNG THÁNG MƯỜI')).toBe(false);
    expect(isCorrectAnswer('hợp tác', 'HỢP TÁC XÃ')).toBe(false);
    expect(isCorrectAnswer('phát triển', 'PHÁT TRIỂN BỀN VỮNG')).toBe(false);
  });

  it('rejects empty or punctuation-only input', () => {
    expect(isCorrectAnswer('', 'WTO')).toBe(false);
    expect(isCorrectAnswer(' - _ ', 'WTO')).toBe(false);
  });

  it('every canonical answer matches itself', () => {
    for (const q of QUESTIONS) expect(isCorrectAnswer(q.answer, q.answer)).toBe(true);
  });
});

describe('answerLetterGroups', () => {
  it('groups letters by word and keeps diacritics for display', () => {
    expect(answerLetterGroups('BAO CẤP')).toEqual([['B', 'A', 'O'], ['C', 'Ấ', 'P']]);
    expect(answerLetterGroups('WTO')).toEqual([['W', 'T', 'O']]);
  });

  it('drops punctuation and empty words', () => {
    expect(answerLetterGroups(' A-B , C ')).toEqual([['A', 'B'], ['C']]);
  });
});
