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
  // ── Setup ──
  { command: '/link', description: 'Link this server from the Raidar app', access: 'restricted' },
  { command: '/unlink', description: 'Disconnect this server', access: 'restricted' },
  { command: '/channels', description: 'Create the Raidar section & channels', access: 'admin' },
  { command: '/test', description: 'Preview the rich raid-alert notification', access: 'restricted' },
  // ── Info ──
  { command: '/status', description: 'Server population, map & wipe', access: 'everyone' },
  { command: '/pop', description: 'Current population', access: 'everyone' },
  { command: '/online', description: 'Count of online teammates', access: 'everyone' },
  { command: '/time', description: 'In-game time (day/night)', access: 'everyone' },
  { command: '/sun', description: 'Time until next sunrise/sunset', access: 'everyone' },
  { command: '/wipe', description: 'Last wipe time & age', access: 'everyone' },
  { command: '/cargo', description: 'Cargo ship status & grid', access: 'everyone' },
  { command: '/heli', description: 'Patrol Heli & Chinook locations', access: 'everyone' },
  { command: '/vendor', description: 'Travelling vendor location', access: 'everyone' },
  { command: '/events', description: 'Live map events', access: 'everyone' },
  { command: '/help', description: 'List all commands', access: 'everyone' },
  // ── Reference ──
  { command: '/loot', args: '<crate>', description: 'Loot-table summary (military/elite/basic/locked/scientist)', access: 'everyone' },
  { command: '/monument', args: '<name>', description: 'Tier, keycards & notes for a monument', access: 'everyone' },
  // ── Player & Team ──
  { command: '/check', args: '<steamid>', description: 'Look up a player (hours, bans, K/D, cheat risk)', access: 'everyone' },
  { command: '/team', description: 'Team members, status & grid', access: 'everyone' },
  { command: '/grid', description: 'Grid of each online teammate', access: 'everyone' },
  { command: '/devices', description: 'List paired smart devices & state', access: 'everyone' },
  // ── Control ──
  { command: '/control', description: 'Button panel to toggle Smart Switches', access: 'restricted' },
  { command: '/toggle', args: '<device> <on|off>', description: 'Toggle a Smart Switch', access: 'restricted' },
  { command: '/say', args: '<message>', description: 'Send a message to in-game team chat', access: 'restricted' },
  { command: '/alarms', args: '<here|off>', description: 'Set/clear this channel for alerts', access: 'restricted' },
];

