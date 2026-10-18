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

/**
 * ENGINEERING PROTOTYPE (M2.1) for question 4 — not final content. Demonstrates every scene kind and
 * transition. Media ids refer to server/media/registry.ts. The statistic is a real, cited figure
 * (1.129 delegates; same figure in Báo Thái Bình and thitruongtaichinhtiente.vn). Production
 * content may never contain demo statistics: the engine rejects them.
 */
function q4Prototype(): Scene[] {
  return [
    {
      id: 's1',
      kind: 'image',
      at: 0,
      transition: 'fade',
      media: { assetId: 'm7k2p9xa' },
      caption: 'Một căn hộ ở Hà Nội thập niên 1980 (tái hiện tại bảo tàng)',
      credit: 'Ảnh: Rungbachduong · CC BY-SA 3.0',
    },
    {
      id: 's2',
      kind: 'text-card',
      at: 9_000,
      transition: 'slide',
      heading: 'Thập niên 1980',
      body: 'Hàng hoá khan hiếm, sản xuất trì trệ, giá cả tăng vọt. Nền kinh tế cần một lối thoát.',
    },
    { id: 's3', kind: 'date', at: 18_000, transition: 'zoom', date: '12/1986', label: 'Một kỳ Đại hội lịch sử tại Hà Nội' },
    { id: 's4', kind: 'image', at: 26_000, transition: 'fade', media: { assetId: 'm3q8v1ze' }, caption: 'Ảnh tư liệu', credit: 'TTXVN' },
    {
      id: 's5',
      kind: 'statistic',
      at: 34_000,
      transition: 'cut',
      value: '1.129',
      label: 'đại biểu dự Đại hội, thay mặt gần 1,9 triệu đảng viên',
      source: 'Tạp chí Quản lý nhà nước (quanlynhanuoc.vn), 21/01/2021',
    },
    {
      id: 's6',
      kind: 'video',
      at: 42_000,
      transition: 'slide',
      durationMs: 10_000,
      media: { assetId: 'v5n4c6tw' },
      credit: 'Dựng từ ảnh của Bahnfrend và Nathan.cima · CC BY-SA 4.0',
    },
  ];
}

export const QUESTIONS: readonly ServerQuestion[] = [
  { id: 'q1', answer: 'BAO CẤP', scenes: placeholder(1) },
  { id: 'q2', answer: 'CÁCH MẠNG THÁNG MƯỜI', scenes: placeholder(2) },
  { id: 'q3', answer: 'HỢP TÁC XÃ', scenes: placeholder(3) },
  { id: 'q4', answer: 'ĐỔI MỚI', scenes: q4Prototype() },
  { id: 'q5', answer: 'WTO', scenes: placeholder(5) },
  { id: 'q6', answer: 'PHÁT TRIỂN BỀN VỮNG', scenes: placeholder(6) },
];
