import type { Metadata } from "next";
import Link from "next/link";
import "./uswds.scss";
import "./globals.css";

export const metadata: Metadata = {
  title: "TTB Label Verification",
  description:
    "Compare alcohol beverage label artwork against its COLA application and the 27 CFR 16.21 health warning.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        {/* First tab stop on every page: keyboard users skip the nav. */}
        <a className="usa-skipnav" href="#main-content">
          Skip to main content
        </a>

        <header className="site-header">
          <div className="site-header__inner">
            <p className="site-header__title">TTB Label Verification</p>
            <nav aria-label="Primary">
              <ul className="site-nav">
                <li>
                  <Link href="/">Single label</Link>
                </li>
                <li>
                  <Link href="/batch">Batch</Link>
                </li>
              </ul>
            </nav>
          </div>
        </header>

        <main id="main-content" className="flex-1">
          {children}
        </main>

        <footer className="site-footer">
          <p>
            Prototype for evaluation. Not connected to COLA. Warning text checked against
            27 CFR 16.21 as retrieved from the eCFR.
          </p>
        </footer>
      </body>
    </html>
  );
}
