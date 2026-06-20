import React, { useState, useRef, useEffect } from 'react';
import { useTeamStore } from '../../stores/team-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useMapStore } from '../../stores/map-store';
import { Avatar } from '../common/Avatar';
import './TeamChat.css';

export function TeamChat() {
  const { chatMessages, sendMessage } = useTeamStore();
  const members = useTeamStore((s) => s.members);
  // Chat is available whenever we have any team data (even a 1-person team).
  const inTeam = members.length >= 1;
  const [input, setInput] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages]);

  /**
   * Smart chat command handling. Commands prefixed with "!" are interpreted
   * locally; some answer in the local feed, others broadcast an answer to the
   * whole team so it shows up in-game.
   */
  const handleCommand = (raw: string): boolean => {
    if (!raw.startsWith('!')) return false;

    const [cmd, ...rest] = raw.slice(1).trim().split(/\s+/);
    const arg = rest.join(' ');
    const store = useTeamStore.getState();
    const { serverInfo } = useConnectionStore.getState();
    const { markers } = useMapStore.getState();

    switch (cmd.toLowerCase()) {
      case 'help':
        store.addSystemMessage(
          'Commands: !pop, !time, !team, !heli, !cargo, !marker <text>'
        );
        return true;

      case 'pop':
        if (serverInfo) {
          sendMessage(
            `[POP] ${serverInfo.players}/${serverInfo.max_players}` +
              (serverInfo.queued_players ? ` (+${serverInfo.queued_players} queued)` : '')
          );
        } else {
          store.addSystemMessage('Server population unavailable.');
        }
        return true;

      case 'time':
        store.addSystemMessage(`Local time: ${new Date().toLocaleTimeString()}`);
        return true;

      case 'team': {
        const online = store.members.filter((m) => m.status === 'online');
        if (online.length === 0) {
          store.addSystemMessage('No teammates online.');
        } else {
          const summary = online
            .map((m) => `${m.name}@${m.grid || '??'}`)
            .join(', ');
          sendMessage(`[TEAM] ${summary}`);
        }
        return true;
      }

      case 'heli': {
        const heli = markers.find((m) => m.type === 'patrol_heli');
        sendMessage(heli ? `[HELI] active at ${heli.detail || '??'}` : '[HELI] not on map');
        return true;
      }

      case 'cargo': {
        const cargo = markers.find((m) => m.type === 'cargo_ship');
        sendMessage(cargo ? `[CARGO] active at ${cargo.detail || '??'}` : '[CARGO] not on map');
        return true;
      }

      case 'marker': {
        // Announce your own position to the team.
        const self = store.selfSteamId
          ? store.members.find((m) => m.id === store.selfSteamId)
          : null;
        const grid = self?.grid;
        sendMessage(`[MARK] ${arg || 'here'}${grid ? ` @ ${grid}` : ''}`);
        return true;
      }

      default:
        store.addSystemMessage(`Unknown command: !${cmd}. Try !help`);
        return true;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    if (!handleCommand(text)) {
      sendMessage(text);
    }
    setInput('');
  };

  return (
    <div className="team-chat">
      <div className="chat-header">
        <span className="status-dot status-online"></span>
        <span className="hud-label text-dim">TEAM CHAT</span>
      </div>
      
      <div className="chat-messages" ref={chatRef}>
        {chatMessages.map((msg) => {
          const isSystem = msg.isSystem;
          const isYou = msg.isYou ?? msg.sender === 'You';
          return (
            <div key={msg.id} className="chat-message">
              {!isSystem && (
                <Avatar steamId={msg.steamId} name={msg.sender} size={24} />
              )}
              <p className="chat-text">
                {isSystem ? (
                  <span className="chat-content" style={{ color: 'var(--accent)' }}>{msg.text}</span>
                ) : (
                  <>
                    <span className="chat-prefix">[Team]</span>{' '}
                    <span className="chat-author" style={{ color: isYou ? '#6fcf73' : '#e0a64a' }}>
                      {msg.sender}
                    </span>
                    <span style={{ color: isYou ? '#6fcf73' : '#e0a64a' }}>:</span>{' '}
                    <span className="chat-content">{msg.text}</span>
                  </>
                )}
              </p>
            </div>
          );
        })}
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-input"
          placeholder={inTeam ? 'Type a message or !command...' : 'Join a team to use chat'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!inTeam}
        />
      </form>
    </div>
  );
}
