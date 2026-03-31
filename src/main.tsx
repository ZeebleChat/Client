/**
 * Main entry point for the Zeeble React application.
 * Initializes ReactStrictMode for development best practices,
 * mounts the root App component to the DOM, and applies global styles.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

/**
 * Mounts the React application to the DOM element with id="root".
 * Wraps the app in StrictMode to enable additional development checks
 * and warnings in the React rendering lifecycle.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
