import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { SwContext } from './ui/SwContext';
import { UpdateBanner } from './ui/components/UpdateBanner';
import { Home } from './ui/screens/Home';
import { WordList } from './ui/screens/WordList';
import { WordForm } from './ui/screens/WordForm';
import { ModeSelect } from './ui/screens/ModeSelect';
import { Flashcard } from './ui/screens/Flashcard';
import { Typing } from './ui/screens/Typing';
import { Result } from './ui/screens/Result';
import { Settings } from './ui/screens/Settings';

export default function App() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.warn('service worker registration failed', error);
    },
  });
  const update = () => void updateServiceWorker(true);

  return (
    <SwContext.Provider value={{ needRefresh, update }}>
      <HashRouter>
        <div className="app">
          <UpdateBanner visible={needRefresh} onUpdate={update} />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/folders/:folderId" element={<WordList />} />
            {/* 全フォルダの ★ 付き単語（7-2、7-3） */}
            <Route path="/favorites" element={<WordList favorites />} />
            <Route path="/folders/:folderId/words/new" element={<WordForm />} />
            <Route path="/words/:wordId" element={<WordForm />} />
            <Route path="/study/select" element={<ModeSelect />} />
            <Route path="/study/flashcard" element={<Flashcard />} />
            <Route path="/study/typing" element={<Typing />} />
            <Route path="/study/result" element={<Result />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </HashRouter>
    </SwContext.Provider>
  );
}
