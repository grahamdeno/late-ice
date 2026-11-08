"use client";
import { Link } from "@/lib/router";
import { BackBar } from "@/lib/ui";
import { SUPPORT_EMAIL } from "@/lib/contact";

const UPDATED = "November 5, 2026";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-black text-[17px]">{title}</h2>
      <div className="text-sm text-[var(--mute)] mt-1.5 space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

/** Terms and privacy, in plain words. */
export default function Legal() {
  return (
    <div>
      <BackBar href="/me" to="Profile" />
      <h1 className="font-display text-[40px] leading-none font-black uppercase">Terms and privacy</h1>
      <p className="text-xs text-[var(--mute)] mt-2">Updated {UPDATED}. Questions: <a className="text-[var(--blue)]" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>

      <Block title="What Late Ice is">
        <p>A free app for adult rec hockey. Players and staff scan scoresheets, keep rosters and schedules, and see stats and a rating. Late Ice isn't run by any rink or league, and a rink's official records win over ours.</p>
      </Block>

      <Block title="What we keep">
        <p>Your email (to sign you in), the name, number, position and home rink you enter, your availability answers, and your teammates' votes.</p>
        <p>Game data: scoresheet photos, the goals, assists and penalties read from them, and results imported from league pages. Schedules from a team calendar link a captain connects (the link itself stays private).</p>
      </Block>

      <Block title="Names">
        <p>A roster spot nobody has claimed shows a first name and last initial. Anyone can hide a name, and you can hide yours on your profile, which shows "Player #" instead. Captains and support staff can still see names to run the team.</p>
      </Block>

      <Block title="Who handles it">
        <p>The app runs on Vercel and stores data with Supabase. Sign-in emails go through Resend. Scoresheet photos are read by Anthropic's Claude to pull out the stats. Each handles the data only to do that job. We don't sell your data or show ads.</p>
        <p>A backup of the database is kept for 30 days in private storage.</p>
      </Block>

      <Block title="Your choices">
        <p>Change your profile any time. To remove your account, email support. The roster name becomes Player and your number, and game lines stay. The <Link href="/terms" className="underline" data-testid="link-terms">terms</Link> cover age, photos, disputes and removal.</p>
      </Block>

      <Block title="Fair play">
        <p>Scan real sheets, claim only your own spot, and vote on each other's player type in good fun. We may remove scans, claims or accounts that are fake or abusive. Scanning has daily and monthly limits so the app stays free.</p>
      </Block>

      <Block title="No warranty">
        <p>Stats and ratings are best effort and can be wrong. Late Ice is provided as is. Hockey is a contact sport; nothing here is advice about playing it.</p>
      </Block>
    </div>
  );
}
