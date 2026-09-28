"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ANATOMY_CHAPTERS, type AnatomyChapter } from "./anatomyChapters";

const AnatomyCanvas = dynamic(() => import("./AnatomyCanvas"), { ssr: false });

export const ANATOMY_POSTER_URL = "/models/anatomy-poster.jpg";

type Mode = "pending" | "3d" | "fallback";
type FallbackReason = "reduced-motion" | "no-webgl" | "load-error";

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-slate-400 ${className}`}>
      3D anatomy:{" "}
      <a
        href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/"
        target="_blank"
        rel="noreferrer noopener"
        className="underline hover:text-white"
      >
        BodyParts3D
      </a>
      , &copy; The Database Center for Life Science, licensed under{" "}
      <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer noopener" className="underline hover:text-white">
        CC BY 4.0
      </a>
      ; parts grouped and simplified for this page. General information only — your doctor and radiologist decide which
      scan suits you.
    </p>
  );
}

function ChapterText({ chapter, headingLevel = "h3" }: { chapter: AnatomyChapter; headingLevel?: "h3" }) {
  const Heading = headingLevel;
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-wider text-sky-300">{chapter.eyebrow}</p>
      <Heading className="mt-2 text-2xl font-bold text-white sm:text-3xl">{chapter.title}</Heading>
      {chapter.paragraphs.map((p) => (
        <p key={p} className="mt-3 text-sm leading-relaxed text-slate-200 sm:text-base">
          {p}
        </p>
      ))}
      {chapter.points && (
        <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-200">
          {chapter.points.map((point) => (
            <li key={point} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
              {point}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const FALLBACK_NOTE: Record<FallbackReason, string> = {
  "reduced-motion": "The rotating 3D view is off because your device asks for reduced motion.",
  "no-webgl": "Your browser can't display the 3D model, so a still render is shown instead.",
  "load-error": "The 3D model couldn't be loaded, so a still render is shown instead.",
};

function Fallback({ reason }: { reason: FallbackReason }) {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <p className="text-sm text-slate-300">{FALLBACK_NOTE[reason]}</p>
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <figure className="lg:sticky lg:top-24 lg:self-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ANATOMY_POSTER_URL}
            alt="Rendered 3D model of the human skeleton, front view."
            width={600}
            height={1240}
            className="mx-auto h-auto max-h-[70vh] w-auto"
          />
        </figure>
        <ol className="space-y-6">
          {ANATOMY_CHAPTERS.map((chapter) => (
            <li key={chapter.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <ChapterText chapter={chapter} />
            </li>
          ))}
        </ol>
      </div>
      <Credit className="mt-10" />
    </div>
  );
}

export default function AnatomyExperience() {
  const [mode, setMode] = useState<Mode>("pending");
  const [reason, setReason] = useState<FallbackReason>("reduced-motion");
  const [activeIndex, setActiveIndex] = useState(0);
  const [inView, setInView] = useState(false);
  const progress = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [loadProgress, setLoadProgress] = useState(0);
  const [modelShown, setModelShown] = useState(false);
  const showModel = useCallback(() => setModelShown(true), []);

  const fallBack = useCallback((why: FallbackReason) => {
    setReason(why);
    setMode("fallback");
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const decide = () => {
      if (mq.matches) fallBack("reduced-motion");
      else if (!supportsWebGL()) fallBack("no-webgl");
      else setMode("3d");
    };
    decide();
    mq.addEventListener("change", decide);
    return () => mq.removeEventListener("change", decide);
  }, [fallBack]);

  useEffect(() => {
    if (mode !== "3d") return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      progress.current = p;
      setActiveIndex(Math.round(p * (ANATOMY_CHAPTERS.length - 1)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: "200px 0px" });
    if (trackRef.current) io.observe(trackRef.current);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      io.disconnect();
    };
  }, [mode]);

  const goTo = (index: number) => {
    stepRefs.current[index]?.scrollIntoView({ block: "center" });
  };

  return (
    <section id="anatomy" aria-labelledby="anatomy-heading" className="scroll-mt-16 relative text-white">
      {mode === "fallback" ? (
        <>
          <div className="mx-auto max-w-7xl px-4 pb-10 pt-20 sm:px-6 lg:px-8">
            <SectionHeading />
          </div>
          <Fallback reason={reason} />
        </>
      ) : (
        <div ref={trackRef} className="relative">
          <div className="sticky top-0 h-[100svh] overflow-hidden">
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_45%,#10223d_0%,#060b16_65%)]" />
            <div className="absolute inset-x-0 top-[84px]">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="lg:max-w-md">
                  <SectionHeading />
                </div>
              </div>
            </div>
            {/* Still render of the same model: shown until the 3D view is ready. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ANATOMY_POSTER_URL}
              alt=""
              aria-hidden
              className={`absolute inset-0 h-full w-full object-contain object-[50%_30%] transition-opacity duration-700 lg:object-[72%_50%] ${
                modelShown ? "opacity-0" : "opacity-60"
              }`}
            />
            {mode === "3d" && (
              <div className={`absolute inset-0 transition-opacity duration-700 ${modelShown ? "opacity-100" : "opacity-0"}`}>
                <AnatomyCanvas
                  progress={progress}
                  active={inView}
                  onError={() => fallBack("load-error")}
                  onLoadProgress={setLoadProgress}
                  onReady={showModel}
                />
              </div>
            )}
            {mode === "3d" && !modelShown && (
              <p role="status" className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-slate-200">
                Loading 3D anatomy model… {Math.round(loadProgress)}%
              </p>
            )}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-6 lg:bottom-auto lg:top-[228px]">
              <div className="mx-auto grid max-w-7xl px-4 sm:px-6 lg:px-8">
                {ANATOMY_CHAPTERS.map((chapter, i) => (
                  <article
                    key={chapter.id}
                    className={`w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/80 p-5 shadow-2xl backdrop-blur-md transition-all duration-500 [grid-area:1/1] sm:p-6 ${
                      i === activeIndex ? "translate-y-0 opacity-100" : "invisible translate-y-3 opacity-0"
                    }`}
                  >
                    <ChapterText chapter={chapter} />
                  </article>
                ))}
              </div>
            </div>
            <p className="sr-only">
              A 3D model of the human skeleton and selected organs accompanies this section. It turns to face each region
              described below and highlights the anatomy discussed.
            </p>

            <nav aria-label="Anatomy regions" className="absolute right-4 top-1/2 hidden -translate-y-1/2 lg:block">
              <ol className="space-y-3">
                {ANATOMY_CHAPTERS.map((chapter, i) => (
                  <li key={chapter.id}>
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      aria-current={i === activeIndex ? "step" : undefined}
                      className={`flex items-center justify-end gap-2 text-right text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${
                        i === activeIndex ? "text-white" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {chapter.navLabel}
                      <span
                        aria-hidden
                        className={`h-2 w-2 rounded-full ${i === activeIndex ? "bg-sky-400" : "bg-slate-600"}`}
                      />
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          </div>

          <ol className="relative -mt-[100svh]">
            {ANATOMY_CHAPTERS.map((chapter, i) => (
              <li
                key={chapter.id}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                aria-current={i === activeIndex ? "step" : undefined}
                className="h-[100svh]"
              >
                <div className="sr-only">
                  <ChapterText chapter={chapter} />
                </div>
              </li>
            ))}
          </ol>
          <div className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
            <Credit />
          </div>
        </div>
      )}
    </section>
  );
}

function SectionHeading() {
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-wider text-sky-300">Explore the anatomy we image</p>
      <h2 id="anatomy-heading" className="mt-3 max-w-3xl text-3xl font-bold sm:text-4xl">
        What an MRI can show, region by region
      </h2>
    </>
  );
}
