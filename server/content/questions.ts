// SERVER-ONLY. Canonical answers live here and must never be imported by client code.
// A build check (scripts/check-bundle.mjs) fails if any answer appears in the client bundle.
import type { RoundAttribution } from '../../shared/protocol';
import type { Scene } from '../../shared/scenes';
import { attributionFor } from './attribution';

export interface ServerQuestion {
  id: string;
  /** Enforce the eight-scene M4.2 authored contract, even when a test shortens the live deadline. */
  production?: boolean;
  /** The single canonical answer. Matching is normalized; no synonyms are accepted. */
  answer: string;
  /** Full scene timeline, released to clients one scene at a time by the server. */
  scenes: Scene[];
  /** Media credits revealed with the results (after the server closes the round). */
  attribution?: RoundAttribution;
}

/**
 * PRODUCTION montage for question 1 (M3.2-C3). Generated from media/q1/manifest.json with
 * scripts/media/timeline-ts.mjs (the validator checks both are identical). Storyboard:
 * docs/content/Q01-BAO-CAP.md (rev. 2) with documented deviations. No permission-restricted photo:
 * shop and coupon visuals are own illustrations credited as such; one CC BY-SA museum photo (2007).
 */
function q1Montage(): Scene[] {
  return [
    { id: 'h1', kind: 'video', at: 0, transition: 'fade', durationMs: 6_000, media: { assetId: 'w6n2j8rd' }, credit: 'Tranh minh họa (không phải ảnh tư liệu)' },
    { id: 'h3', kind: 'video', at: 6_000, transition: 'fade', durationMs: 6_000, media: { assetId: 's9b4x1lf' }, credit: 'Ảnh: Myra Siason 2007 CC BY-SA 2.0 · sơ đồ minh họa' },
    { id: 'h5', kind: 'text-card', at: 12_000, transition: 'cut', durationMs: 5_000, heading: 'Theo tiêu chuẩn', body: 'Phiếu theo lương, chức vụ, bậc lao động hoặc tuổi; hàng hóa bị hạn chế lưu thông.' },
    { id: 'h6', kind: 'video', at: 17_000, transition: 'slide', durationMs: 5_000, media: { assetId: 'g7m3t5ve' }, credit: 'Tranh minh họa (không phải ảnh tư liệu)' },
    { id: 'h7', kind: 'date', at: 22_000, transition: 'cut', durationMs: 4_000, date: '1976 – 1986', label: 'Cả nước; miền Bắc đã có kinh tế kế hoạch trước 1975.' },
    { id: 'h8', kind: 'text-card', at: 26_000, transition: 'cut', durationMs: 4_000, heading: '17/6/1985 · Nghị quyết 25-NQ/TW', body: 'Bỏ tem phiếu; nơi thiếu hàng, một số trường hợp vẫn tạm dùng sổ, phiếu.' },
    { id: 'h9', kind: 'text-card', at: 30_000, transition: 'cut', durationMs: 4_000, heading: 'Trích Báo cáo Đại hội VI · 1986', body: '"…cơ chế tập trung quan liêu, ▢▢▢ ▢▢▢…"' },
    { id: 'h10', kind: 'video', at: 34_000, transition: 'fade', durationMs: 6_000, media: { assetId: 'u2k8p6zn' }, credit: 'Ảnh: Myra Siason 2007 CC BY-SA 2.0 · tranh, sơ đồ minh họa' },
  ];
}

/**
 * PRODUCTION montage for question 3 (M3.2-C1). Generated from media/q3/manifest.json with
 * scripts/media/timeline-ts.mjs (the validator checks both are identical). Storyboard:
 * docs/content/Q03-HOP-TAC-XA.md (rev. 2) with documented deviations.
 */
