import Link from "next/link";
import { SiteShell, Display, Panel, siteBase, appBase } from "@/site/Site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Late Ice for captains", description: "Who's in, the lineup and the scoresheet, in one place. Send your team one link." };

const items = [
  ["Who's in for Sunday", "Everyone taps In, Late or Out. You see the count and who hasn't answered, without chasing the group chat."],
  ["The lineup", "Build lines from who's in and share them before puck drop."],
  ["Snap the sheet", "One photo of the scoresheet after the game. Goals, assists and penalties land on everyone's stats, and the other captain confirms."],
  ["One link for the team", "Send it in your group chat. Teammates sign up and land on their own roster spot, no approval step."],
  ["Subs", "Short a player? Ask for a sub and see who's available at your level."],
  ["Fair ratings", "Every player gets a rating that moves with each game, so new players get placed on the right team."],
];

export default async function ForCaptains() {
  const [base, app] = await Promise.all([siteBase(), appBase()]);
  return (
    <SiteShell>
      <section className="max-w-6xl mx-auto px-6 pt-14 pb-10">
        <div className="font-bold text-[#ff8a8a]">For team captains</div>
        <Display className="text-[56px] sm:text-[76px] mt-2 max-w-4xl">Run your team from one link.</Display>
        <p className="text-lg text-[#c3ccd8] leading-relaxed mt-5 max-w-2xl">Late Ice keeps who&apos;s in, the lineup and the scoresheet in one place, and your teammates see their stats without you doing anything extra.</p>
        <div className="flex gap-3 mt-7 flex-wrap">
          <a href={`${app}/join`} className="text-white bg-[#e0262b] hover:bg-[#ec3035] font-bold rounded-2xl px-6 py-4">Start with your team</a>
          <Link href={`${base}/rinks`} className="bg-[#151c28] hover:bg-[#1b2433] font-bold rounded-2xl px-6 py-4">Tell your rink about it</Link>
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-6 py-6 grid gap-4 md:grid-cols-3">
        {items.map(([t, d]) => <Panel key={t}><h2 className="text-lg font-black">{t}</h2><p className="text-[#c3ccd8] mt-2 leading-relaxed">{d}</p></Panel>)}
      </section>
      <section className="max-w-6xl mx-auto px-6 py-10">
        <Panel hero className="p-8"><h2 className="text-2xl font-black">Free for players and captains</h2><p className="text-[#d4dce6] mt-2 max-w-2xl leading-relaxed">If your rink isn&apos;t on Late Ice yet, open the app and tell us which rink you play at. We&apos;ll reach out to them.</p></Panel>
      </section>
    </SiteShell>
  );
}
