"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUp,
  BadgeCheck,
  Bone,
  Brain,
  Building2,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Dumbbell,
  FileCheck2,
  Gauge,
  LogIn,
  Mail,
  MapPin,
  Menu,
  Phone,
  PersonStanding,
  Quote,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Waves,
  X,
} from "lucide-react";
import AssistantWidget from "@/components/shared/AssistantWidget";
import { PUBLIC_ASSISTANT_SUMMARY } from "@/lib/assistant/scope";
import { QUICK_ACTIONS } from "@/lib/assistant/prompts";

const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Services", href: "#services" },
  { label: "About", href: "#about" },
  { label: "Locations", href: "#locations" },
  { label: "Contact", href: "#contact" },
];

const SECTION_IDS = ["home", "about", "services", "how-it-works", "why-us", "locations", "safety", "contact"];

const STATS = [
  { value: "3", label: "Sydney clinics", icon: Building2 },
  { value: "20–45 min", label: "Typical scan length", icon: Clock },
  { value: "24–48 hrs", label: "Report turnaround", icon: FileCheck2 },
  { value: "3T & 1.5T", label: "Scanner strength", icon: Gauge },
];

const SERVICES = [
  {
    name: "Brain MRI",
    icon: Brain,
    description: "Detailed imaging of brain tissue and vessels to investigate headaches, neurological symptoms and more.",
  },
  {
    name: "Spine MRI",
    icon: Bone,
    description: "Clear views of vertebrae, discs and the spinal cord to assess back pain, nerve compression and injury.",
  },
  {
    name: "Joint MRI",
    icon: Dumbbell,
    description: "High-resolution scans of the knee, shoulder, hip and other joints to assess ligaments and cartilage.",
  },
  {
    name: "Abdomen MRI",
    icon: Waves,
    description: "Non-invasive imaging of the liver, kidneys and abdominal organs without ionising radiation.",
  },
  {
    name: "Pelvis MRI",
    icon: PersonStanding,
    description: "Detailed pelvic imaging supporting diagnosis of gynaecological, urological and musculoskeletal conditions.",
  },
];

const STEPS = [
  { title: "Book online", description: "Choose a clinic and a time that suits you, then complete your referral and safety details before you arrive." },
  { title: "Attend your scan", description: "A qualified technician positions you comfortably and runs your MRI to protocol, usually in 20–45 minutes." },
  { title: "Radiologist reviews your images", description: "A subspecialist radiologist reads your scan and prepares a structured, signed report." },
  { title: "Results in your portal", description: "Your report lands securely in your patient portal, with your referring doctor notified at the same time." },
];

const WHY_US = [
  { title: "Online booking", icon: CalendarCheck, description: "Book, reschedule or cancel your appointment in a few clicks, any time of day." },
  { title: "Secure report access", icon: ShieldCheck, description: "Your images and reports are encrypted at rest and in transit, visible only to you and your care team." },
  { title: "Qualified radiologists", icon: Stethoscope, description: "Every scan is read and signed off by a subspecialist radiologist before it reaches your portal." },
  { title: "Modern scanners", icon: ScanLine, description: "Our clinics run modern 3T and 1.5T MRI scanners for sharper images and shorter scan times." },
];

