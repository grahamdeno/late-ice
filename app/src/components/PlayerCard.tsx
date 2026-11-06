"use client";
import { Link } from "@/lib/router";
import { Bobble } from "@/components/Bobble";
import { ARCHETYPE_LABEL } from "@/components/Archetypes";
import { POSITION_LABEL } from "@/lib/auth";
import { TeamBadge, fmtRating, tierOf } from "@/lib/ui";

export interface CardTeam { id: number; name: string; color: string; logo?: string | null; number?: string | null }
export interface CardBadge { label: string; detail?: string }

/**
 * The player card: who, what kind of player, how good, which way it's going.
 * Avatar, name, archetype and team on top; the rating with its five-game move and tier; up to three badges.
 * Everything else about a player lives below the card.
 */
export function PlayerCard({
  name, avatar, position, archetype, teams, rating, trend5, gamesRated, badges = [], unclaimed = false, ratingHref, action,
}: {
  name: string; avatar?: any; position?: string | null; archetype?: string | null; teams: CardTeam[]; rating: number | null;
  trend5?: number | null; gamesRated?: number; badges?: CardBadge[]; unclaimed?: boolean; ratingHref?: string; action?: React.ReactNode;
}) {
  const main = teams[0];
  const provisional = (gamesRated ?? 0) < 5;
  const tier = tierOf(rating);
  const up = (trend5 ?? 0) >= 0;
  const ratingBlock = (
    <span className="flex items-end gap-3">
      <span className="font-display text-[48px] leading-[0.9] tnum" data-testid="text-card-rating">{fmtRating(rating)}</span>
      <span className="pb-1">
        {trend5 !== null && trend5 !== undefined && Math.abs(trend5) >= 0.0005 && (
          <span className={`block text-sm font-bold tnum ${up ? "up" : "down"}`} aria-label={`${up ? "Up" : "Down"} ${Math.abs(trend5).toFixed(3)} over the last five games`}>
            {up ? "▲" : "▼"} {Math.abs(trend5).toFixed(3)} <span className="text-[var(--mute)] font-medium">last 5</span>
          </span>
        )}
        <span className="block text-xs text-[var(--mute)]">{tier ? `${tier}` : "Not rated yet"}{provisional && rating !== null ? ` · provisional, ${Math.max(0, 5 - (gamesRated ?? 0))} to go` : ""}</span>
      </span>
    </span>
  );
  return (
    <div className="card-hi p-4" data-testid="card-player">
      <div className="flex items-start gap-3">
        <Bobble avatar={avatar} jersey={main?.color} number={main?.number ?? null} archetype={archetype ?? null} goalie={position === "G"} size={60} label={`${name}'s bobblehead`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h1 className="font-black text-[22px] leading-tight min-w-0 break-words" data-testid="text-player-name">{name}</h1>
            {action}
          </div>
          <div className="text-[13px] text-[var(--mute)] mt-0.5">
            {archetype ? <span className="font-bold text-[var(--white)]" data-testid="text-card-archetype">{ARCHETYPE_LABEL[archetype] ?? archetype}</span> : null}
            {archetype && position ? " · " : ""}{position ? POSITION_LABEL[position] ?? position : ""}
            {unclaimed ? " · Unclaimed" : ""}
          </div>
          {teams.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {teams.slice(0, 3).map((t) => (
                <Link key={t.id} href={`/team/${t.id}`} className="chip h-7 text-xs" data-testid={`link-card-team-${t.id}`}>
                  <TeamBadge team={t as any} size={16} /> <span className="truncate max-w-[140px]">{t.name}</span>{t.number ? <span className="text-[var(--mute)]">#{t.number}</span> : null}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4">
        <div className="label mb-1">Late Ice Rating</div>
        {ratingHref ? <Link href={ratingHref} className="block" data-testid="link-card-rating">{ratingBlock}</Link> : ratingBlock}
      </div>
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3" data-testid="card-badges">
          {badges.slice(0, 3).map((b, i) => (
            <span key={i} className="chip h-7 text-[11px]" title={b.detail}><span className="font-black text-[var(--amber)] uppercase tracking-wide">{b.label}</span></span>
          ))}
        </div>
      )}
    </div>
  );
}
