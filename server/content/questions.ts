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
 * PRODUCTION montage for question 4 (M3.2-B). Generated from media/q4/manifest.json with
 * scripts/media/timeline-ts.mjs (the validator checks both are identical). Storyboard:
 * docs/content/Q04-DOI-MOI.md (rev. 2). Replaces the M2.1 engineering prototype.
 */
function q4Montage(): Scene[] {
  return [
    { id: 'b1', kind: 'statistic', at: 0, transition: 'fade', label: 'Lạm phát trong một năm', value: '774,7', unit: '%', source: 'Báo cáo chính trị, Văn kiện Đại hội VIII (1996)' },
    { id: 'b2', kind: 'video', at: 5_000, transition: 'fade', media: { assetId: 'k5v8m7wn' }, credit: 'Ảnh: Rungbachduong CC BY-SA 3.0 (tái hiện, 2006)' },
    { id: 'b3', kind: 'text-card', at: 11_000, transition: 'slide', heading: 'Việt Nam, 1986', body: 'Lạm phát ba chữ số. Hàng hóa khan hiếm. Cuộc điều chỉnh giá – lương – tiền năm 1985 không thành công.' },
    { id: 'b4', kind: 'video', at: 16_000, transition: 'fade', media: { assetId: 'f3t9m6ra' }, credit: 'Đồ họa · nguồn: văn kiện Đảng 1981 và 1985' },
    { id: 'b5', kind: 'text-card', at: 23_000, transition: 'fade', heading: 'Một thông điệp, cuối năm 1986', body: '"…nhìn thẳng vào sự thật, đánh giá đúng sự thật, nói rõ sự thật."' },
    { id: 'b6', kind: 'date', at: 28_000, transition: 'zoom', date: '15–18/12/1986', label: 'Hà Nội · Đại hội đại biểu toàn quốc lần thứ VI của Đảng' },
    { id: 'b7', kind: 'video', at: 33_000, transition: 'fade', media: { assetId: 'w7c2h4pj' }, credit: 'Đồ họa · số liệu: tư liệu văn kiện Đảng' },
    { id: 'b8', kind: 'statistic', at: 39_000, transition: 'cut', label: 'gạo xuất khẩu năm 1989', value: '1,4', unit: 'triệu tấn', source: 'Báo Nhân Dân; Tạp chí Công Thương' },
    { id: 'b9', kind: 'text-card', at: 45_000, transition: 'zoom', heading: 'Báo cáo chính trị tại Đại hội VI (1986)', body: '"…Đảng ta trước hết phải thay đổi nhận thức, ▢▢▢ ▢▢▢ tư duy."' },
    { id: 'b10', kind: 'video', at: 50_000, transition: 'fade', durationMs: 10_000, media: { assetId: 'n6d1x8zs' }, credit: 'Ảnh: Bahnfrend 2023, Nathan.cima 2022 · CC BY-SA 4.0' },
  ];
}

/**
 * PRODUCTION montage for question 6 (M3.2-B). Generated from media/q6/manifest.json.
 * Storyboard: docs/content/Q06-PHAT-TRIEN-BEN-VUNG.md (rev. 2) with documented deviations.
 */
function q6Montage(): Scene[] {
  return [
    { id: 'd1', kind: 'video', at: 0, transition: 'fade', media: { assetId: 'g2r7k9vb' }, credit: 'Ảnh: LeRoy Woodson, US EPA (phạm vi công cộng)' },
    { id: 'd2', kind: 'statistic', at: 5_000, transition: 'cut', label: 'GDP bình quân đầu người của Việt Nam, 1986 → 2025 (USD theo giá hiện hành)', value: '< 500 → 5.066', unit: 'USD', source: 'World Bank, Vietnam Overview — truy cập 19/10/2026' },
    { id: 'd3', kind: 'video', at: 10_000, transition: 'slide', media: { assetId: 'y4m1t6qe' }, credit: 'Ảnh: Rudolph A. Furtado (phạm vi công cộng)' },
    { id: 'd4', kind: 'statistic', at: 16_000, transition: 'cut', label: 'Tỷ lệ nghèo cùng cực ở Việt Nam (dưới 4,20 USD/người/ngày), 2010 → 2025', value: '14 % → < 4 %', source: 'World Bank, Vietnam Overview — truy cập 19/10/2026' },
    { id: 'd5', kind: 'video', at: 21_000, transition: 'fade', media: { assetId: 'u8s3n5ck' }, credit: 'Ảnh: S. Koppehel CC BY 4.0; Tycho CC BY-SA 3.0' },
    { id: 'd6', kind: 'video', at: 27_000, transition: 'zoom', media: { assetId: 'j9p4w2fd' }, credit: 'Đồ họa · ảnh nền: Woodson, Furtado, Tycho CC BY-SA 3.0' },
    { id: 'd7', kind: 'text-card', at: 32_000, transition: 'fade', heading: '1987 · Báo cáo "Tương lai chung của chúng ta"', body: 'Đáp ứng nhu cầu của hiện tại mà không làm tổn hại khả năng của các thế hệ tương lai trong việc đáp ứng nhu cầu của họ.' },
    { id: 'd8', kind: 'text-card', at: 38_000, transition: 'slide', heading: 'Liên Hợp Quốc, 25/9/2015 — Chương trình nghị sự 2030', body: 'Kinh tế, xã hội, môi trường: thực hiện cân bằng và tích hợp. 17 mục tiêu, 169 chỉ tiêu.' },
    { id: 'd9', kind: 'text-card', at: 45_000, transition: 'zoom', heading: 'Việt Nam, 10/5/2017 · Quyết định 622/QĐ-TTg', body: 'Kế hoạch hành động quốc gia thực hiện Chương trình nghị sự 2030 vì sự ▢▢▢▢ ▢▢▢▢▢ ▢▢▢ ▢▢▢▢' },
    { id: 'd10', kind: 'video', at: 50_000, transition: 'fade', durationMs: 10_000, media: { assetId: 'e1h6z3lm' }, credit: 'Ảnh: Woodson, Furtado, Tycho CC BY-SA 3.0 · đồ họa' },
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
  { id: 'q4', answer: 'ĐỔI MỚI', scenes: q4Montage() },
  { id: 'q5', answer: 'WTO', scenes: placeholder(5) },
  { id: 'q6', answer: 'PHÁT TRIỂN BỀN VỮNG', scenes: q6Montage() },
];
