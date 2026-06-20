import { useState } from 'react';
import { useTeamStore } from '../../stores/team-store';
import { Avatar } from '../common/Avatar';
import { TeamChat } from './TeamChat';
import { Crown, ChevronDown, ChevronUp, Clock, ExternalLink } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import './TeamPanel.css';

interface SteamProfile {
  name: string;
  avatar_url: string;
  privacy_state: string;
  is_vac_banned: boolean;
  trade_ban_state: string;
  is_limited: boolean;
  rust_hours: number | null;
  steam_level: number;
  is_playing_rust: boolean;
}

function TeammateCard({
  member,
  selfSteamId,
  isSelfLeader,
  handlePromote
}: {
  member: any;
  selfSteamId: string | null;
  isSelfLeader: boolean;
  handlePromote: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [steamProfile, setSteamProfile] = useState<SteamProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDead = member.status === 'dead';
  const isOffline = member.status === 'offline';
  const isSelf = member.id === selfSteamId || member.isSelf || member.name === 'You';

  const fetchStats = async () => {
    if (stats || loading) return;
    setLoading(true);
    setError(null);
    try {
      const steamId64 = member.id;
      if (steamId64 && steamId64.length === 17 && /^\d+$/.test(steamId64)) {
        // Fetch Steam Profile Info
        const profileInfo = await invoke<SteamProfile>('get_steam_profile_info', { steamId: steamId64 });
        
        // Fallback: If Steam hours are private, query BattleMetrics
        if (profileInfo && (profileInfo.rust_hours === null || profileInfo.rust_hours === undefined)) {
          const { useSettingsStore } = await import('../../stores/settings-store');
          const token = useSettingsStore.getState().battlemetricsToken;
          if (token) {
            try {
              const { findPlayerBySteamId, getPlayerProfile } = await import('../../utils/battlemetrics');
              const bmPlayer = await findPlayerBySteamId(token, steamId64);
              if (bmPlayer?.id) {
                const bmProfile = await getPlayerProfile(token, bmPlayer.id);
                if (bmProfile?.servers) {
                  const totalSeconds = bmProfile.servers.reduce((sum, s) => sum + (s.timePlayedSeconds || 0), 0);
                  const hours = totalSeconds / 3600;
                  if (hours > 0) {
                    profileInfo.rust_hours = hours;
                  }
                }
              }
            } catch (bmErr) {
              console.error("Failed BattleMetrics hours fallback for teammate:", bmErr);
            }
          }
        }
        
        setSteamProfile(profileInfo);

        // Fetch Rust statistics
        const rustStats = await invoke<any>('get_rust_member_stats', { steamId: steamId64 });
        setStats(rustStats);
      } else {
        setError('No Steam ID');
      }
    } catch (err) {
      setError('Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      fetchStats();
    }
  };

  const handleOpenProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    invoke('open_external_url', { url: `https://steamcommunity.com/profiles/${member.id}` }).catch(err => {
      console.error("Failed to open URL via Tauri shell:", err);
    });
  };

  const kills = stats?.kills || 0;
  const deaths = stats?.deaths || 0;
  const kd = kills / (deaths || 1);
  const hsRate = kills > 0 ? (stats?.headshots / kills) : 0;
  const accuracy = stats?.bullet_fired > 0 ? (stats?.bullet_hit / stats?.bullet_fired) : 0;
  const isPrivateOrUnsynced = stats && (stats.privacy === 'private' || (kills === 0 && deaths === 0 && stats.headshots === 0));

  return (
    <div 
      className={`member-card member-card--${member.status} ${expanded ? 'member-card--expanded' : ''}`} 
      onClick={handleToggle}
      style={{ cursor: 'pointer', transition: 'all 0.15s ease-in-out', display: 'flex', flexDirection: 'column' }}
    >
      <div className="member-card-header" style={{ marginBottom: (isOffline && !expanded) ? 0 : 8, width: '100%' }}>
        <div className="member-card-identity">
          <Avatar steamId={member.id} name={member.name} size={26} color={member.color} />
          <span className={`status-dot status-${member.status}`}></span>
          <span className={`member-name-text ${isSelf ? 'text-accent' : ''}`}>
            {member.name}
          </span>
          {member.isLeader && (
            <span className="leader-tag">LEAD</span>
          )}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isSelfLeader && !member.isLeader && !isSelf && (
            <button
              onClick={(e) => { e.stopPropagation(); handlePromote(member.id); }}
              title="Transfer Team Leader"
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px',
                transition: 'color 0.15s ease',
                marginRight: 2,
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ff9100'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)'}
            >
              <Crown size={12} />
            </button>
          )}

          {/* Grid location badge */}
          {!isOffline && (
            <span className={`grid-location-badge ${isDead ? 'location-dead' : ''}`}>
              {isDead ? 'DEAD' : member.grid || '??'}
            </span>
          )}
          {isOffline && (
            <span className="grid-location-badge location-offline">
              OFFLINE
            </span>
          )}
          {expanded ? <ChevronUp size={14} style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 4 }} /> : <ChevronDown size={14} style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 4 }} />}
        </div>
      </div>

      {/* Health Bar (Active when online or dead) */}
      {!isOffline && !expanded && (
        <div className="member-health-container">
          <div className="health-bar-bg">
            <div 
              className={`health-bar-fill ${isDead ? 'health-dead' : 'health-alive'}`}
              style={{ 
                width: `${member.health}%`,
                backgroundColor: isDead ? 'var(--color-danger)' : (member.health < 40 ? '#ef4444' : member.health < 75 ? '#f59e0b' : 'var(--color-success)')
              }}
            />
          </div>
          <span className="health-percentage-text">{Math.round(member.health)}% HP</span>
        </div>
      )}

      {/* Expanded Stats Section */}
      {expanded && (
        <div className="member-card-details" onClick={(e) => e.stopPropagation()} style={{
          marginTop: 6,
          padding: '8px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: 4,
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {!isOffline && (
            <div className="member-health-container" style={{ margin: '0 0 4px 0' }}>
              <div className="health-bar-bg" style={{ height: 6 }}>
                <div 
                  className={`health-bar-fill ${isDead ? 'health-dead' : 'health-alive'}`}
                  style={{ 
                    width: `${member.health}%`,
                    backgroundColor: isDead ? 'var(--color-danger)' : (member.health < 40 ? '#ef4444' : member.health < 75 ? '#f59e0b' : 'var(--color-success)')
                  }}
                />
              </div>
              <span className="health-percentage-text" style={{ fontSize: 9 }}>{Math.round(member.health)}% HP</span>
            </div>
          )}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 0' }}>
              <div className="camview-rec-dot" style={{ width: 8, height: 8, marginRight: 6 }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>FETCHING DATA...</span>
            </div>
          )}

          {error && (
            <div style={{ fontSize: 9, color: '#ef4444', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {!loading && !error && (stats || steamProfile) && (
            <>
              {/* Profile Overview Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                {/* Steam Hours */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={11} style={{ color: 'var(--color-accent)' }} />
                  <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>Hours:</span>
                  <span style={{ fontSize: 10, fontWeight: 'bold', color: '#fff', fontFamily: 'var(--font-mono)' }}>
                    {steamProfile?.rust_hours !== undefined && steamProfile?.rust_hours !== null
                      ? `${Math.round(steamProfile.rust_hours).toLocaleString()}`
                      : 'Private'}
                  </span>
                </div>

                {/* Steam Profile Button */}
                <button
                  onClick={handleOpenProfile}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff',
                    borderRadius: 4,
                    padding: '3px 6px',
                    fontSize: 9,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                >
                  <span>Steam Profile</span>
                  <ExternalLink size={9} />
                </button>
              </div>

              {/* Stats Grid */}
              {stats && (
                isPrivateOrUnsynced ? (
                  <div style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.05)',
                    border: '1px solid rgba(245, 158, 11, 0.15)',
                    borderRadius: 4,
                    padding: 6,
                    color: '#f59e0b',
                    fontSize: 9,
                    textAlign: 'center',
                  }}>
                    Stats Private / Unsynced
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 4,
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                    paddingTop: 6
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '4px 2px', borderRadius: 3 }}>
                      <span style={{ fontSize: 7, color: 'var(--color-text-dim)', letterSpacing: '0.2px' }}>K/D RATIO</span>
                      <span style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>{kd.toFixed(2)}</span>
                      <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>{kills}K/{deaths}D</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '4px 2px', borderRadius: 3 }}>
                      <span style={{ fontSize: 7, color: 'var(--color-text-dim)', letterSpacing: '0.2px' }}>HEADSHOT</span>
                      <span style={{ fontSize: 10, fontWeight: 'bold', color: '#10b981', fontFamily: 'var(--font-mono)' }}>{(hsRate * 100).toFixed(1)}%</span>
                      <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>{stats.headshots} HS</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '4px 2px', borderRadius: 3 }}>
                      <span style={{ fontSize: 7, color: 'var(--color-text-dim)', letterSpacing: '0.2px' }}>ACCURACY</span>
                      <span style={{ fontSize: 10, fontWeight: 'bold', color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>{(accuracy * 100).toFixed(1)}%</span>
                      <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>{stats.bullet_hit} hits</span>
                    </div>
                  </div>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function TeamPanel() {
  const members = useTeamStore((state) => state.members);
  const selfSteamId = useTeamStore((state) => state.selfSteamId);

  const selfMember = members.find(m => m.id === selfSteamId || m.isSelf || m.name === 'You');
  const isSelfLeader = selfMember?.isLeader || false;

  const handlePromote = async (teammateId: string) => {
    try {
      await invoke('promote_to_leader', { steamId: teammateId });
    } catch (err) {
      console.error("Failed to transfer leadership:", err);
    }
  };

  return (
    <div className="team-panel hud-panel glass-panel">
      <div className="panel-header">
        <span className="hud-label text-accent">TEAM CONTROL CENTER</span>
        <span className="hud-label status-indicator">
          <span className="status-dot status-online"></span>
          {members.filter(m => m.status === 'online').length} / {members.length} ACTIVE
        </span>
      </div>
      
      <div className="panel-content">
        {/* Left Side: Teammates List */}
        <div className="member-list-section">
          <div className="section-title hud-label">ROSTER STATUS</div>
          <div className="member-list-scroll scrollable">
            {members.length === 0 ? (
              <div className="member-list-empty text-dim">No team members detected.</div>
            ) : (
              members.map((member) => (
                <TeammateCard 
                  key={member.id}
                  member={member}
                  selfSteamId={selfSteamId}
                  isSelfLeader={isSelfLeader}
                  handlePromote={handlePromote}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Side: Team Radio Chat */}
        <div className="chat-section-wrap">
          <TeamChat />
        </div>
      </div>
    </div>
  );
}
