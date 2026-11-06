import Link from "next/link";
import { SiteShell, Display, Panel, liveRinks, siteBase, appBase } from "@/site/Site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Late Ice for rinks", description: "Your adult leagues on every player's phone. Keep DaySmart. Claim your rink." };

const steps = [
  ["Bring your leagues in", "Upload a DaySmart standings report. Teams, rosters, schedules and results come in at once. Many rinks are already here from their public reports."],
  ["Captains snap the sheet", "A photo of the paper scoresheet becomes goals, assists, penalties and lineups. The other captain confirms before it counts."],
  ["Players get a fair rating", "Every game moves a player's rating, and they can see why. It helps you place new players and balance teams."],
];
const desk = [
  ["One inbox", "Sign-ups, scans to review, disputes and goalie numbers in one list."],
  ["Rosters and lineups in tables", "Edit many players at once, check the changes, then save."],
  ["Seasons and leagues", "Create, rename or archive. History is never lost."],
  ["Your staff", "Add scorekeepers and commissioners. Every change is in the audit log."],
];
const faq = [
  ["Do we have to stop using DaySmart?", "No. Keep scheduling and billing where they are. Late Ice reads the reports you already have."],
  ["What does it cost?", "Founding rinks pay nothing through the current season. We'll agree on pricing together before the next one, and you can walk away then."],
  ["How do player names show publicly?", "First name and last initial until a player claims their spot, and anyone can hide their name."],
  ["What if a scoresheet is read wrong?", "Both captains confirm before a game counts, and your staff settle disputes."],
  ["Who can change our leagues?", "Only staff you add. Captains manage their own team. Every change is logged."],
];

export default async function ForRinks() {
  const [base, app, rinks] = await Promise.all([siteBase(), appBase(), liveRinks()]);
  return (
    <SiteShell>
      <section className="max-w-6xl mx-auto px-6 pt-14 pb-10">
        <div className="font-bold text-[#ff8a8a]">For rink managers and league commissioners</div>
        <Display className="text-[56px] sm:text-[76px] mt-2 max-w-4xl">Your rink may already be on Late Ice.</Display>
        <p className="text-lg text-[#c3ccd8] leading-relaxed mt-5 max-w-2xl">We build each rink&apos;s leagues from its public standings. Find yours, see it working, and claim it. Then you decide what players see, add your staff, and turn on scoresheets.</p>
      </section>

      <section className="max-w-6xl mx-auto px-6" aria-label="Rinks on Late Ice">
        <div className="grid gap-3 md:grid-cols-2">
          {rinks.map((r) => (
            <div key={r.id} className="flex items-center gap-4 rounded-[20px] bg-[#151c28] p-5" data-testid={`site-rink-${r.id}`}>
              <span className="flex-1 min-w-0"><span className="block font-black text-lg truncate">{r.name}</span><span className="block text-sm text-[#8b97a8]">{[r.city, r.state].filter(Boolean).join(", ")} · {r.leagues} leagues · {r.teams} teams · {r.players} players</span></span>
              <a href={`${app}/`} className="font-bold text-sm text-[#8cc4ff] shrink-0">See it</a>
              <Link href={`${base}/claim?rink=${r.id}`} className="font-bold text-sm text-white bg-[#e0262b] hover:bg-[#ec3035] rounded-xl px-4 py-3 shrink-0">Claim</Link>
            </div>
          ))}
          <Link href={`${base}/claim`} className="flex items-center gap-4 rounded-[20px] bg-[#0d1219] hover:bg-[#151c28] p-5">
            <span className="flex-1"><span className="block font-black text-lg">Your rink isn&apos;t listed?</span><span className="block text-sm text-[#8b97a8]">Tell us about it and send one DaySmart report. We&apos;ll set it up.</span></span>
            <span className="font-bold text-[#8cc4ff]">Add your rink ›</span>
          </Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-14">
        <Panel hero className="flex flex-wrap items-center gap-6 p-8">
          <div className="flex-[1_1_420px]">
            <h2 className="text-3xl font-black">Founding rinks: free through the season</h2>
            <p className="text-[#d4dce6] mt-3 leading-relaxed max-w-2xl">We&apos;re taking a small number of founding rinks. You get everything at no cost through the current season, a direct line to us, and a say in what we build next. Before next season we agree on a price together, or you walk away.</p>
          </div>
          <Link href={`${base}/claim`} className="text-white bg-[#e0262b] hover:bg-[#ec3035] font-bold rounded-2xl px-6 py-4">Become a founding rink</Link>
        </Panel>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-6">
        <h2 className="text-3xl font-black">How it works</h2>
        <div className="grid gap-4 md:grid-cols-3 mt-5">
          {steps.map(([t, d], i) => (
            <Panel key={t}><div className="font-display text-[40px] text-[#ff8a8a] leading-none">{i + 1}</div><h3 className="text-lg font-black mt-3">{t}</h3><p className="text-[#c3ccd8] mt-2 leading-relaxed">{d}</p></Panel>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-10">
        <h2 className="text-3xl font-black">Rink Desk, for the people running the league</h2>
        <p className="text-[#c3ccd8] text-lg mt-3 max-w-3xl">A desktop workspace for rink managers and commissioners. Everything players see on their phones, managed from one screen.</p>
        <div className="grid gap-3 md:grid-cols-2 mt-5">
          {desk.map(([t, d]) => <div key={t} className="rounded-[18px] bg-[#0d1219] p-5"><b>{t}</b><div className="text-[#c3ccd8] mt-1">{d}</div></div>)}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-10">
        <h2 className="text-3xl font-black">Questions rinks ask</h2>
        <dl className="grid gap-6 md:grid-cols-2 mt-5">
          {faq.map(([qn, a]) => <div key={qn}><dt className="font-black">{qn}</dt><dd className="text-[#c3ccd8] mt-1 leading-relaxed">{a}</dd></div>)}
        </dl>
        <div className="mt-10"><Link href={`${base}/claim`} className="text-white bg-[#e0262b] hover:bg-[#ec3035] font-bold rounded-2xl px-6 py-4 inline-block">Claim your rink</Link></div>
      </section>
    </SiteShell>
  );
}
