import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StatusMessage } from "./StatusMessage";

describe("StatusMessage", () => {
  it("announces loading politely", () => {
    render(<StatusMessage variant="loading">Loading listings…</StatusMessage>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading listings…");
  });

  it("announces errors as alerts with a working retry", async () => {
    const onRetry = vi.fn();
    render(
      <StatusMessage variant="error" title="Listings didn't load" onRetry={onRetry}>
        Try again later
      </StatusMessage>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Listings didn't load");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders empty states without a live region", () => {
    render(<StatusMessage title="No listings yet">Be the first.</StatusMessage>);
    expect(screen.getByText("No listings yet")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
