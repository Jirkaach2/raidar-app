import type { ReactNode } from 'react';
import Titlebar from './Titlebar';
import NavRail, { type NavPage } from './NavRail';
import StatusBar from './StatusBar';
import './AppShell.css';

interface AppShellProps {
  children: ReactNode;
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
}

export default function AppShell({ children, activePage, onNavigate }: AppShellProps) {
  return (
    <div className="appshell">
      {/* Global overlays */}
      <div className="appshell__scanlines" />
      <div className="appshell__vignette" />
      <div className="appshell__noise" />

      <Titlebar />

      <div className="appshell__body">
        <NavRail active={activePage} onNavigate={onNavigate} />
        <main className="appshell__content">
          {children}
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
