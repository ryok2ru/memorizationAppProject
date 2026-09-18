import { createContext, useContext } from 'react';

export interface SwState {
  needRefresh: boolean;
  update: () => void;
}

export const SwContext = createContext<SwState>({ needRefresh: false, update: () => {} });
export const useSw = () => useContext(SwContext);
