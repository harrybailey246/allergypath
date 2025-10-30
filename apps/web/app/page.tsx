import { AccessTokenError, getAccessToken } from "@auth0/nextjs-auth0";
import { cookies, headers } from "next/headers";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

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

interface PatientsResult {
  patients: Patient[];
  error: string | null;
}

async function fetchPatients(): Promise<PatientsResult> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const cookieStore = cookies();
  const headerStore = headers();

  try {
    const { accessToken } = await getAccessToken(cookieStore, headerStore);

    if (!accessToken) {
      return { patients: [], error: "Sign in to load patients for your clinic." };
    }

    const response = await fetch(`${apiUrl}/patients`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return {
        patients: [],
        error: `API request failed with status ${response.status}`,
      };
    }

    const patients = (await response.json()) as Patient[];
    return { patients, error: null };
  } catch (error) {
    if (error instanceof AccessTokenError && error.code === "login_required") {
      return { patients: [], error: "Sign in to load patients for your clinic." };
    }

    return {
      patients: [],
      error: error instanceof Error ? error.message : "Unable to load patients",
    };
  }
}

export default async function HomePage() {
  const { patients, error } = await fetchPatients();

  return (
    <div className="space-y-10">
      <div className="grid gap-6 md:grid-cols-2">
        {cards.map((card) => (
          <article key={card.title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-800">{card.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{card.description}</p>
            <a
              href={card.href}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex w-fit items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Visit
              <span aria-hidden>→</span>
            </a>
          </article>
        ))}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-800">Patients</h2>
          <span className="text-sm text-slate-500">Data fetched from the secured API</span>
        </div>
        {error ? (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        ) : patients.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No patients found for your clinic yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200">
            {patients.map((patient) => (
              <li key={patient.id} className="flex items-center justify-between py-3 text-sm text-slate-700">
                <span className="font-medium">
                  {patient.firstName} {patient.lastName}
                </span>
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  DOB: {new Date(patient.dateOfBirth).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
