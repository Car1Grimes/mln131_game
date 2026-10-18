import type { Clue, ClueCredit, Question } from '../game/types';

// Question content lives here, separate from game logic.
// Images are local files in /public/clues (never hotlinked). Filenames are neutral (qNN-MM) so they
// cannot reveal answers. Credits are shown only on the "Nguồn hình ảnh" screen after the game.
// Full source notes: docs/clue-assets-review.md.

type Credits = [ClueCredit, ClueCredit, ClueCredit, ClueCredit];

function clues(questionNumber: number, credits: Credits): [Clue, Clue, Clue, Clue] {
  const q = String(questionNumber).padStart(2, '0');
  return credits.map((credit, i) => ({
    label: `Gợi ý ${i + 1}`,
    // Neutral alt text: describing the picture would give the answer away to screen-reader users.
    alt: `Câu ${questionNumber}, hình gợi ý ${i + 1}`,
    imageSrc: `clues/q${q}-0${i + 1}.webp`,
    credit,
  })) as [Clue, Clue, Clue, Clue];
}

const COMMONS = 'Wikimedia Commons';

export const QUESTIONS: readonly Question[] = [
  {
    id: 'q1',
    answer: 'BAO CẤP',
    clues: clues(1, [
      { author: 'Philip Jones Griffiths', source: 'VnExpress / Saigoneer', url: 'https://vnexpress.net/buon-ban-thoi-mau-dich-3511043.html', note: 'Hà Nội, đầu thập niên 1980' },
      { author: 'John Ramsden', source: 'VnExpress', url: 'https://vnexpress.net/buon-ban-thoi-mau-dich-3511043.html', note: 'Hà Nội, 1980–1983' },
      { author: 'Ảnh tư liệu', source: 'Ngôi Sao (VnExpress)', url: 'https://ngoisao.vnexpress.net/nhung-buc-anh-hiem-ve-cua-hang-mau-dich-thoi-bao-cap-3498655.html', note: 'không rõ tác giả, năm' },
      { author: 'Myra Siason', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:Tem_phi%E1%BA%BFu_th%E1%BB%9Di_bao_c%E1%BA%A5p.jpg', note: 'CC BY-SA 2.0' },
    ]),
  },
  {
    id: 'q2',
    answer: 'CÁCH MẠNG THÁNG MƯỜI',
    clues: clues(2, [
      { author: 'Viktor Bulla', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:19170704_Riot_on_Nevsky_prosp_Petrograd.jpg', note: 'Petrograd, tháng 7/1917; phạm vi công cộng' },
      { author: 'Florstein (WikiPhoto.Space)', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:Cruiser_Aurora_01.jpg', note: 'CC BY-SA 4.0' },
      { author: 'Karl Bulla / Finnish Heritage Agency', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:First_of_May_demonstration_in_Petrograd_1917_(JOKAOT4SK1917_21-5).tif', note: 'Petrograd, 1/5/1917; CC BY 4.0' },
      { author: 'Bưu chính Liên Xô (1957)', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:Stamp_of_USSR_2064.jpg', note: 'phạm vi công cộng' },
    ]),
  },
  {
    id: 'q3',
    answer: 'HỢP TÁC XÃ',
    clues: clues(3, [
      { author: 'Adam Jones', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:Workers_Planting_Rice_Seedlings_-_Dien_Bien_Phu_-_Vietnam_-_01_(48159228487).jpg', note: 'CC BY-SA 2.0' },
      { author: 'CNEcija12345', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:Rice_combine_harvesterCNE_04.jpg', note: 'Philippines; CC BY-SA 4.0' },
      { author: 'Phạm Thị Xuân – Đài Truyền thanh xã Lê Lợi', source: 'Cổng TTĐT xã Lê Lợi, Hưng Yên', url: 'https://leloi.hungyen.gov.vn/dai-hoi-thanh-vien-hop-tac-xa-san-xuat-kinh-doanh-dich-vu-nong-nghiep-le-loi-nhiem-ky-2026-2031-than-c2372.html', note: '4/2026' },
      { author: 'Windrain', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:H%E1%BB%A3p_t%C3%A1c_x%C3%A3_G%E1%BB%91m_Ch%C4%83m_B%C3%A0u_Tr%C3%BAc.jpg', note: 'CC BY-SA 4.0' },
    ]),
  },
  {
    id: 'q4',
    answer: 'ĐỔI MỚI',
    clues: clues(4, [
      { author: 'Bahnfrend', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:Ben_Thanh_Market,_2023_(05).jpg', note: 'CC BY-SA 4.0' },
      { author: 'Nathan.cima', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:Container_Ship_at_the_Hai_Phong_International_Container_Terminal_01.jpg', note: 'CC BY-SA 4.0' },
      { author: 'Rungbachduong', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:Thoi_bao_cap.jpg', note: 'tái hiện tại Bảo tàng Dân tộc học Việt Nam; CC BY-SA 3.0' },
      { author: 'Ảnh tư liệu TTXVN', source: 'TTXVN – Nhân vật & Sự kiện', url: 'https://nvsk.vnanet.vn/dai-hoi-dang-lan-thu-vi-15-18-12-1986-1-40398.vna', note: '12/1986' },
    ]),
  },
  {
    id: 'q5',
    answer: 'WTO',
    clues: clues(5, [
      { author: 'Daniel Parks', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:Port_of_Oakland.jpg', note: 'CC BY 2.0' },
      { author: '© WTO', source: 'WTO (Flickr) / Wikimedia Commons', url: 'https://commons.wikimedia.org/wiki/File:Marrakesh_Agreement_April_1994_(9308759604).jpg', note: 'Marrakech, 4/1994; CC BY-SA 2.0' },
      { author: 'TTXVN', source: 'Tạp chí Công Thương', url: 'https://tapchicongthuong.vn/chuyen-dam-phan-gia-nhap-wto-117293.htm', note: 'Genève, 7/11/2006; phông nền đã làm mờ' },
      { author: 'World Trade Organization', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:World_Trade_Organization_(logo_globe_only).svg', note: 'biểu trưng; nhãn hiệu đã đăng ký' },
    ]),
  },
  {
    id: 'q6',
    answer: 'PHÁT TRIỂN BỀN VỮNG',
    clues: clues(6, [
      { author: 'LeRoy Woodson / US EPA', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:U.S._STEEL_PLANT_EMITS_RED-ORANGE_SMOKE_24_HOURS_A_DAY_-_NARA_-_545445.jpg', note: '1972; phạm vi công cộng' },
      { author: 'Rudolph A. Furtado', source: COMMONS, url: "https://commons.wikimedia.org/wiki/File:%27vaibhav_Apts%27_locality_seen_from_Worli_Fort.JPG", note: 'Mumbai; phạm vi công cộng' },
      { author: 'Sebastian Koppehel', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:Energieberg_Georgswerder_01.jpg', note: 'CC BY 4.0' },
      { author: 'Nicoguaro (đã chỉnh sửa)', source: COMMONS, url: 'https://commons.wikimedia.org/wiki/File:Sustainability_venn_diagram.svg', note: 'CC BY 4.0' },
    ]),
  },
];
