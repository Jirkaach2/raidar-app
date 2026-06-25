import { useMemo, useState } from 'react';
import './CommandsPanel.css';

type Access = 'everyone' | 'restricted' | 'admin';

interface SlashCommand {
  command: string;
  args?: string;
  description: string;
  access: Access;
}

interface ChatCommand {
  command: string;
  args?: string;
  description: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/help', description: 'Show all commands', access: 'everyone' },
  { command: '/status', description: 'Server population, map & wipe', access: 'everyone' },
  { command: '/pop', description: 'Current population', access: 'everyone' },
  { command: '/time', description: 'In-game time (day/night)', access: 'everyone' },
  { command: '/wipe', description: 'Last wipe time & age', access: 'everyone' },
  { command: '/cargo', description: 'Cargo ship status & grid', access: 'everyone' },
  { command: '/events', description: 'Live map events (cargo, heli, crates, chinook)', access: 'everyone' },
  { command: '/team', description: 'Team members, status & grid', access: 'everyone' },
  { command: '/check', args: '<steamid>', description: 'Look up a player (hours, bans, K/D, cheat risk)', access: 'everyone' },
  { command: '/devices', description: 'List paired smart devices & state', access: 'everyone' },
  { command: '/control', description: 'Button panel to toggle Smart Switches', access: 'restricted' },
  { command: '/toggle', args: '<device> <on|off>', description: 'Toggle a Smart Switch', access: 'restricted' },
  { command: '/say', args: '<message>', description: 'Send a message to in-game team chat', access: 'restricted' },
  { command: '/alarms', args: '<here|off>', description: 'Set/clear this channel for alerts', access: 'restricted' },
  { command: '/test', description: 'Send a test notification', access: 'restricted' },
  { command: '/channels', description: 'Create the Raidar section & channels', access: 'admin' },
  { command: '/link', description: 'Link this server', access: 'restricted' },
  { command: '/unlink', description: 'Disconnect this server', access: 'restricted' },
];

const CHAT_COMMANDS: ChatCommand[] = [
  { command: '!check', args: '<steamid>', description: 'Player lookup (public hours, K/D, VAC)' },
  { command: '!pop', description: 'Current server population' },
  { command: '!time', description: 'In-game time' },
  { command: '!wipe', description: 'Last wipe age' },
];

const ACCESS_LABEL: Record<Access, string> = {
  everyone: 'everyone',
  restricted: 'restricted',
  admin: 'admin',
};

function AccessBadge({ access }: { access: Access }) {
  return (
    <span className={`cmd-badge cmd-badge--${access}`}>{ACCESS_LABEL[access]}</span>
  );
}

export function CommandsPanel() {
  const [query, setQuery] = useState('');

  const filteredSlash = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
      (c) =>
        c.command.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.args ? c.args.toLowerCase().includes(q) : false),
    );
  }, [query]);

  return (
    <div className="cmd-panel">
      <div className="cmd-head">
        <div>
          <h1 className="cmd-title">COMMANDS</h1>
          <p className="cmd-sub">DISCORD BOT & TEAM-CHAT REFERENCE</p>
        </div>
      </div>

      <div className="cmd-body">
        <p className="cmd-intro">
          Raidar ships with a companion Discord bot for your team. Invite and link it from{' '}
          <span className="cmd-path">Settings → Discord</span>, then run slash commands in Discord
          or type chat commands directly in Rust team chat. The bot replies in the same channel it
          was called from.
        </p>

        {/* ── SLASH COMMANDS ── */}
        <section className="cmd-section">
          <div className="cmd-section-head">
            <h2 className="cmd-section-title">SLASH COMMANDS</h2>
            <span className="cmd-section-tag">Discord</span>
            <input
              type="text"
              className="cmd-search"
              placeholder="Filter commands…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter slash commands"
            />
          </div>

          <div className="cmd-table" role="table">
            <div className="cmd-row cmd-row--header" role="row">
              <span className="cmd-col-cmd">Command</span>
              <span className="cmd-col-desc">Description</span>
              <span className="cmd-col-access">Access</span>
            </div>
            {filteredSlash.length === 0 ? (
              <div className="cmd-empty">No commands match “{query}”.</div>
            ) : (
              filteredSlash.map((c) => (
                <div className="cmd-row" role="row" key={c.command + (c.args ?? '')}>
                  <span className="cmd-col-cmd">
                    <code className="cmd-code">{c.command}</code>
                    {c.args && <span className="cmd-args">{c.args}</span>}
                  </span>
                  <span className="cmd-col-desc">{c.description}</span>
                  <span className="cmd-col-access">
                    <AccessBadge access={c.access} />
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── TEAM-CHAT COMMANDS ── */}
        <section className="cmd-section">
          <div className="cmd-section-head">
            <h2 className="cmd-section-title">TEAM-CHAT COMMANDS</h2>
            <span className="cmd-section-tag">In-Game</span>
          </div>
          <p className="cmd-section-note">
            Type these straight into Rust team chat — the bot reads them and replies in chat.
          </p>

          <div className="cmd-table" role="table">
            <div className="cmd-row cmd-row--header" role="row">
              <span className="cmd-col-cmd">Command</span>
              <span className="cmd-col-desc cmd-col-desc--wide">Description</span>
            </div>
            {CHAT_COMMANDS.map((c) => (
              <div className="cmd-row" role="row" key={c.command + (c.args ?? '')}>
                <span className="cmd-col-cmd">
                  <code className="cmd-code">{c.command}</code>
                  {c.args && <span className="cmd-args">{c.args}</span>}
                </span>
                <span className="cmd-col-desc cmd-col-desc--wide">{c.description}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── ALERTS & NOTIFICATIONS ── */}
        <section className="cmd-section">
          <div className="cmd-section-head">
            <h2 className="cmd-section-title">ALERTS & NOTIFICATIONS</h2>
            <span className="cmd-section-tag">Push</span>
          </div>
          <p className="cmd-alert-text">
            Smart-alarm raids and live world events get pushed to your configured Discord channel as
            rich alerts. Each alert carries quick-action buttons:
          </p>
          <div className="cmd-action-row">
            <span className="cmd-action cmd-action--danger">Alert Team</span>
            <span className="cmd-action cmd-action--muted">Mute 1 Hour</span>
            <span className="cmd-action cmd-action--info">View Live Map</span>
          </div>
          <p className="cmd-alert-text">
            Pick which channel receives them by running{' '}
            <code className="cmd-code">/alarms</code> <span className="cmd-args">here</span> in the
            target channel. Use <code className="cmd-code">/alarms</code>{' '}
            <span className="cmd-args">off</span> to stop alerts there.
          </p>
        </section>
      </div>
    </div>
  );
}
