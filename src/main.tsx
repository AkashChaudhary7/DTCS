import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import { installServerlessApiFallback } from './services/serverlessEngine';

// Install transparent Serverless + Firestore API fallback so static domain deployments
// work 100% natively (including Admin Login Dsssb123!321, Answer Key Discovery & Leaderboard)
installServerlessApiFallback();

// Register service worker to cache core application shell & recent leaderboard API responses
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);
