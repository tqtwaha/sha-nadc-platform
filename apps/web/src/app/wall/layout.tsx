// Wall has its own layout with no Topbar / app-switcher chrome — the LED
// panel viewer just sees the dashboard. Inherits root layout's fonts and
// theme tokens.

export default function WallLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-bg">{children}</div>;
}
