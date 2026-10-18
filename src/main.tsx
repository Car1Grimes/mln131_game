import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './admin/AdminApp';
import { PlayerApp } from './player/PlayerApp';
import './styles.css';

// Two routes in one bundle: /admin for the host, everything else for teams.
// Neither route contains any answer: answers exist only on the server.
const isAdmin = /^\/admin\/?$/.test(location.pathname);

createRoot(document.getElementById('root')!).render(<StrictMode>{isAdmin ? <AdminApp /> : <PlayerApp />}</StrictMode>);
