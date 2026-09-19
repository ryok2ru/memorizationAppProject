interface Props {
  favorite: boolean;
  onToggle: () => void;
}

/**
 * ☆ の付け外しボタン（7-4 の単語フォーム、7-6 の学習画面）。押した時点で保存し、保存ボタンは要らない。
 * 見た目は直径 36px の円で、☆ は薄いグレーの円に通常色の ☆、★ は Hard 色の円に白の ★。
 * 円は 36px だがタップ領域は button の 44px のまま。
 */
export function FavoriteButton({ favorite, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`btn-favorite${favorite ? ' on' : ''}`}
      aria-pressed={favorite}
      aria-label={favorite ? 'お気に入りから外す' : 'お気に入りに追加'}
      onClick={onToggle}
      data-testid="favorite-toggle"
    >
      <span className="favorite-circle" aria-hidden="true">
        {favorite ? '★' : '☆'}
      </span>
    </button>
  );
}
