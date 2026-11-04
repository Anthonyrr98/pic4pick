import { createContext, useContext } from 'react';

// Standalone component previews can enter immediately; App waits for its intro.
export const EntryMotionContext = createContext(true);
export const useEntryMotionReady = () => useContext(EntryMotionContext);
