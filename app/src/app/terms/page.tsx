import Link from "next/link";
import { BackBar } from "@/lib/ui";

export const metadata = { title: "Terms · Late Ice" };

const UPDATED = "November 5, 2026";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-black text-[17px]">{title}</h2>
      <div className="text-sm text-[var(--mute)] mt-1.5 space-y-2 leading-relaxed">{children}</div>
    </section>
  );
}

/** Plain terms. Claude reviews this wording before it ships. */
export default function TermsPage() {
  return (
    <article data-testid="page-terms">
      <BackBar href="/join" title="Join" />
      <h1 className="font-display text-[40px] leading-none font-black uppercase">Terms</h1>
      <p className="text-xs text-[var(--mute)] mt-2">
        Updated {UPDATED}. Questions: <a className="text-[var(--blue)]" href="mailto:support@tangomike.app">support@tangomike.app</a>
        {" · "}
        <Link href="/privacy" className="text-[var(--blue)] underline" data-testid="link-privacy">Privacy</Link>
      </p>

      <Block title="Who can use Late Ice">
        <p>Late Ice is a free app for adult rec hockey. You need to be 18 or older to join. The join form asks you to confirm that, and the server refuses a profile without it.</p>
        <p>Late Ice is not your rink and not your league. If a number here and the rink&apos;s official record disagree, the rink&apos;s record wins.</p>
      </Block>

      <Block title="Scoresheet photos">
        <p>A player or a captain can photograph a paper scoresheet. The photo is used to read the score, the goals, the assists and the penalties, and so the people confirming the game can check that read.</p>
        <p>The photo is stored in a private bucket. The people who can open it are the ones who can confirm that game: captains and assistants of the two teams, and league or rink staff. A model reads the photo to pull out the stats. We do not sell photos, and the app does not show ads.</p>
        <p>The nightly job deletes the stored photo once the sheet has been confirmed for more than 90 days. The extracted stats and the game result stay. If a delete fails, the photo stays until a later run succeeds, and the app records the delete only after the file is gone.</p>
      </Block>

      <Block title="Names">
        <p>A roster spot nobody has claimed is shown to signed-out visitors as initials and a number, in the style J. M. #12. A signed-in player whose home rink, team or staff role is that same rink sees the shorter name the app already uses, usually a first name and a last initial. A signed-in player at a different rink sees the initials form.</p>
        <p>A player who has claimed the spot shows the name on their profile, unless they have hidden it. A hidden name shows as Player and the number.</p>
      </Block>

      <Block title="Disputes">
        <p>You can dispute a game in the app within 72 hours of it being confirmed. A league commissioner or a rink manager resolves it. Ratings are not edited by hand. Fixing the game fixes the rating on the next nightly replay.</p>
      </Block>

      <Block title="Removal">
        <p>You can ask for your account to be removed by emailing support@tangomike.app, or with the account delete request when it is offered in the app. The roster name becomes Player and your number. Game lines stay, so old scores do not change.</p>
        <p>The sign-in record is removed when the sign-in service accepts that request. Refresh sessions are revoked when that service accepts the sign-out. An existing access token can keep working until it expires. Removal does not make that token die the same second.</p>
      </Block>

      <Block title="Contact">
        <p>Email support@tangomike.app. The <Link href="/privacy" className="underline">privacy page</Link> says what else the app stores.</p>
      </Block>
    </article>
  );
}
