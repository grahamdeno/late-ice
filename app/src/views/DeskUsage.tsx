"use client";
import { useQuery } from "@tanstack/react-query";
import { DeskFrame, Gate, day } from "@/views/Desk";

/** Usage across every rink, for admins: who's using Late Ice, week by week, and per rink. */

type Week = { week: string; active: number; signups: number; scans: number; confirms: number; rsvps: number };
type Rink = { id: number; name: string; teams: number; roster: number; joined: number; games28: number; active7: number };
type Data = { weeks: Week[]; rinks: Rink[]; totals: { users: number; active7: number; active28: number; scans28: number } };

const SERIES: { key: keyof Week; label: string }[] = [
  { key: "active", label: "Active players" },
  { key: "signups", label: "New sign-ups" },
  { key: "scans", label: "Scoresheets scanned" },
  { key: "rsvps", label: "In / out answers" },
];

export function DeskUsage() {
  return <Gate>{() => <UsageBody />}</Gate>;
}

function Bars({ weeks, k }: { weeks: Week[]; k: keyof Week }) {
  const max = Math.max(1, ...weeks.map((w) => Number(w[k])));
  return (
    <div className="flex items-end gap-1.5 h-24 mt-3" role="img" aria-label={weeks.map((w) => `${day(w.week)}: ${w[k]}`).join(", ")}>
      {weeks.map((w, i) => (
        <div key={w.week} className="flex-1 flex flex-col items-center justify-end h-full" title={`Week of ${day(w.week)}: ${w[k]}`}>
          <span className="text-[10px] tnum text-[var(--mute)] mb-1">{w[k]}</span>
          <span className="w-full rounded-t-md" style={{ height: `${Math.max(3, (Number(w[k]) / max) * 100)}%`, background: i === weeks.length - 1 ? "var(--red)" : "var(--blue)", opacity: i === weeks.length - 1 ? 1 : 0.7 }} />
        </div>
      ))}
    </div>
  );
}

function UsageBody() {
  const { data, error } = useQuery<Data>({ queryKey: ["/api/desk/usage"], retry: false });
  return (
    <DeskFrame>
      <h1 className="font-black text-[28px]">Usage</h1>
      <p className="text-[var(--mute)] mt-1">Every rink, week by week. The red bar is this week so far.</p>
      {error && <p className="text-sm down mt-4" data-testid="text-error">{(error as any).message}</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 mt-6" data-testid="usage-totals">
            {[["Accounts", data.totals.users], ["Active, last 7 days", data.totals.active7], ["Active, last 28 days", data.totals.active28], ["Scans, last 28 days", data.totals.scans28]].map(([label, n]) => (
              <div key={label as string} className="card p-5">
                <div className="font-display font-black text-[40px] leading-none">{n}</div>
                <div className="text-sm text-[var(--mute)] mt-2">{label}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-3.5 mt-3.5 md:grid-cols-2">
            {SERIES.map((s) => (
              <div key={s.key} className="card p-5">
                <div className="font-bold">{s.label}</div>
                <Bars weeks={data.weeks} k={s.key} />
                <div className="flex justify-between text-[10px] text-[var(--mute)] mt-1"><span>{day(data.weeks[0]?.week ?? null)}</span><span>This week</span></div>
              </div>
            ))}
          </div>
          <h2 className="font-black text-lg mt-8">Rinks</h2>
          <div className="card mt-3 overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-usage-rinks">
              <thead><tr className="text-left text-[var(--mute)] border-b border-[var(--line)]">
                <th className="label px-5 py-3">Rink</th><th className="label px-3 py-3">Teams</th><th className="label px-3 py-3">Signed up</th>
                <th className="label px-3 py-3">Active, 7 days</th><th className="label px-3 py-3">Games, 28 days</th>
              </tr></thead>
              <tbody className="divide-y divide-[var(--line)]">
                {data.rinks.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 font-bold">{r.name}</td>
                    <td className="px-3 py-3 tnum">{r.teams}</td>
                    <td className="px-3 py-3 tnum">{r.joined}/{r.roster} <span className="text-[var(--mute)]">({r.roster ? Math.round((r.joined / r.roster) * 100) : 0}%)</span></td>
                    <td className="px-3 py-3 tnum">{r.active7}</td>
                    <td className="px-3 py-3 tnum">{r.games28}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </DeskFrame>
  );
}