const CHAT_COMMANDS: ChatCommand[] = [
  // ── Server & status ──
  { command: '!pop', description: 'Current server population' },
  { command: '!status', description: 'Population + in-game time at a glance' },
  { command: '!server', description: 'Server name, population & map size' },
  { command: '!map', description: 'Map size & seed' },
  { command: '!seed', description: 'Map size & seed (alias of !map)' },
  { command: '!wipe', description: 'Last wipe age' },
  // ── Time ──
  { command: '!time', description: 'In-game time (day/night)' },
  // ── Team ──
  { command: '!team', description: 'Online teammates with each grid, on one line' },
  // ── World events ──
  { command: '!cargo', description: 'Cargo ship grid — shows last-seen if not active' },
  { command: '!heli', description: 'Patrol heli (+ Chinook) grid — shows last-seen if not active' },
  { command: '!chinook', description: 'Chinook grid' },
  { command: '!vendor', description: 'Travelling vendor grid — shows last-seen if not active' },
  { command: '!events', description: 'Active world events summary' },
  { command: '!deepsea', description: 'Deep sea shops / event status' },
  { command: '!crates', description: 'Active crate timers / live locked crates' },
  { command: '!oilrig', description: 'Small Oil Rig crate: time left, or last-opened age' },
  { command: '!largeoilrig', description: 'Large Oil Rig crate: time left, or last-opened age' },
  // ── Crate timers (app) ──
  { command: '!crate', args: 'add|del|edit <monument> [mm:ss]', description: 'Add / remove / re-set a crate unlock timer' },
  // ── Shops ──
  { command: '!vend', args: '<item>', description: 'Find shops selling an item (grid + price)' },
  // ── Devices & base ──
  { command: '!devices', description: 'List paired smart devices & on/off state' },
  { command: '!switch', args: '<name>', description: 'Toggle a Smart Switch by name' },
  { command: '!upkeep', description: 'Tool Cupboard upkeep time remaining' },
  // ── Player & reference ──
  { command: '!check', args: '<steamid>', description: 'Player lookup (public hours, K/D, VAC bans)' },
  { command: '!loot', args: '<crate>', description: 'Top items for a crate type' },
  { command: '!help', description: 'List all in-game commands' },
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

function DiscordGlyph() {
  return (
    <svg
      className="cmd-discord-glyph"
      viewBox="0 0 24 18"
      width="14"
      height="11"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M20.32 1.49A19.79 19.79 0 0 0 15.43 0c-.22.39-.47.92-.64 1.34a18.4 18.4 0 0 0-5.58 0C9.04.92 8.78.39 8.56 0A19.74 19.74 0 0 0 3.67 1.5C.57 6.12-.27 10.62.15 15.06a19.95 19.95 0 0 0 6.04 3.04c.49-.66.92-1.36 1.29-2.1-.71-.27-1.39-.6-2.03-.99.17-.12.34-.25.5-.38a14.25 14.25 0 0 0 12.11 0c.16.13.33.26.5.38-.64.39-1.32.72-2.03.99.37.74.8 1.44 1.29 2.1a19.9 19.9 0 0 0 6.04-3.04c.5-5.18-.85-9.64-3.58-13.57ZM8.02 12.33c-1.18 0-2.16-1.08-2.16-2.4 0-1.32.95-2.41 2.16-2.41 1.21 0 2.18 1.09 2.16 2.41 0 1.32-.95 2.4-2.16 2.4Zm7.96 0c-1.18 0-2.16-1.08-2.16-2.4 0-1.32.95-2.41 2.16-2.41 1.21 0 2.18 1.09 2.16 2.41 0 1.32-.95 2.4-2.16 2.4Z"
      />
    </svg>
  );
}

export function CommandsPanel() {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();

  const filteredSlash = useMemo(() => {
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
      (c) =>
        c.command.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.args ? c.args.toLowerCase().includes(q) : false),
    );
  }, [q]);

  const filteredChat = useMemo(() => {
    if (!q) return CHAT_COMMANDS;
    return CHAT_COMMANDS.filter(
      (c) =>
        c.command.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.args ? c.args.toLowerCase().includes(q) : false),
    );
  }, [q]);

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
          <span className="cmd-path">Settings → Discord</span>. There are two ways to talk to it:{' '}
          <strong className="cmd-emph cmd-emph--ingame">in-game team chat</strong> commands you type
          straight into Rust, and{' '}
          <strong className="cmd-emph cmd-emph--discord">Discord slash commands</strong> you run in
          your server. The bot replies in the same place it was called from.
        </p>

        {/* ── TEAM-CHAT COMMANDS (In-Game) ── */}
        <section className="cmd-section">
          <div className="cmd-section-head">
            <h2 className="cmd-section-title">TEAM-CHAT COMMANDS</h2>
            <span className="cmd-section-tag cmd-section-tag--ingame">In-Game</span>
            <input
              type="text"
              className="cmd-search"
              placeholder="Filter commands…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter commands"
            />
          </div>
          <p className="cmd-section-note">
            Type these directly into Rust in-game team chat — the bot reads them and replies in
            chat. Crate timers (<code className="cmd-code">!crate add/del/edit</code>),
            <code className="cmd-code">!upkeep</code> and device control respond while the desktop
            app is connected; the bot covers the rest when the app is closed.
          </p>

          <div className="cmd-table" role="table">
            <div className="cmd-row cmd-row--header" role="row">
              <span className="cmd-col-cmd">Command</span>
              <span className="cmd-col-desc cmd-col-desc--wide">Description</span>
            </div>
            {filteredChat.length === 0 ? (
              <div className="cmd-empty">No commands match “{query}”.</div>
            ) : (
              filteredChat.map((c) => (
                <div className="cmd-row" role="row" key={c.command + (c.args ?? '')}>
                  <span className="cmd-col-cmd">
                    <code className="cmd-code">{c.command}</code>
                    {c.args && <span className="cmd-args">{c.args}</span>}
                  </span>
                  <span className="cmd-col-desc cmd-col-desc--wide">{c.description}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── SLASH COMMANDS (Discord) ── */}
        <section className="cmd-section">
          <div className="cmd-section-head">
            <h2 className="cmd-section-title">SLASH COMMANDS</h2>
            <span className="cmd-section-tag cmd-section-tag--discord">
              <DiscordGlyph />
              Discord
            </span>
          </div>
          <p className="cmd-section-note">
            Type these in any Discord channel where the Raidar bot is present.
          </p>

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
