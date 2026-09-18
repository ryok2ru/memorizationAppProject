interface Props {
  favorite: boolean;
  onToggle: () => void;
  /** 一覧の ★ より大きく出す学習画面・単語フォーム用。押すたびに ☆（空）と ★（塗り）が入れ替わる */
  className?: string;
}

/** ☆ の付け外しボタン（7-3、7-4、7-6）。押した時点で保存し、保存ボタンは要らない */
export function FavoriteButton({ favorite, onToggle, className = '' }: Props) {
  return (
    <button
      type="button"
      className={`btn-icon btn-favorite${favorite ? ' on' : ''} ${className}`.trim()}
      aria-pressed={favorite}
      aria-label={favorite ? 'お気に入りから外す' : 'お気に入りに追加'}
      onClick={onToggle}
      data-testid="favorite-toggle"
    >
      {favorite ? '★' : '☆'}
    </button>
  );
}
