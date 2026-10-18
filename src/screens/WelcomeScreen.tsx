import { PlayIcon } from '../components/icons';

export function WelcomeScreen({ onStart, questionCount }: { onStart: () => void; questionCount: number }) {
  return (
    <main className="screen welcome">
      <div className="spotlight" aria-hidden="true" />
      <p className="eyebrow">Gameshow lớp học</p>
      <h1 className="hero-title">
        <span>THE HIDDEN</span>
        <span className="hero-accent">CONNECTION</span>
      </h1>
      <p className="hero-sub">Bốn hình ảnh. Một từ khóa. Đội nào nhìn ra mối liên hệ ẩn giấu nhanh nhất?</p>
      <ul className="rule-chips">
        <li><strong>5</strong> đội</li>
        <li><strong>{questionCount}</strong> câu hỏi</li>
        <li><strong>4</strong> gợi ý mỗi câu</li>
        <li><strong>60</strong> giây</li>
        <li><strong>40 · 30 · 20 · 10</strong> điểm</li>
      </ul>
      <button type="button" className="btn btn-primary btn-hero" onClick={onStart} data-autofocus>
        <PlayIcon /> Bắt đầu
      </button>
    </main>
  );
}
