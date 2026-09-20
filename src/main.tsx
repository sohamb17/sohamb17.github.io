import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-mono/latin-400.css';
import './styles.css';

const root = document.getElementById('root')!;
if (root.querySelector('main')) hydrateRoot(root, <App />);
else createRoot(root).render(<App />);
