import Link from "next/link";
import { SiteShell, Display, siteBase } from "@/site/Site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thanks · Late Ice" };

export default async function Thanks() {
  const base = await siteBase();
  return (
    <SiteShell>
      <section className="max-w-3xl mx-auto px-6 pt-16 pb-24" data-testid="claim-thanks">
        <Display className="text-[56px]">Got it. Thanks.</Display>
        <p className="text-lg text-[#c3ccd8] mt-4 leading-relaxed">We&apos;ll reach out within a day to confirm you work at the rink and set up your access. If you run leagues on DaySmart, have a standings report handy.</p>
        <Link href={base || "/"} className="inline-block mt-8 font-bold text-[#8cc4ff]">Back to Late Ice</Link>
      </section>
    </SiteShell>
  );
}
