import { Page } from "../components/Page";
import { Card } from "../components/ui/card";
import { useDocumentTitle } from "../lib/useDocumentTitle";

const BUILT_WITH = [
  "React",
  "TypeScript",
  "React Router",
  "TanStack Query",
  "Tailwind CSS",
  "Hono",
  "Cloudflare Workers",
  "Cloudflare D1",
  "Cloudflare Turnstile",
];

export function AboutPage() {
  useDocumentTitle("About");
  return (
    <Page narrow>
      <Card className="p-5 sm:p-8">
        <h1 className="text-5xl">About Keebhub</h1>
        <p className="mt-3 mb-8 text-lg text-muted">
          Keebhub is a market for the mechanical keyboard community to make trading, buying, and
          selling between users and vendors easier. No more sifting through Reddit posts on
          r/mechmarket that redirect you to unknown vendors!
        </p>
        <h2 className="mb-3 text-3xl">Built with</h2>
        <ul className="flex flex-wrap gap-2">
          {BUILT_WITH.map((tech) => (
            <li
              key={tech}
              className="rounded-full bg-primary-soft px-3 py-1.5 font-semibold text-primary-dark"
            >
              {tech}
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
