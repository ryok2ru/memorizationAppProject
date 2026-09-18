import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  title: string;
  /** 戻る先。未指定なら戻るボタンなし。'back' なら履歴を戻る */
  back?: string | 'back';
  right?: ReactNode;
  left?: ReactNode;
}

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
      <h1>{title}</h1>
      <div className="header-side right">{right}</div>
    </header>
  );
}
