// SERVER-ONLY. Canonical answers live here and must never be imported by client code.
// A build check (scripts/check-bundle.mjs) fails if any answer appears in the client bundle.
import type { RoundAttribution } from '../../shared/protocol';
import type { Scene } from '../../shared/scenes';
import { attributionFor } from './attribution';

export interface ServerQuestion {
  id: string;
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
    { id: 'h1', kind: 'video', at: 0, transition: 'fade', media: { assetId: 'w6n2j8rd' }, credit: 'Tranh minh họa (không phải ảnh tư liệu)' },
    { id: 'h2', kind: 'text-card', at: 10_000, transition: 'slide', heading: 'Một buổi đi mua hàng', body: 'Có thứ chỉ cần tiền và xếp hàng. Có thứ — như gạo, đường, vải — còn cần thêm một tờ giấy.' },
    { id: 'h3', kind: 'video', at: 15_000, transition: 'fade', media: { assetId: 's9b4x1lf' }, credit: 'Ảnh: Myra Siason 2007 CC BY-SA 2.0 · sơ đồ minh họa' },
    { id: 'h4', kind: 'text-card', at: 21_000, transition: 'cut', heading: 'Theo tiêu chuẩn', body: 'Có loại phiếu cấp theo mức lương, chức vụ, cấp bậc lao động; có loại cấp theo độ tuổi.' },
    { id: 'h5', kind: 'text-card', at: 26_000, transition: 'fade', heading: 'Tờ giấy có giá như tiền', body: 'Tem phiếu được in, phát hành và quản lý theo nguyên tắc như tiền giấy. Hàng hóa không được tự do lưu thông giữa các địa phương.' },
    { id: 'h6', kind: 'video', at: 31_000, transition: 'slide', media: { assetId: 'g7m3t5ve' }, credit: 'Tranh minh họa (không phải ảnh tư liệu)' },
    { id: 'h7', kind: 'date', at: 36_000, transition: 'zoom', date: '1976 – 1986', label: 'Cả nước vận hành theo cùng một cơ chế kinh tế — ở miền Bắc, kinh tế kế hoạch đã có từ trước 1975' },
    { id: 'h8', kind: 'text-card', at: 41_000, transition: 'cut', heading: '17/6/1985 · Nghị quyết 25-NQ/TW', body: 'Chủ trương bãi bỏ tem phiếu; tại những nơi chưa đủ hàng, một số trường hợp vẫn tạm cấp sổ, phiếu theo quy định.' },
    { id: 'h9', kind: 'text-card', at: 45_000, transition: 'zoom', heading: 'Trích Báo cáo chính trị, Đại hội VI (12/1986)', body: '"…cơ chế tập trung quan liêu, ▢▢▢ ▢▢▢ về căn bản chưa bị xoá bỏ."' },
    { id: 'h10', kind: 'video', at: 50_000, transition: 'fade', durationMs: 10_000, media: { assetId: 'u2k8p6zn' }, credit: 'Ảnh: Myra Siason 2007 CC BY-SA 2.0 · tranh, sơ đồ minh họa' },
  ];
}

/**
 * PRODUCTION montage for question 3 (M3.2-C1). Generated from media/q3/manifest.json with
 * scripts/media/timeline-ts.mjs (the validator checks both are identical). Storyboard:
 * docs/content/Q03-HOP-TAC-XA.md (rev. 2) with documented deviations.
 */
