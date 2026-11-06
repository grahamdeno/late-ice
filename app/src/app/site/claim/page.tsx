import { SiteShell, Display, liveRinks, siteBase } from "@/site/Site";
import { ClaimForm } from "@/site/ClaimForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Claim your rink · Late Ice" };

export default async function Claim({ searchParams }: { searchParams: Promise<{ rink?: string }> }) {
  const [base, rinks, sp] = await Promise.all([siteBase(), liveRinks(), searchParams]);
  const initial = Number(sp?.rink) || null;
  return (
    <SiteShell>
      <section className="max-w-6xl mx-auto px-6 pt-12 pb-16 flex flex-wrap gap-10">
        <div className="flex-[999_1_560px] min-w-0">
          <div className="font-bold text-[#ff8a8a]">Rinks</div>
          <Display className="text-[48px] sm:text-[60px] mt-2">Claim your rink</Display>
          <p className="text-[#c3ccd8] mt-3 mb-6 max-w-xl">Pick your rink if it&apos;s live, or add a new one. It takes a minute.</p>
          <ClaimForm rinks={rinks} initialRink={initial && rinks.some((r) => r.id === initial) ? initial : null} thanksHref={`${base}/claim/thanks`} />
        </div>
        <aside className="flex-[1_1_300px]">
          <h2 className="text-xl font-black">What happens next</h2>
          <ol className="list-decimal pl-5 text-[#c3ccd8] leading-relaxed mt-3 space-y-2">
            <li>We confirm you work at the rink, usually within a day.</li>
            <li>You get staff access and a walk-through of your leagues.</li>
            <li>Not live yet? Send one DaySmart standings report and we set your leagues up.</li>
            <li>Share one link with your captains. Players join and claim their spots.</li>
          </ol>
          <div className="rounded-[18px] bg-[#0d1219] p-5 mt-6 text-[#c3ccd8]">Rather talk first? Email <a className="text-[#8cc4ff] font-bold" href="mailto:support@tangomike.app">support@tangomike.app</a></div>
        </aside>
      </section>
    </SiteShell>
  );
}