function q3Montage(): Scene[] {
  return [
    { id: 'e1', kind: 'video', at: 0, transition: 'fade', durationMs: 5_000, media: { assetId: 'm4x9t2bh' }, credit: 'Ảnh: Adam Jones CC BY-SA 2.0' },
    { id: 'e2', kind: 'video', at: 5_000, transition: 'cut', durationMs: 5_000, media: { assetId: 'v7k3p8cd' }, credit: 'Đồ họa minh họa' },
    { id: 'e3', kind: 'video', at: 10_000, transition: 'slide', durationMs: 6_000, media: { assetId: 's2n6w9qf' }, credit: 'Bản đồ: Natural Earth · Ảnh: Chemical Engineer 2017 CC BY-SA 4.0' },
    { id: 'e5', kind: 'video', at: 16_000, transition: 'cut', durationMs: 6_000, media: { assetId: 'z5r1j7ta' }, credit: 'Đồ họa · căn cứ: Luật Doanh nghiệp (VBHN 67/2025); Luật năm 2023, Điều 61' },
    { id: 'e6', kind: 'video', at: 22_000, transition: 'cut', durationMs: 4_000, media: { assetId: 'l3g8u4yx' }, credit: 'Đồ họa minh họa (không phải ảnh tư liệu)' },
    { id: 'e7', kind: 'statistic', at: 26_000, transition: 'cut', durationMs: 4_000, label: 'hộ nông dân miền Bắc vào tổ chức này · cuối 1960', value: 'hơn 80', unit: '%', source: 'Bộ NN&PTNT; Cổng TTĐT Chính phủ' },
    { id: 'e9', kind: 'text-card', at: 30_000, transition: 'cut', durationMs: 4_000, heading: 'Luật số 17/2023/QH15', body: 'Luật ▢▢▢ ▢▢▢ ▢▢ · viết tắt: HTX' },
    { id: 'e10', kind: 'video', at: 34_000, transition: 'fade', durationMs: 6_000, media: { assetId: 'o9c5e2kn' }, credit: 'Ảnh: Adam Jones CC BY-SA 2.0; Windrain CC BY-SA 4.0' },
  ];
}

/**
 * PRODUCTION montage for question 4 (M3.2-B). Generated from media/q4/manifest.json with
 * scripts/media/timeline-ts.mjs (the validator checks both are identical). Storyboard:
 * docs/content/Q04-DOI-MOI.md (rev. 2). Replaces the M2.1 engineering prototype.
 */
function q4Montage(): Scene[] {
  return [
    { id: 'b1', kind: 'statistic', at: 0, transition: 'cut', durationMs: 4_000, label: 'Lạm phát · Việt Nam, 1986', value: '774,7', unit: '%', source: 'Báo cáo chính trị, Đại hội VIII (1996)' },
    { id: 'b2', kind: 'video', at: 4_000, transition: 'fade', durationMs: 6_000, media: { assetId: 'k5v8m7wn' }, credit: 'Ảnh: Rungbachduong CC BY-SA 3.0 (tái hiện, 2006)' },
    { id: 'b4', kind: 'video', at: 10_000, transition: 'fade', durationMs: 7_000, media: { assetId: 'f3t9m6ra' }, credit: 'Đồ họa · nguồn: văn kiện Đảng 1981 và 1985' },
    { id: 'b6', kind: 'date', at: 17_000, transition: 'cut', durationMs: 4_000, date: '15–18/12/1986', label: 'Đại hội VI của Đảng · Hà Nội' },
    { id: 'b7', kind: 'video', at: 21_000, transition: 'fade', durationMs: 6_000, media: { assetId: 'w7c2h4pj' }, credit: 'Đồ họa · số liệu: tư liệu văn kiện Đảng' },
    { id: 'b8', kind: 'statistic', at: 27_000, transition: 'cut', durationMs: 3_000, label: 'gạo xuất khẩu năm 1989', value: '1,4', unit: 'triệu tấn', source: 'Báo Nhân Dân; Tạp chí Công Thương' },
    { id: 'b9', kind: 'text-card', at: 30_000, transition: 'cut', durationMs: 4_000, heading: 'Trích Báo cáo Đại hội VI · 1986', body: '"…▢▢▢ ▢▢▢ tư duy."' },
    { id: 'b10', kind: 'video', at: 34_000, transition: 'fade', durationMs: 6_000, media: { assetId: 'n6d1x8zs' }, credit: 'Ảnh: Bahnfrend 2023, Nathan.cima 2022 · CC BY-SA 4.0' },
  ];
}

