import { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Lock, X, ShieldCheck } from 'lucide-react';
import './SteamLoginOverlay.css';

interface SteamLoginOverlayProps {
  initialUrl: string;
  onClose: () => void;
}

export default function SteamLoginOverlay({ initialUrl, onClose }: SteamLoginOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [domain, setDomain] = useState('steamcommunity.com');

  useEffect(() => {
    // Listen to navigation events from the child webview
    let unlistenNav: (() => void) | undefined;
    
    listen<{ url: string; domain: string }>('steam-webview-navigated', (event: any) => {
      setCurrentUrl(event.payload.url);
      setDomain(event.payload.domain);
    }).then((unsub) => {
      unlistenNav = unsub;
    });

    const initWebview = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      
      invoke('open_steam_in_app_webview', {
        url: initialUrl,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      }).catch((err) => {
        console.error('Failed to open Steam login webview:', err);
      });
    };

    // Initialize with a short timeout to ensure container is fully laid out
    const timer = setTimeout(initWebview, 150);

    const handleResize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      
      invoke('resize_steam_webview', {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      }).catch((err) => {
        console.error('Failed to resize Steam webview:', err);
      });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      if (unlistenNav) unlistenNav();
      
      invoke('close_steam_in_app_webview').catch((err) => {
        console.error('Failed to close Steam webview:', err);
      });
    };
  }, [initialUrl]);

  return (
    <div className="steam-overlay-backdrop">
      <div className="steam-overlay-card">
        {/* Secure Browser Header */}
        <div className="steam-browser-header">
          <div className="steam-browser-title">
            <Lock size={12} className="text-secure" />
            <span className="secure-badge-text">SECURE LOGIN VIA STEAM</span>
            <span className="partner-badge">
              <ShieldCheck size={11} />
              VERIFIED OPENID PARTNER
            </span>
          </div>
          <button className="steam-browser-close-btn" onClick={onClose} aria-label="Close login window">
            <X size={16} />
          </button>
        </div>

        {/* Browser Address Bar */}
        <div className="steam-browser-address-row">
          <div className="steam-browser-address-bar">
            <Lock size={12} className="text-secure-lock" />
            <span className="address-protocol">https://</span>
            <span className="address-domain">{domain}</span>
            <span className="address-path">{currentUrl.substring(currentUrl.indexOf(domain) + domain.length)}</span>
          </div>
        </div>

        {/* Security Warning / Info bar */}
        <div className="steam-browser-security-banner">
          <div className="banner-content">
            <ShieldCheck size={14} className="text-secure-lock" />
            <p>
              This window runs the official <b>Steam OpenID Authentication</b> page directly.
              Raidar will never see, collect, or store your Steam username or password.
            </p>
          </div>
        </div>

        {/* Webview Target Container */}
        <div 
          id="steam-login-container" 
          ref={containerRef} 
          className="steam-webview-container"
        />
      </div>
    </div>
  );
}
