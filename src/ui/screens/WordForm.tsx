import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { errorMessage } from '../hooks';
import { createWord, deleteWord, getWord, updateWordText } from '../../db/repo';
import { updateBadge } from '../../app/badge';
import { requestPersistentStorage } from '../../app/settings';
import { isWordValid, trimWord, validateWord } from '../../domain/validation';
import { LIMITS } from '../../domain/types';

export function WordForm() {
  const { folderId, wordId } = useParams();
  const navigate = useNavigate();
  const isEdit = wordId != null;
  const [initial, setInitial] = useState({ englishTerm: '', japaneseDefinition: '', memo: '' });
  const [form, setForm] = useState(initial);
  const [targetFolder, setTargetFolder] = useState(folderId ?? '');
  const [loaded, setLoaded] = useState(!isEdit);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    void getWord(wordId).then((w) => {
      if (!w) {
        navigate('/', { replace: true });
        return;
      }
      const v = { englishTerm: w.englishTerm, japaneseDefinition: w.japaneseDefinition, memo: w.memo };
      setInitial(v);
      setForm(v);
      setTargetFolder(w.folderId);
      setLoaded(true);
    });
  }, [isEdit, wordId, navigate]);

  const errors = validateWord(form);
  const canSave = isWordValid(form);
  const dirty = form.englishTerm !== initial.englishTerm || form.japaneseDefinition !== initial.japaneseDefinition || form.memo !== initial.memo;
  const backTo = `/folders/${targetFolder}`;

  const onSave = async () => {
    if (!canSave) return;
    const value = trimWord(form);
    try {
      if (isEdit) {
        await updateWordText(wordId, value);
      } else {
        requestPersistentStorage();
        await createWord({ folderId: targetFolder, ...value });
        await updateBadge();
      }
      navigate(backTo, { replace: true });
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const onDelete = async () => {
    setConfirmDelete(false);
    if (!isEdit) return;
    try {
      await deleteWord(wordId);
      await updateBadge();
      navigate(backTo, { replace: true });
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };

  const onCancel = () => {
    if (dirty) setConfirmDiscard(true);
    else navigate(backTo);
  };

  const showError = (key: keyof typeof errors) => {
    const msg = errors[key];
    if (!msg) return null;
    // 未入力は保存ボタンの非活性で示し、超過だけ赤字にする
    if (form[key].trim().length === 0) return null;
    return <p className="error">{msg}</p>;
  };

  return (
    <div className="screen">
      <Header
        title={isEdit ? '単語を編集' : '単語を追加'}
        left={
          <button type="button" className="btn-text" onClick={onCancel}>
            キャンセル
          </button>
        }
        right={
          <button type="button" className="btn-text" disabled={!canSave || !loaded} onClick={onSave} style={{ fontWeight: 600 }}>
            保存
          </button>
        }
      />

      {message && (
        <div className="notice" role="alert">
          {message}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <label className="field">
          <span>英単語（必須）</span>
          <input
            type="text"
            lang="en"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={form.englishTerm}
            onChange={(e) => setForm({ ...form, englishTerm: e.target.value })}
            aria-invalid={!!errors.englishTerm}
          />
          {showError('englishTerm')}
        </label>
        <label className="field">
          <span>日本語訳（必須）</span>
          <input
            type="text"
            lang="ja"
            placeholder="例: 曖昧な,あいまいな（カンマ区切りで複数可）"
            value={form.japaneseDefinition}
            onChange={(e) => setForm({ ...form, japaneseDefinition: e.target.value })}
            aria-invalid={!!errors.japaneseDefinition}
          />
          {showError('japaneseDefinition')}
        </label>
        <label className="field">
          <span>メモ（任意）</span>
          <textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} aria-invalid={!!errors.memo} />
          {showError('memo')}
          <span className="small muted">
            {form.memo.length} / {LIMITS.memo}
          </span>
        </label>
        <button type="submit" className="btn-primary" disabled={!canSave || !loaded}>
          保存
        </button>
      </form>

      {isEdit && (
        <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
          この単語を削除
        </button>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        message="変更を破棄しますか？"
        confirmLabel="破棄"
        danger
        onConfirm={() => {
          setConfirmDiscard(false);
          navigate(backTo);
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="単語を削除"
        message="この単語と学習履歴を削除します。よろしいですか？"
        confirmLabel="削除"
        danger
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
