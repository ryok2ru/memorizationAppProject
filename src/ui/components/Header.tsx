import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  /** 省略するとタイトルを出さない（ホームだけ。7-2）。左右の領域の幅と位置は変わらない */
  title?: string;
  /** 戻る先。未指定なら戻るボタンなし。'back' なら履歴を戻る */
  back?: string | 'back';
  right?: ReactNode;
  left?: ReactNode;
}

/**
 * 全画面共通の上部バー（7-1）。左の領域・タイトル・右の領域の 3 列で、
 * 左右の領域は同じ固定幅（.header-side の 96px）。片側にしかアイコンが無い画面でも
 * 同じ幅を取るので、タイトルは常に画面の中央に来る。
 */
export function Header({ title, back, right, left }: Props) {
  const navigate = useNavigate();
  return (
    <header className="header">
      <div className="header-side">
        {back && (
          <button
            type="button"
            className="btn-text"
            aria-label="戻る"
            onClick={() => (back === 'back' ? navigate(-1) : navigate(back))}
          >
            ‹ 戻る
          </button>
        )}
        {left}
      </div>
      {title ? <h1>{title}</h1> : <div className="header-fill" />}
      <div className="header-side right">{right}</div>
    </header>
  );
}
