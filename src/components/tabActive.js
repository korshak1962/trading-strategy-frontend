// src/components/tabActive.js
//
// Whether the keep-alive tab (TabPane) a component lives in is the visible one. Outside a TabPane
// it is always true.
import { createContext, useContext } from 'react';

export const TabActiveContext = createContext(true);

/** @returns {boolean} the enclosing tab is visible */
export const useTabActive = () => useContext(TabActiveContext);
