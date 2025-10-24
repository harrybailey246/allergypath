import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";

const unsubscribe = jest.fn();

jest.mock("./supabaseClient", () => {
  const chain = () => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  });

  return {
    supabase: {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
        onAuthStateChange: jest.fn().mockReturnValue({
          data: { subscription: { unsubscribe } },
        }),
        signOut: jest.fn(),
      },
      from: jest.fn().mockImplementation(chain),
    },
  };
});

jest.mock("./Dashboard", () => ({
  __esModule: true,
  default: () => <div data-testid="dashboard-view">Dashboard mock</div>,
}));

describe("App redirect handling", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    window.location.hash = "";
    jest.clearAllMocks();
  });

  test("normalizes ?view query into hash routing", async () => {
    window.history.replaceState({}, "", "/?view=dashboard");

    render(<App />);

    await waitFor(() => expect(window.location.hash).toBe("#dashboard"));

    expect(window.location.search).toBe("");
    expect(await screen.findByTestId("dashboard-view")).toBeInTheDocument();
  });
});
