import Link from "next/link";
import { BackBar } from "@/lib/ui";

export const metadata = { title: "Terms · Late Ice" };

const UPDATED = "November 6, 2026";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-black text-[17px]">{title}</h2>
      <div className="text-sm text-[var(--mute)] mt-1.5 space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

/** Plain terms. Keep them true to what the app does today; change this page when the app changes. */
export default function TermsPage() {
  return (
    <article data-testid="page-terms">
      <BackBar href="/" title="Late Ice" />
      <h1 className="text-[28px] leading-tight font-black">Terms</h1>
      <p className="text-xs text-[var(--mute)] mt-2">
        Updated {UPDATED}. Questions: <a className="text-[var(--blue)]" href="mailto:support@tangomike.app">support@tangomike.app</a>
        {" · "}
        <Link href="/privacy" className="text-[var(--blue)] underline" data-testid="link-privacy">Privacy</Link>
      </p>

      <Block title="Who it's for">
        <p>Late Ice is a free app for adult rec hockey players. You need to be 18 or older to join.</p>
        <p>Late Ice is not run by your rink or your league. If a score or a stat here disagrees with the rink's official record, the rink's record is the one that counts.</p>
      </Block>

      <Block title="Scoresheet photos">
        <p>When you photograph a scoresheet, an AI model reads it to pull out the score, goals, assists and penalties. The captains then check that read before the game counts.</p>
        <p>The photo is kept private. Only the captains and assistant captains of the two teams, and league or rink staff, can open it. We don't sell photos or data, and there are no ads.</p>
        <p>The photo is deleted 90 days after the game is confirmed. The score and stats stay.</p>
      </Block>

      <Block title="Names">
        <p>Rosters can come from the rink's own stats page, so your name may be here before you join. Until you claim your spot, people outside your rink see only initials and your number.</p>
        <p>Once you claim it, your profile name shows. You can hide it in Settings, and then you show as "Player" and your number.</p>
      </Block>

      <Block title="Ratings and mistakes">
        <p>The Late Ice Rating is an estimate built from game results. It is for fun and for finding fair teams, not an official ranking.</p>
        <p>If a game was read or entered wrong, tell your captain, your league commissioner, or email us. When the game is fixed, ratings correct themselves the next night.</p>
      </Block>

      <Block title="Using it fairly">
        <p>Use your real name for yourself and keep team names and anything you type fit for a rink lobby. Don't upload anything that isn't a scoresheet, and don't use the app to bother other players. We can remove content or accounts that break these rules.</p>
      </Block>

      <Block title="Leaving">
        <p>You can delete your account in Settings, or email us and we'll do it. Your name comes off and your old game lines stay as "Player" and your number, so past scores don't change. You can also download a copy of your data in Settings.</p>
      </Block>

      <Block title="The fine print">
        <p>Late Ice is provided as it is, without promises that it will always be available or error-free. We may change these terms; the date at the top shows the latest version, and continuing to use the app means you accept it.</p>
      </Block>
    </article>
  );
}
