interface Props {
  visible: boolean;
  onUpdate: () => void;
}

/** Service Worker の更新通知 */
export function UpdateBanner({ visible, onUpdate }: Props) {
  if (!visible) return null;
  return (
    <div className="update-banner" role="status">
      <span>新しいバージョンがあります</span>
      <button type="button" onClick={onUpdate}>
        更新
      </button>
    </div>
  );
}
