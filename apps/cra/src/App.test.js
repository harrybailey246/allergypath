import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

jest.mock("./supabaseClient");

jest.mock("./Dashboard", () => ({
  __esModule: true,
  default: () => <div data-testid="dashboard-view">Dashboard mock</div>,
}));

import App from "./App";

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
