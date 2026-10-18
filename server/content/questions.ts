// SERVER-ONLY. Canonical answers live here and must never be imported by client code.
// A build check (scripts/check-bundle.mjs) fails if any answer appears in the client bundle.
import type { Scene } from '../../shared/scenes';

export interface ServerQuestion {
  id: string;
  /** The single canonical answer. Matching is normalized; no synonyms are accepted. */
  answer: string;
  /** Full scene timeline, released to clients one scene at a time by the server. */
  scenes: Scene[];
}

/** M1: a neutral placeholder per question. Image/text/video scenes arrive in M2. */
function placeholder(n: number): Scene[] {
  return [{ id: `q${n}-intro`, kind: 'placeholder', at: 0, title: `Câu hỏi ${n}`, subtitle: 'Nội dung gợi ý sẽ xuất hiện tại đây' }];
}

export const QUESTIONS: readonly ServerQuestion[] = [
  { id: 'q1', answer: 'BAO CẤP', scenes: placeholder(1) },
  { id: 'q2', answer: 'CÁCH MẠNG THÁNG MƯỜI', scenes: placeholder(2) },
  { id: 'q3', answer: 'HỢP TÁC XÃ', scenes: placeholder(3) },
  { id: 'q4', answer: 'ĐỔI MỚI', scenes: placeholder(4) },
  { id: 'q5', answer: 'WTO', scenes: placeholder(5) },
  { id: 'q6', answer: 'PHÁT TRIỂN BỀN VỮNG', scenes: placeholder(6) },
];
