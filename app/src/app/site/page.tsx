import Link from "next/link";
import { SiteShell, Display, Panel, Phone, liveRinks, siteBase, appBase } from "@/site/Site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Late Ice · Beer league hockey, counted", description: "Standings, stats and a fair rating for every adult league hockey player, from the games your rink already runs." };

export default async function SiteHome() {
  const [base, app, rinks] = await Promise.all([siteBase(), appBase(), liveRinks()]);
  return (
    <SiteShell>
      <section className="max-w-6xl mx-auto px-6 pt-14 pb-12 flex flex-wrap gap-12 items-center">
        <div className="flex-[1_1_460px]">
          <div className="font-bold text-[#ff8a8a]">Adult league hockey</div>
          <Display className="text-[64px] sm:text-[80px] mt-2">Every game counts. Even the 11:15.</Display>
          <p className="text-lg text-[#c3ccd8] leading-relaxed mt-5 max-w-xl">Standings, schedules, stats and a fair rating for every player, built from the games your rink already runs. Your captain snaps the scoresheet. Late Ice does the rest.</p>
          <div className="flex gap-3 mt-7 flex-wrap">
            <a href={`${app}/`} className="text-white bg-[#e0262b] hover:bg-[#ec3035] font-bold rounded-2xl px-6 py-4">Find your league</a>
            <Link href={`${base}/rinks`} className="bg-[#151c28] hover:bg-[#1b2433] font-bold rounded-2xl px-6 py-4">Run a rink? Start here</Link>
          </div>
        </div>
        <div className="flex-[1_1_380px] flex gap-4 justify-center">
          <Phone>
            <div className="rounded-[22px] bg-[#14294a] p-4"><div className="text-xs text-[#b9c6d6] font-bold">Next game</div><div className="font-black text-lg mt-1">Sun · 6:00 PM</div><div className="text-sm text-[#b9c6d6]">vs Whiskey Dekes</div>
              <div className="grid grid-cols-3 gap-1 mt-3 text-xs font-bold text-center"><span className="rounded-lg py-2 bg-[rgba(56,217,150,.2)] text-[#38d996]">In</span><span className="rounded-lg py-2 bg-[#1f2836]">Late</span><span className="rounded-lg py-2 bg-[#1f2836]">Out</span></div></div>
            <div className="rounded-[18px] bg-[#151c28] p-3.5 mt-2.5 text-sm"><div className="text-xs text-[#8b97a8] font-bold">C League</div>
              <div className="flex justify-between mt-2"><span>Hammer&apos;d Heads</span><b>16</b></div><div className="flex justify-between mt-1.5 text-[#c3ccd8]"><span>Seal Team Sticks</span><b>14</b></div><div className="flex justify-between mt-1.5 text-[#c3ccd8]"><span>Whiskey Dekes</span><b>12</b></div></div>
          </Phone>
          <div className="mt-12 hidden sm:block"><Phone>
            <div className="rounded-[22px] bg-[#14294a] p-4"><div className="text-xs text-[#b9c6d6] font-bold">Late Ice rating</div><div className="font-display text-[52px] leading-none">4.00</div><div className="text-xs text-[#b9c6d6]">C level · 10 games</div></div>
            <div className="rounded-[18px] bg-[#151c28] p-3.5 mt-2.5 text-sm"><div className="text-xs text-[#8b97a8] font-bold">Why it moved</div><div className="mt-2">Win 6-1 vs a weaker team <span className="text-[#38d996]">+0.03</span></div><div className="mt-1.5">Win 6-0, one assist <span className="text-[#38d996]">+0.03</span></div></div>
          </Phone></div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-10 grid gap-4 md:grid-cols-3">
        <Panel><h2 className="text-xl font-black">Players</h2><p className="text-[#c3ccd8] mt-2 leading-relaxed">Your stats and a rating that moves with every game, with the reason it moved. Free.</p><a href={`${app}/`} className="inline-block mt-4 font-bold text-[#8cc4ff]">Find your league ›</a></Panel>
        <Panel><h2 className="text-xl font-black">Captains</h2><p className="text-[#c3ccd8] mt-2 leading-relaxed">Who&apos;s in for Sunday, the lineup, and the scoresheet in one place. Send your team one link.</p><Link href={`${base}/captains`} className="inline-block mt-4 font-bold text-[#8cc4ff]">For captains ›</Link></Panel>
        <Panel hero><h2 className="text-xl font-black">Rinks</h2><p className="text-[#d4dce6] mt-2 leading-relaxed">Your leagues on every player&apos;s phone, without changing how you schedule or bill.</p><Link href={`${base}/rinks`} className="inline-block mt-4 font-bold text-white">For rinks ›</Link></Panel>
      </section>

      {rinks.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 py-10">
          <h2 className="text-3xl font-black">Live now</h2>
          <div className="grid gap-3 mt-5 md:grid-cols-2">
            {rinks.map((r) => (
              <a key={r.id} href={`${app}/`} className="flex items-center gap-4 rounded-[20px] bg-[#151c28] hover:bg-[#1b2433] p-5">
                <span className="flex-1"><span className="block font-black text-lg">{r.name}</span><span className="block text-sm text-[#8b97a8]">{[r.city, r.state].filter(Boolean).join(", ")}</span></span>
                <span className="text-right text-sm text-[#c3ccd8]"><b className="text-white">{r.leagues}</b> leagues · <b className="text-white">{r.teams}</b> teams</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </SiteShell>
  );
}
