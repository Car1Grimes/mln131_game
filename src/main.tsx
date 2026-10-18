import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './admin/AdminApp';
import { PlayerApp } from './player/PlayerApp';
import { ScreenApp } from './screen/ScreenApp';
import './styles.css';

// Three routes in one bundle: /admin for the host, /screen for the classroom projector, everything
// else for teams. No route contains any answer: answers exist only on the server.
const path = location.pathname.replace(/\/+$/, '');
const app = path === '/admin' ? <AdminApp /> : path === '/screen' ? <ScreenApp /> : <PlayerApp />;

createRoot(document.getElementById('root')!).render(<StrictMode>{app}</StrictMode>);
