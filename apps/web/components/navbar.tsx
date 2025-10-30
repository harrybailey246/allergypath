"use client";

import Link from "next/link";
import { useUser } from "@auth0/nextjs-auth0/client";

export function Navbar() {
  const { user, isLoading } = useUser();

  return (
    <nav className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
          Authenticated
        </span>
        <span className="text-slate-500">Secure access to the EHR workspace</span>
      </div>
      <div className="flex items-center gap-3 text-sm text-slate-600">
        {isLoading ? (
          <span className="text-slate-400">Checking session…</span>
        ) : user ? (
          <>
            <span className="hidden rounded bg-slate-100 px-3 py-1 font-medium text-slate-700 md:inline-flex">
              {user.email ?? "Signed in"}
            </span>
            <Link
              className="inline-flex items-center rounded border border-slate-300 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-100"
              href="/api/auth/logout"
            >
              Sign out
            </Link>
          </>
        ) : (
          <Link
            className="inline-flex items-center rounded border border-blue-500 px-3 py-1 font-semibold text-blue-600 hover:bg-blue-50"
            href="/api/auth/login"
          >
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
