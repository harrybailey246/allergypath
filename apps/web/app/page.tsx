import Link from "next/link";

const cards = [
  {
    title: "REST API",
    description: "NestJS + Prisma service listening on port 4000.",
    href: "http://localhost:4000/patients",
  },
  {
    title: "Database",
    description: "PostgreSQL is provisioned locally via docker-compose.",
    href: "http://localhost:5050",
  },
];

export default function HomePage() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {cards.map((card) => (
        <article key={card.title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800">{card.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{card.description}</p>
          <Link
            href={card.href}
            prefetch={false}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex w-fit items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Visit
            <span aria-hidden>→</span>
          </Link>
        </article>
      ))}
    </div>
  );
}
