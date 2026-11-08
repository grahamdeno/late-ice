// The website is public and should be found. The app stays out of search (root layout).
export const metadata = { robots: { index: true, follow: true } };

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
