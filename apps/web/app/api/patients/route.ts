import { AccessTokenError, getAccessToken } from "@auth0/nextjs-auth0";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function GET(request: NextRequest) {
  const authResponse = new NextResponse();

  const withAuthHeaders = (init?: ResponseInit): ResponseInit => {
    const mergedHeaders = new Headers(authResponse.headers);

    if (init?.headers) {
      const extraHeaders = new Headers(init.headers);
      extraHeaders.forEach((value, key) => {
        mergedHeaders.set(key, value);
      });
    }

    mergedHeaders.set("Cache-Control", "no-store");

    return {
      ...init,
      headers: mergedHeaders,
    };
  };

  try {
    const { accessToken } = await getAccessToken(request, authResponse);

    if (!accessToken) {
      return NextResponse.json(
        { error: "Sign in to load patients for your clinic." },
        withAuthHeaders({ status: 401 }),
      );
    }

    const upstreamResponse = await fetch(`${apiUrl}/patients`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }).catch((error) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Unable to reach API: ${message}`);
    });

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        { error: `API request failed with status ${upstreamResponse.status}` },
        withAuthHeaders({ status: upstreamResponse.status }),
      );
    }

    const patients = await upstreamResponse.json().catch(() => {
      throw new Error("Received an invalid response from the API");
    });

    return NextResponse.json({ patients }, withAuthHeaders());
  } catch (error) {
    if (error instanceof AccessTokenError && error.code === "login_required") {
      return NextResponse.json(
        { error: "Sign in to load patients for your clinic." },
        withAuthHeaders({ status: 401 }),
      );
    }

    const message = error instanceof Error ? error.message : "Unable to load patients";
    return NextResponse.json(
      { error: message },
      withAuthHeaders({ status: 500 }),
    );
  }
}