function q3Montage(): Scene[] {
  return [
    { id: 'e1', kind: 'video', at: 0, transition: 'fade', media: { assetId: 'm4x9t2bh' }, credit: 'Ảnh: Adam Jones CC BY-SA 2.0' },
    { id: 'e2', kind: 'video', at: 5_000, transition: 'cut', media: { assetId: 'v7k3p8cd' }, credit: 'Đồ họa minh họa' },
    { id: 'e3', kind: 'video', at: 10_000, transition: 'slide', media: { assetId: 's2n6w9qf' }, credit: 'Bản đồ: Natural Earth · Ảnh: Chemical Engineer 2017 CC BY-SA 4.0' },
    { id: 'e4', kind: 'text-card', at: 16_000, transition: 'fade', heading: 'Người mua cũng là người chủ', body: 'Thành viên góp vốn, cùng sử dụng dịch vụ và cùng quyết định.' },
    { id: 'e5', kind: 'video', at: 20_000, transition: 'slide', media: { assetId: 'z5r1j7ta' }, credit: 'Đồ họa · căn cứ: Luật Doanh nghiệp (VBHN 67/2025), Luật năm 2023' },
    { id: 'e6', kind: 'video', at: 31_000, transition: 'fade', media: { assetId: 'l3g8u4yx' }, credit: 'Đồ họa minh họa (không phải ảnh tư liệu)' },
    { id: 'e7', kind: 'statistic', at: 35_000, transition: 'cut', label: 'hộ nông dân miền Bắc đã vào tổ chức này trong phong trào tập thể hóa nông nghiệp (cuối năm 1960)', value: 'hơn 80', unit: '%', source: 'Bộ NN&PTNT (dcrd.gov.vn): 85,8 %; Cổng TTĐT Chính phủ (chinhphu.vn): 84,8 %' },
    { id: 'e8', kind: 'text-card', at: 40_000, transition: 'cut', heading: 'Ngày nay — Luật năm 2023, Điều 61 (đại hội toàn thể)', body: 'Mỗi thành viên chính thức có một phiếu ngang nhau, không phụ thuộc vốn góp hay chức vụ.' },
    { id: 'e9', kind: 'text-card', at: 45_000, transition: 'zoom', heading: 'Luật số 17/2023/QH15', body: 'Luật ▢▢▢ ▢▢▢ ▢▢ — trên biển hiệu thường viết tắt: HTX' },
    { id: 'e10', kind: 'video', at: 50_000, transition: 'fade', durationMs: 10_000, media: { assetId: 'o9c5e2kn' }, credit: 'Ảnh: Adam Jones CC BY-SA 2.0; Windrain CC BY-SA 4.0' },
  ];
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
 * PRODUCTION montage for question 5 (M3.2-C2). Generated from media/q5/manifest.json with
 * scripts/media/timeline-ts.mjs (the validator checks both are identical). Storyboard:
 * docs/content/Q05-WTO.md (rev. 2) with documented deviations. The acronym, its expansions and
 * translations never appear during the round (the decisive card masks it); no emblem, no TTXVN photo,
 * and the Marrakesh photo q05-02 is replaced by a native graphic (attribution would name the answer).
 */
function q5Montage(): Scene[] {
  return [
    { id: 'f1', kind: 'video', at: 0, transition: 'fade', media: { assetId: 'h8w3n5rk' }, credit: 'Ảnh: J.-P. Dalbéra CC BY 2.0; P. Hughes CC BY 4.0' },
    { id: 'f2', kind: 'text-card', at: 5_000, transition: 'cut', heading: 'Mỗi lô hàng vượt biên giới', body: 'đều cần những luật chơi chung giữa các quốc gia.' },
    { id: 'f3', kind: 'date', at: 10_000, transition: 'slide', date: '30/10/1947', label: '23 bên ký một hiệp định chung về thuế quan và thương mại' },
    { id: 'f4', kind: 'video', at: 16_000, transition: 'fade', media: { assetId: 'p2f7d9xs' }, credit: 'Bản đồ: Natural Earth · đồ họa' },
    { id: 'f5', kind: 'date', at: 23_000, transition: 'zoom', date: '1/1/1995', label: 'Một tổ chức mới chính thức hoạt động — trụ sở tại Genève' },
    { id: 'f6', kind: 'date', at: 28_000, transition: 'cut', date: '4/1/1995', label: 'Đơn xin gia nhập của Việt Nam được tiếp nhận — chỉ vài ngày sau khi tổ chức ra đời' },
    { id: 'f7', kind: 'video', at: 33_000, transition: 'slide', media: { assetId: 'k4j6v1mt' }, credit: 'Đồ họa · nguồn: USTR (2006); Federal Register (2001); hồ sơ gia nhập' },
    { id: 'f8', kind: 'date', at: 39_000, transition: 'fade', date: '7/11/2006', label: 'Đại hội đồng của tổ chức chấp thuận cho Việt Nam gia nhập' },
    { id: 'f9', kind: 'text-card', at: 45_000, transition: 'zoom', heading: 'Trích thông cáo báo chí 7/11/2006 (đã che tên)', body: '"Viet Nam will become the ▢▢▢\'s 150th member…" — Việt Nam trở thành thành viên thứ 150 của ▢▢▢ ngày 11/1/2007.' },
    { id: 'f10', kind: 'video', at: 50_000, transition: 'fade', durationMs: 10_000, media: { assetId: 'r9e2y7gc' }, credit: 'Ảnh: J.-P. Dalbéra CC BY 2.0 · bản đồ: Natural Earth · đồ họa' },
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
  { id: 'q1', answer: 'BAO CẤP', scenes: q1Montage(), attribution: attributionFor('q1') },
  { id: 'q2', answer: 'CÁCH MẠNG THÁNG MƯỜI', scenes: q2Montage(), attribution: attributionFor('q2') },
  { id: 'q3', answer: 'HỢP TÁC XÃ', scenes: q3Montage(), attribution: attributionFor('q3') },
  { id: 'q4', answer: 'ĐỔI MỚI', scenes: q4Montage(), attribution: attributionFor('q4') },
  { id: 'q5', answer: 'WTO', scenes: q5Montage(), attribution: attributionFor('q5') },
  { id: 'q6', answer: 'PHÁT TRIỂN BỀN VỮNG', scenes: q6Montage(), attribution: attributionFor('q6') },
];
