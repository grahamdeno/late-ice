import Link from "next/link";
import { BackBar } from "@/lib/ui";
import { SUPPORT_EMAIL } from "@/lib/contact";

export const metadata = { title: "Help · Late Ice", description: "Answers to the questions players and captains ask most." };

function Q({ q, children, id }: { q: string; children: React.ReactNode; id: string }) {
  return (
    <details className="card mt-2.5 group" id={id} data-testid={`help-${id}`}>
      <summary className="px-4 py-3.5 font-bold cursor-pointer list-none flex items-center gap-3">
        <span className="flex-1">{q}</span><span className="text-[var(--mute)] group-open:rotate-90 transition-transform">›</span>
      </summary>
      <div className="px-4 pb-4 text-sm text-[var(--mute)] space-y-2 leading-relaxed">{children}</div>
    </details>
  );
}

/** Short answers. Keep them true to what the app does; change this page when the app changes. */
export default function HelpPage() {
  return (
    <article data-testid="page-help">
      <BackBar href="/" to="Late Ice" />
      <h1 className="text-[28px] leading-tight font-black">Help</h1>
      <p className="text-sm text-[var(--mute)] mt-2">Short answers to what people ask most. Still stuck? <a className="text-[var(--blue)]" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>

      <h2 className="label mt-7">Getting started</h2>
      <Q id="join" q="How do I get on my team?">
        <p>The quickest way is your captain's invite link: open it, sign in with your email, and you land on the roster.</p>
        <p>No link? Sign in and find your name on your team's roster, then tap Claim. Your captain sees the claim, and staff let you in if you're new.</p>
      </Q>
      <Q id="install" q="How do I put Late Ice on my home screen?">
        <p><b>iPhone:</b> open the app in Safari, tap the Share button, then Add to Home Screen. Notifications on iPhone only work from the home-screen app.</p>
        <p><b>Android:</b> open it in Chrome, tap the menu, then Install app or Add to Home screen.</p>
      </Q>
      <Q id="notifications" q="How do I turn notifications on or off?">
        <p>Your profile, then Settings. Pick which ones you want: game day, results, sub requests, roster changes and things to confirm.</p>
      </Q>

      <h2 className="label mt-7">Ratings</h2>
      <Q id="rating" q="Why did my rating move?">
        <p>Mostly from your team's result against what was expected. Beating a stronger team moves you up more than beating a weaker one, and a big margin counts a little extra.</p>
        <p>Goals and assists add a small bump. Goalies get a small move for save percentage when shots against are entered. Six or more penalty minutes takes a little off.</p>
        <p>Your player page has a <b>Why it moved</b> list: every game, and the reason for each move.</p>
      </Q>
      <Q id="rating-when" q="When does my rating update?">
        <p>When a scoresheet is confirmed, right away. Games your rink imports update overnight, once a lineup is recorded for your team.</p>
        <p>Your first five games move faster while the rating finds its level. Tournament games count half.</p>
      </Q>
      <Q id="rating-reset" q="Does my rating reset each season?">
        <p>No. It follows you into the next season and onto any new team.</p>
      </Q>

      <h2 className="label mt-7">Games and stats</h2>
      <Q id="mistake" q="A stat on a game is wrong">
        <p>Open the game and tap <b>Report a mistake</b> at the bottom. Say what's wrong and what it should be. Rink staff fix it and you get a notice.</p>
      </Q>
      <Q id="goalie" q="I'm a goalie. How do I add my shots against?">
        <p>Make sure your position is Goalie on your profile. Then open the game and enter shots against. The other team's captain confirms it; if nobody answers it still counts, at half weight.</p>
      </Q>
      <Q id="scan" q="How does a scoresheet get in?">
        <p>Anyone on either team takes a photo with Scan. Late Ice reads it, and a captain, assistant or rink staff checks it and confirms. Once confirmed it's in the standings and ratings.</p>
      </Q>

      <h2 className="label mt-7">Your account</h2>
      <Q id="delete" q="How do I delete my account?">
        <p>Your profile, then Settings, then <b>Delete my account</b>. Your name is removed; past scores stay so your team's record still adds up.</p>
      </Q>
      <Q id="privacy" q="What do you keep about me?">
        <p>The <Link href="/privacy" className="text-[var(--blue)] underline">privacy page</Link> lists it in plain words.</p>
      </Q>
    </article>
  );
}