const LOCATIONS = [
  {
    name: "Sydney CBD Clinic",
    address: "Level 4, 88 Elizabeth Street, Sydney NSW 2000",
    hours: ["Mon–Fri: 7:00am – 7:00pm", "Sat: 8:00am – 2:00pm"],
  },
  {
    name: "Parramatta Imaging",
    address: "Suite 2, 12 Church Street, Parramatta NSW 2150",
    hours: ["Mon–Fri: 7:30am – 6:00pm", "Sat: 8:00am – 12:00pm"],
  },
  {
    name: "Chatswood Centre",
    address: "Level 1, 45 Victoria Avenue, Chatswood NSW 2067",
    hours: ["Mon–Fri: 8:00am – 6:00pm", "Sat: Closed"],
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs font-bold uppercase tracking-wider text-medical">{children}</p>;
}

const cardHover = "transition-all duration-300 hover:-translate-y-1 hover:border-medical/30 hover:shadow-elevated";

// Lightweight, dependency-free reveal-on-scroll. Respects prefers-reduced-motion
// automatically via the global transition:none rule in globals.css — when that's
// set, this just becomes an instant, unanimated appearance rather than getting stuck.
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
      className={`transition-all duration-700 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

export default function MarketingHomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [activeSection, setActiveSection] = useState("home");

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
      setShowTop(window.scrollY > 600);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white text-navy">
      <div aria-hidden className="h-1 w-full bg-gradient-to-r from-medical via-teal to-medical-dark" />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-navy focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>

      {/* Header */}
      <header
        className={`sticky top-0 z-30 border-b bg-white/90 backdrop-blur-md transition-shadow ${
          scrolled ? "border-slate-200 shadow-sm" : "border-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="#home" className="flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-medical to-medical-dark shadow-glow">
              <Activity size={20} className="text-white" aria-hidden />
            </span>
            <span className="text-sm font-bold leading-tight text-navy sm:text-base">Capital Radiology</span>
          </a>

          <nav className="hidden lg:flex lg:items-center lg:gap-8" aria-label="Primary">
            {NAV_LINKS.map((link) => {
              const isActive = activeSection === link.href.slice(1);
              return (
                <a
                  key={link.label}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative py-1 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical ${
                    isActive ? "text-medical" : "text-slate-600 hover:text-medical"
                  }`}
                >
                  {link.label}
                  <span
                    aria-hidden
                    className={`absolute -bottom-0.5 left-0 h-0.5 w-full rounded-full bg-gradient-to-r from-medical to-teal transition-opacity ${
                      isActive ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </a>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <a href="/login" className="btn-ghost">
              <LogIn size={16} aria-hidden />
              Log in
            </a>
            <a href="/signup" className="btn-primary">
              Sign up
            </a>
          </div>

          <button
            type="button"
            className="flex items-center justify-center rounded-lg border border-slate-200 p-2 text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>

        {menuOpen && (
          <div id="mobile-menu" className="border-t border-slate-200 bg-white px-4 py-4 lg:hidden">
            <nav className="flex flex-col gap-1" aria-label="Primary">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-medical focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3">
              <a href="/login" className="btn-ghost justify-center" onClick={() => setMenuOpen(false)}>
                <LogIn size={16} aria-hidden />
                Log in
              </a>
              <a href="/signup" className="btn-primary justify-center" onClick={() => setMenuOpen(false)}>
                Sign up
              </a>
            </div>
          </div>
        )}
      </header>

      <main id="main">
        {/* Hero */}
        <section id="home" className="scroll-mt-20 relative overflow-hidden bg-gradient-to-b from-sky-50 via-white to-white pb-24 sm:pb-32">
          <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-sky-300/30 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -right-16 top-24 h-80 w-80 rounded-full bg-medical/20 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute right-1/3 top-0 h-64 w-64 rounded-full bg-teal-300/20 blur-3xl" />
          <div aria-hidden className="bg-dot-grid pointer-events-none absolute inset-x-0 top-0 h-96 text-medical/[0.05]" />

          <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-2 lg:px-8">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-medical/20 bg-medical-light px-3.5 py-1.5 text-xs font-semibold text-medical-dark">
                <ShieldCheck size={14} aria-hidden />
                Subspecialist-reported medical imaging
              </div>

              <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-navy sm:text-5xl lg:text-[3.4rem]">
                Book your MRI online.{" "}
                <span className="bg-gradient-to-r from-medical to-teal-dark bg-clip-text text-transparent">
                  Get your results without a second trip to the clinic.
                </span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg lg:mx-0">
                Capital Radiology&rsquo;s patient portal lets you schedule your MRI appointment, complete your safety
                screening, and securely view your radiologist&rsquo;s report the moment it&rsquo;s signed off &mdash;
                all from your phone or computer.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <a href="/signup" className="btn-primary px-6 py-3 text-base">
                  <CalendarPlus size={18} aria-hidden />
                  Book an MRI
                </a>
                <a href="/login" className="btn-ghost px-6 py-3 text-base">
                  <LogIn size={18} aria-hidden />
                  Patient login
                </a>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-medical via-medical-dark to-navy p-10 shadow-elevated">
                <div aria-hidden className="bg-dot-grid pointer-events-none absolute inset-0 text-white/[0.06]" />
                <div className="relative mx-auto flex h-56 w-56 items-center justify-center sm:h-64 sm:w-64">
                  <span aria-hidden className="absolute inset-0 rounded-full border border-white/20" />
                  <span aria-hidden className="absolute inset-6 rounded-full border border-white/25" />
                  <span aria-hidden className="absolute inset-12 rounded-full border border-teal-200/30" />
                  <span aria-hidden className="absolute inset-16 animate-ping rounded-full bg-white/10" />
                  <span className="relative grid h-20 w-20 place-items-center rounded-full bg-white/15 shadow-lg backdrop-blur">
                    <Brain size={36} className="text-white" aria-hidden />
                  </span>
                </div>
              </div>

              <div className="animate-float absolute -left-4 -top-5 hidden w-48 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-elevated backdrop-blur sm:block">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                    <ShieldCheck size={14} aria-hidden />
                  </span>
                  <p className="text-[11px] font-semibold leading-tight text-navy">
                    Encrypted &amp; confidential, end to end
                  </p>
                </div>
              </div>

              <div className="animate-float absolute -bottom-8 -right-4 hidden w-60 rounded-xl border border-slate-200 bg-white p-4 shadow-elevated sm:block sm:-right-8">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-navy">
                    <ScanLine size={14} className="text-medical" aria-hidden />
                    MRI &mdash; Brain
                  </span>
                  <span className="chip bg-emerald-100 text-emerald-800">
                    <CheckCircle2 size={12} aria-hidden />
                    Reported
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  Signed off by Dr. A. Nguyen, Radiologist &middot; Ready in your portal
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Stats — elevated card bridging the hero into the page body */}
        <div className="relative z-10 -mt-16 px-4 sm:-mt-20 sm:px-6 lg:px-8">
          <Reveal>
            <div className="mx-auto max-w-5xl rounded-3xl border border-slate-100 bg-white p-6 shadow-elevated sm:p-8">
              <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 sm:gap-6">
                {STATS.map((stat) => (
                  <div key={stat.label} className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-medical-light to-teal-light text-medical-dark">
                      <stat.icon size={19} aria-hidden />
                    </span>
                    <div>
                      <p className="text-xl font-extrabold text-navy sm:text-2xl">{stat.value}</p>
                      <p className="text-xs font-medium text-slate-500 sm:text-sm">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        {/* About */}
        <section id="about" className="scroll-mt-20 pt-8">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
              <Reveal className="lg:col-span-2">
                <Eyebrow>Who we are</Eyebrow>
                <h2 className="text-2xl font-bold text-navy sm:text-3xl">About Capital Radiology</h2>
                <p className="mt-4 text-base leading-relaxed text-slate-600">
                  Capital Radiology is a medical imaging provider delivering CT, MRI, ultrasound and X-ray services
                  across multiple clinics. Our radiologists and technicians work to the same standards of accuracy
                  and care at every location, so wherever you scan, you get the same trusted read.
                </p>
                <p className="mt-4 text-base leading-relaxed text-slate-600">
                  We built our online portal because getting a scan shouldn&rsquo;t mean two trips to the clinic
                  &mdash; one for the scan, one for the results. Book online, attend your appointment, and read your
                  report as soon as it&rsquo;s ready, from wherever you are.
                </p>
              </Reveal>
              <Reveal delay={120}>
                <div className="relative overflow-hidden rounded-2xl border border-medical/15 bg-gradient-to-br from-medical-light via-white to-white p-6 shadow-card">
                  <Quote size={30} className="text-medical/25" aria-hidden />
                  <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-medical-dark">Our promise</p>
                  <p className="mt-3 text-base leading-relaxed text-navy">
                    &ldquo;Every scan, read by a subspecialist radiologist and delivered straight to your portal
                    &mdash; no second trip required.&rdquo;
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="scroll-mt-20 border-t border-slate-100 bg-slate-50">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>What we scan</Eyebrow>
              <h2 className="text-2xl font-bold text-navy sm:text-3xl">MRI scans we perform</h2>
              <p className="mt-3 text-base text-slate-600">
                High-resolution imaging across the body, reported by subspecialist radiologists.
              </p>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
              {SERVICES.map((service, i) => (
                <Reveal key={service.name} delay={i * 70}>
                  <div className={`card group relative flex h-full flex-col gap-3 overflow-hidden p-5 ${cardHover}`}>
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-medical to-teal transition-transform duration-300 group-hover:scale-x-100"
                    />
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-medical-light to-teal-light text-medical-dark shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-glow">
                      <service.icon size={22} aria-hidden />
                    </span>
                    <h3 className="text-base font-bold text-navy">{service.name}</h3>
                    <p className="text-sm leading-relaxed text-slate-600">{service.description}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-t border-slate-100">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>Process</Eyebrow>
              <h2 className="text-2xl font-bold text-navy sm:text-3xl">How it works</h2>
              <p className="mt-3 text-base text-slate-600">From booking to results, in four simple steps.</p>
            </Reveal>

            <ol className="relative mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <span aria-hidden className="absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-medical/0 via-medical/25 to-medical/0 lg:block" />
              {STEPS.map((step, index) => (
                <Reveal key={step.title} delay={index * 90}>
                  <li className={`card relative h-full p-5 ${cardHover}`}>
                    <span className="relative z-10 grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-medical to-teal-dark text-sm font-bold text-white shadow-glow">
                      {index + 1}
                    </span>
                    <h3 className="mt-4 text-base font-bold text-navy">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.description}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Why choose us */}
        <section id="why-us" className="scroll-mt-20 relative overflow-hidden border-t border-slate-100 bg-navy">
          <div aria-hidden className="pointer-events-none absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-medical/20 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
          <div aria-hidden className="bg-dot-grid pointer-events-none absolute inset-0 text-white/[0.03]" />

          <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>Benefits</Eyebrow>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Why patients choose Capital Radiology</h2>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {WHY_US.map((item, i) => (
                <Reveal key={item.title} delay={i * 70}>
                  <div className="h-full rounded-xl border border-white/10 bg-white/5 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-teal-300/30 hover:bg-white/10">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-white/15 to-teal-400/10 text-teal-300 ring-1 ring-white/10">
                      <item.icon size={22} aria-hidden />
                    </span>
                    <h3 className="mt-4 text-base font-bold text-white">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{item.description}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Locations */}
        <section id="locations" className="scroll-mt-20 border-t border-slate-100">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>Clinics</Eyebrow>
              <h2 className="text-2xl font-bold text-navy sm:text-3xl">Find a clinic near you</h2>
              <p className="mt-3 text-base text-slate-600">Three clinics across Sydney, all offering MRI, CT, ultrasound and X-ray.</p>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
              {LOCATIONS.map((location, i) => (
                <Reveal key={location.name} delay={i * 90}>
                  <div className={`card group relative h-full overflow-hidden p-5 ${cardHover}`}>
                    <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-medical to-teal" />
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-medical-light to-teal-light text-medical-dark">
                      <MapPin size={18} aria-hidden />
                    </span>
                    <h3 className="mt-3 text-base font-bold text-navy">{location.name}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{location.address}</p>
                    <div className="mt-4 space-y-1 border-t border-slate-100 pt-3">
                      {location.hours.map((line) => (
                        <p key={line} className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock size={13} aria-hidden />
                          {line}
                        </p>
                      ))}
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-medical/20 bg-medical-light px-3 py-1.5 text-xs font-semibold text-medical-dark transition hover:border-medical hover:bg-medical hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical"
                    >
                      <MapPin size={13} aria-hidden />
                      Get directions
                    </a>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* MRI safety note */}
        <section id="safety" className="scroll-mt-20 border-t border-slate-100 bg-slate-50">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Reveal>
              <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-warm-light p-6 shadow-card sm:flex-row sm:p-7">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-amber-100">
                  <ShieldAlert size={22} className="text-amber-700" aria-hidden />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-amber-900">Before you book: MRI safety</h2>
                  <p className="mt-2 text-sm leading-relaxed text-amber-800">
                    MRI uses a strong magnetic field, so it&rsquo;s important to tell us about certain implants and
                    devices before your appointment. Please disclose any pacemakers, defibrillators, cochlear implants,
                    metal implants, surgical clips or shrapnel when you book &mdash; some of these may mean MRI
                    isn&rsquo;t suitable for you, or that we need extra time to plan your scan safely.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-amber-800">
                    If you feel anxious in enclosed spaces, let us know too. We can talk you through what to expect,
                    offer a wider-bore scanner where available, or discuss sedation options with your referring doctor.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="relative overflow-hidden bg-gradient-to-br from-navy via-navy to-medical-dark">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-medical/30 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -left-16 bottom-0 h-64 w-64 rounded-full bg-teal-400/15 blur-3xl" />
          <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
            <Reveal>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready to book your MRI?</h2>
              <p className="mt-3 text-base text-slate-300">
                Create your patient account and book your first appointment in minutes.
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a href="/signup" className="btn-primary px-6 py-3 text-base">
                  <CalendarPlus size={18} aria-hidden />
                  Book an MRI
                </a>
                <a
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-transparent px-6 py-3 text-base font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <LogIn size={18} aria-hidden />
                  Patient login
                </a>
              </div>
              <p className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck size={13} aria-hidden /> Encrypted &amp; confidential
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FileCheck2 size={13} aria-hidden /> Results in 24&ndash;48 hrs
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck size={13} aria-hidden /> Free to create an account
                </span>
              </p>
            </Reveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer id="contact" className="scroll-mt-20 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-medical to-medical-dark">
                  <Activity size={20} className="text-white" aria-hidden />
                </span>
                <span className="text-sm font-bold text-navy">Capital Radiology</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-500">
                Online booking, secure reporting and radiologist-reviewed MRI, CT, ultrasound and X-ray across Sydney.
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <Phone size={14} className="text-slate-400" aria-hidden />
                  <a href="tel:1300722674" className="hover:text-medical focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                    1300 722 674
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Mail size={14} className="text-slate-400" aria-hidden />
                  <a href="mailto:care@capitalradiology.com.au" className="hover:text-medical focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                    care@capitalradiology.com.au
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick links</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {NAV_LINKS.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="hover:text-medical focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>
                  <a href="/login" className="hover:text-medical focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                    Patient login
                  </a>
                </li>
                <li>
                  <a href="/signup" className="hover:text-medical focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                    Create an account
                  </a>
                </li>
                <li>
                  <a href="/privacy" className="hover:text-medical focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                    Privacy policy
                  </a>
                </li>
                <li>
                  <a href="/terms" className="hover:text-medical focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                    Terms of service
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-slate-100 pt-6 text-xs text-slate-500">
            &copy; {new Date().getFullYear()} Capital Radiology. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Back to top */}
      <a
        href="#home"
        aria-label="Back to top"
        className={`fixed bottom-24 right-6 z-40 grid h-11 w-11 place-items-center rounded-full bg-gradient-to-b from-medical to-medical-dark text-white shadow-glow transition-all hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical ${
          showTop ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        }`}
      >
        <ArrowUp size={18} aria-hidden />
      </a>

      <AssistantWidget
        role="public"
        userId={null}
        contextSummary={PUBLIC_ASSISTANT_SUMMARY}
        quickActions={QUICK_ACTIONS.public}
        title="Ask about Capital Radiology"
      />
    </div>
  );
}
