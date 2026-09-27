import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { render, screen } from "@testing-library/react";
import AnatomyExperience, { ANATOMY_POSTER_URL } from "./AnatomyExperience";
import { ANATOMY_CHAPTERS } from "./anatomyChapters";

vi.mock("./AnatomyCanvas", () => ({ default: () => <div data-testid="anatomy-canvas" /> }));

function mockMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reducedMotion && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("AnatomyExperience fallbacks", () => {
  let getContext: MockInstance<(...args: unknown[]) => unknown>;

  beforeEach(() => {
    getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext") as unknown as MockInstance<(...args: unknown[]) => unknown>;
  });
  afterEach(() => {
    getContext.mockRestore();
  });

  it("shows a still render and every chapter when reduced motion is requested", async () => {
    getContext.mockReturnValue({} as never);
    mockMatchMedia(true);
    render(<AnatomyExperience />);

    expect(await screen.findByText(/asks for reduced motion/i)).toBeInTheDocument();
    expect(screen.queryByTestId("anatomy-canvas")).not.toBeInTheDocument();
    const poster = screen.getByRole("img", { name: /3D model of the human skeleton/i });
    expect(poster).toHaveAttribute("src", ANATOMY_POSTER_URL);
    for (const chapter of ANATOMY_CHAPTERS) {
      expect(screen.getByRole("heading", { name: chapter.title })).toBeInTheDocument();
    }
    expect(screen.getAllByText(/BodyParts3D/).length).toBeGreaterThan(0);
  });

  it("falls back when WebGL is unavailable", async () => {
    getContext.mockReturnValue(null);
    mockMatchMedia(false);
    render(<AnatomyExperience />);

    expect(await screen.findByText(/can't display the 3D model/i)).toBeInTheDocument();
    expect(screen.queryByTestId("anatomy-canvas")).not.toBeInTheDocument();
  });

  it("mounts the 3D view with chapter navigation when WebGL is available", async () => {
    getContext.mockReturnValue({} as never);
    mockMatchMedia(false);
    window.IntersectionObserver = vi.fn().mockImplementation(() => ({ observe: vi.fn(), disconnect: vi.fn() })) as never;
    render(<AnatomyExperience />);

    expect(await screen.findByTestId("anatomy-canvas")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: /anatomy regions/i });
    expect(nav.querySelectorAll("button")).toHaveLength(ANATOMY_CHAPTERS.length);
    expect(screen.getByRole("button", { name: ANATOMY_CHAPTERS[0].navLabel })).toHaveAttribute("aria-current", "step");
  });
});