/**
 * PRODUCTION montage for question 5 (M3.2-C2). Generated from media/q5/manifest.json with
 * scripts/media/timeline-ts.mjs (the validator checks both are identical). Storyboard:
 * docs/content/Q05-WTO.md (rev. 2) with documented deviations. The acronym, its expansions and
 * translations never appear during the round (the decisive card masks it); no emblem, no TTXVN photo,
 * and the Marrakesh photo q05-02 is replaced by a native graphic (attribution would name the answer).
 */
function q5Montage(): Scene[] {
  return [
    { id: 'f1', kind: 'video', at: 0, transition: 'fade', durationMs: 5_000, media: { assetId: 'h8w3n5rk' }, credit: 'Ảnh: J.-P. Dalbéra CC BY 2.0; P. Hughes CC BY 4.0' },
    { id: 'f3', kind: 'date', at: 5_000, transition: 'cut', durationMs: 4_000, date: '30/10/1947', label: '23 bên ký hiệp định chung về thuế quan và thương mại' },
    { id: 'f4', kind: 'video', at: 9_000, transition: 'fade', durationMs: 7_000, media: { assetId: 'p2f7d9xs' }, credit: 'Bản đồ: Natural Earth · đồ họa' },
    { id: 'f5', kind: 'date', at: 16_000, transition: 'cut', durationMs: 4_000, date: '1/1/1995', label: 'Tổ chức mới hoạt động · trụ sở Genève' },
    { id: 'f6', kind: 'date', at: 20_000, transition: 'cut', durationMs: 4_000, date: '4/1/1995', label: 'Tiếp nhận đơn xin gia nhập của Việt Nam' },
    { id: 'f7', kind: 'video', at: 24_000, transition: 'slide', durationMs: 6_000, media: { assetId: 'k4j6v1mt' }, credit: 'Đồ họa · nguồn: USTR (2006); Federal Register (2001); hồ sơ gia nhập' },
    { id: 'f9', kind: 'text-card', at: 30_000, transition: 'cut', durationMs: 4_000, heading: 'Việt Nam · ▢▢▢', body: '7/11/2006: chấp thuận gia nhập.\n11/1/2007: thành viên thứ 150.' },
    { id: 'f10', kind: 'video', at: 34_000, transition: 'fade', durationMs: 6_000, media: { assetId: 'r9e2y7gc' }, credit: 'Ảnh: J.-P. Dalbéra CC BY 2.0 · bản đồ: Natural Earth · đồ họa' },
  ];
}

/**
 * PRODUCTION montage for question 6 (M3.2-B). Generated from media/q6/manifest.json.
 * Storyboard: docs/content/Q06-PHAT-TRIEN-BEN-VUNG.md (rev. 2) with documented deviations.
 */
function q6Montage(): Scene[] {
  return [
    { id: 'd1', kind: 'video', at: 0, transition: 'fade', durationMs: 5_000, media: { assetId: 'g2r7k9vb' }, credit: 'Ảnh: LeRoy Woodson, US EPA (phạm vi công cộng)' },
    { id: 'd2', kind: 'statistic', at: 5_000, transition: 'cut', durationMs: 4_000, label: 'GDP/người Việt Nam · 1986 → 2025 · giá hiện hành', value: '< 500 → 5.066', unit: 'USD', source: 'World Bank, Vietnam Overview · 19/10/2026' },
    { id: 'd3', kind: 'video', at: 9_000, transition: 'slide', durationMs: 6_000, media: { assetId: 'y4m1t6qe' }, credit: 'Ảnh: Rudolph A. Furtado (phạm vi công cộng)' },
    { id: 'd5', kind: 'video', at: 15_000, transition: 'fade', durationMs: 6_000, media: { assetId: 'u8s3n5ck' }, credit: 'Ảnh: S. Koppehel CC BY 4.0; Tycho CC BY-SA 3.0' },
    { id: 'd6', kind: 'video', at: 21_000, transition: 'zoom', durationMs: 5_000, media: { assetId: 'j9p4w2fd' }, credit: 'Đồ họa · ảnh nền: Woodson, Furtado, Tycho CC BY-SA 3.0' },
    { id: 'd7', kind: 'text-card', at: 26_000, transition: 'cut', durationMs: 4_000, heading: '1987 · Tương lai chung của chúng ta', body: 'Đáp ứng nhu cầu hôm nay, không làm tổn hại nhu cầu thế hệ mai sau.' },
    { id: 'd9', kind: 'text-card', at: 30_000, transition: 'cut', durationMs: 4_000, heading: 'Việt Nam · 10/5/2017 · QĐ 622/QĐ-TTg', body: 'Kế hoạch hành động quốc gia · Nghị sự 2030\n▢▢▢▢ ▢▢▢▢▢ ▢▢▢ ▢▢▢▢' },
    { id: 'd10', kind: 'video', at: 34_000, transition: 'fade', durationMs: 6_000, media: { assetId: 'e1h6z3lm' }, credit: 'Ảnh: Woodson, Furtado, Tycho CC BY-SA 3.0 · đồ họa' },
  ];
}

