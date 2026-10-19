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

/**
 * PRODUCTION montage for question 2 (M3.2 pilot). Generated from media/q2/manifest.json — edit the
 * manifest and keep this in sync (scripts/media/validate-media.mjs checks both are identical).
 * Storyboard: docs/content/Q02-CACH-MANG-THANG-MUOI.md (rev. 2). Sources and licences:
 * media/sources.json. Every Russian date is labelled lịch cũ / lịch mới; the decisive clue is the
 * native date at 45 s; the 50–60 s clip only recaps material released earlier (plus the 1957 stamp).
 */
function q2Montage(): Scene[] {
  return [
    { id: 'a1', kind: 'video', at: 0, transition: 'fade', media: { assetId: 'r4t8k1mz' }, credit: 'Ảnh in trong sách của S. Jones, London 1917' },
    { id: 'a2', kind: 'date', at: 5_000, transition: 'cut', date: '1917', label: 'Chiến tranh thế giới đang ở năm thứ tư' },
    { id: 'a3', kind: 'video', at: 10_000, transition: 'fade', media: { assetId: 'p9w2c6xe' }, credit: 'Đồ họa · nền: ảnh trong sách S. Jones, 1917' },
    { id: 'a4', kind: 'video', at: 16_000, transition: 'slide', media: { assetId: 'h3n7d5qy' }, credit: 'Ảnh: K. Bulla/Museovirasto CC BY 4.0; V. Bulla' },
    { id: 'a5', kind: 'text-card', at: 22_000, transition: 'fade', heading: 'Petrograd, 1917 (theo lịch cũ)', body: 'Tháng Hai: Sa hoàng sụp đổ. Tháng Bảy: súng nổ trên phố. Còn một lần nữa…' },
    { id: 'a6', kind: 'date', at: 27_000, transition: 'zoom', date: '6–7/11/1917', label: 'Theo lịch mới · một đêm khởi nghĩa ở Petrograd' },
    { id: 'a7', kind: 'video', at: 33_000, transition: 'slide', media: { assetId: 'b8j1f4vu' }, credit: 'Ảnh: Florstein 2013 CC BY-SA 4.0; Steinberg · bản đồ Natural Earth' },
    { id: 'a8', kind: 'text-card', at: 39_000, transition: 'cut', heading: '26/10/1917 (lịch cũ) = 8/11 (lịch mới)', body: 'Hai sắc lệnh đầu tiên của chính quyền mới: Sắc lệnh về hòa bình, Sắc lệnh về ruộng đất.' },
    { id: 'a9', kind: 'date', at: 45_000, transition: 'zoom', date: '25/10/1917', label: 'Ngày khởi nghĩa theo lịch Nga thời đó — sự kiện mang tên tháng này' },
    { id: 'a10', kind: 'video', at: 50_000, transition: 'fade', durationMs: 10_000, media: { assetId: 'x2m6s9ka' }, credit: 'Ảnh: Jones, Bulla, Steinberg; tem Liên Xô 1957' },
  ];
}

export const QUESTIONS: readonly ServerQuestion[] = [
  { id: 'q1', answer: 'BAO CẤP', scenes: placeholder(1) },
  { id: 'q2', answer: 'CÁCH MẠNG THÁNG MƯỜI', scenes: q2Montage() },
  { id: 'q3', answer: 'HỢP TÁC XÃ', scenes: placeholder(3) },
  { id: 'q4', answer: 'ĐỔI MỚI', scenes: q4Prototype() },
  { id: 'q5', answer: 'WTO', scenes: placeholder(5) },
  { id: 'q6', answer: 'PHÁT TRIỂN BỀN VỮNG', scenes: placeholder(6) },
];