/**
 * PRODUCTION montage for question 2 (M3.2 pilot). Generated from media/q2/manifest.json — edit the
 * manifest and keep this in sync (scripts/media/validate-media.mjs checks both are identical).
 * Storyboard: docs/content/Q02-CACH-MANG-THANG-MUOI.md (rev. 2). Sources and licences:
 * media/sources.json. Every Russian date is labelled lịch cũ / lịch mới; the decisive clue is the
 * native date at 30 s; the 34–40 s clip only recaps material released earlier (plus the 1957 stamp).
 */
function q2Montage(): Scene[] {
  return [
    { id: 'a1', kind: 'video', at: 0, transition: 'fade', durationMs: 5_000, media: { assetId: 'r4t8k1mz' }, credit: 'Ảnh in trong sách của S. Jones, London 1917' },
    { id: 'a2', kind: 'date', at: 5_000, transition: 'cut', durationMs: 3_000, date: '1917', label: 'Năm thứ tư của Chiến tranh thế giới' },
    { id: 'a3', kind: 'video', at: 8_000, transition: 'fade', durationMs: 6_000, media: { assetId: 'p9w2c6xe' }, credit: 'Đồ họa · nền: ảnh trong sách S. Jones, 1917' },
    { id: 'a5', kind: 'text-card', at: 14_000, transition: 'cut', durationMs: 6_000, heading: 'Petrograd, 1917 · lịch cũ', body: 'Tháng Hai: Sa hoàng sụp đổ. Tháng Bảy: súng nổ trên phố. Còn một lần nữa…' },
    { id: 'a6', kind: 'date', at: 20_000, transition: 'cut', durationMs: 4_000, date: '6–7/11/1917', label: 'Lịch mới · đêm khởi nghĩa ở Petrograd' },
    { id: 'a7', kind: 'video', at: 24_000, transition: 'slide', durationMs: 6_000, media: { assetId: 'b8j1f4vu' }, credit: 'Ảnh: Florstein 2013 CC BY-SA 4.0; Steinberg · bản đồ Natural Earth' },
    { id: 'a9', kind: 'date', at: 30_000, transition: 'cut', durationMs: 4_000, date: '25/10/1917', label: 'Lịch cũ · khởi nghĩa mang tên tháng này' },
    { id: 'a10', kind: 'video', at: 34_000, transition: 'fade', durationMs: 6_000, media: { assetId: 'x2m6s9ka' }, credit: 'Ảnh: Jones, Bulla, Steinberg; tem Liên Xô 1957' },
  ];
}

export const QUESTIONS: readonly ServerQuestion[] = [
  { production: true, id: 'q1', answer: 'BAO CẤP', scenes: q1Montage(), attribution: attributionFor('q1') },
  { production: true, id: 'q2', answer: 'CÁCH MẠNG THÁNG MƯỜI', scenes: q2Montage(), attribution: attributionFor('q2') },
  { production: true, id: 'q3', answer: 'HỢP TÁC XÃ', scenes: q3Montage(), attribution: attributionFor('q3') },
  { production: true, id: 'q4', answer: 'ĐỔI MỚI', scenes: q4Montage(), attribution: attributionFor('q4') },
  { production: true, id: 'q5', answer: 'WTO', scenes: q5Montage(), attribution: attributionFor('q5') },
  { production: true, id: 'q6', answer: 'PHÁT TRIỂN BỀN VỮNG', scenes: q6Montage(), attribution: attributionFor('q6') },
];
