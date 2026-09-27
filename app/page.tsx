"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Bone,
  Brain,
  Building2,
  CalendarCheck,
  CalendarPlus,
  ChevronDown,
  Clock,
  Dumbbell,
  FileCheck2,
  Gauge,
  HelpCircle,
  Landmark,
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
  Star,
  Stethoscope,
  Waves,
  X,
} from "lucide-react";
import AssistantWidget from "@/frontend/components/shared/AssistantWidget";
import AnatomyExperience from "@/frontend/components/marketing/AnatomyExperience";
import { PUBLIC_ASSISTANT_SUMMARY } from "@/frontend/lib/assistant/scope";
import { QUICK_ACTIONS } from "@/backend/lib/assistant/prompts";

const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Anatomy", href: "#anatomy" },
  { label: "About", href: "#about" },
  { label: "Services", href: "#services" },
  { label: "Locations", href: "#locations" },
  { label: "Contact", href: "#contact" },
];

const SECTION_IDS = ["home", "anatomy", "about", "services", "how-it-works", "why-us", "locations", "safety", "contact"];

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

const TEAM = [
  {
    name: "Dr. Sarah Whitfield",
    credentials: "MBBS, FRANZCR",
    specialty: "Neuroradiology — Brain & Spine",
    initials: "SW",
  },
  {
    name: "Dr. Marcus Chen",
    credentials: "MBBS, FRANZCR",
    specialty: "Musculoskeletal Imaging — Joints & Sports Injury",
    initials: "MC",
  },
  {
    name: "Dr. Priya Nair",
    credentials: "MBBS, FRANZCR",
    specialty: "Body Imaging — Abdomen & Pelvis",
    initials: "PN",
  },
  {
    name: "Dr. James O'Connor",
    credentials: "MBBS, FRANZCR",
    specialty: "General & Emergency Radiology",
    initials: "JO",
  },
];

const TESTIMONIALS = [
  {
    quote: "Booked online in minutes and had my results the next day — no chasing anyone up.",
    name: "Emma R.",
    location: "Chatswood",
  },
  {
    quote: "The team explained everything before my knee MRI. Made a stressful week much easier.",
    name: "David T.",
    location: "Parramatta",
  },
  {
    quote: "Clear communication and friendly staff, and my GP had the report before I even got home.",
    name: "Priya S.",
    location: "Sydney CBD",
  },
];

const FAQS = [
  {
    q: "Do I need a referral for an MRI?",
    a: "Most MRI scans require a referral from your GP or specialist to be eligible for a Medicare rebate. A small number of scans — shoulder, right knee and left knee — can be booked without a referral, though we still recommend one so we have your clinical history.",
  },
  {
    q: "Will I get a Medicare rebate?",
    a: "Bulk billing and Medicare rebates depend on your referral and the specific item number for your scan. We'll always confirm any out-of-pocket cost with you before your appointment.",
  },
  {
    q: "What should I bring to my appointment?",
    a: "Your referral (if you have one), Medicare and private health insurance cards, a list of current medications, and any prior imaging or reports relevant to your scan.",
  },
  {
    q: "Is MRI safe if I have metal implants or a pacemaker?",
    a: "Most implants are compatible with MRI, but some are not. Please tell us about any pacemakers, defibrillators, cochlear implants, metal implants, surgical clips or shrapnel when you book, so we can screen you safely in advance.",
  },
  {
    q: "How long until I get my results?",
    a: "Most reports are ready within 24–48 hours. Your report is sent to your referring doctor and made available in your patient portal as soon as it's signed off.",
  },
  {
    q: "Can I book without creating an account?",
    a: "You can book online in a few minutes, or call or visit any of our clinics and our reception team can register and book you in on the spot.",
  },
];

// The whole homepage shares this one background (see the fixed ambient layer
// in MarketingHomePage) — every section below is transparent/translucent by
// design rather than carrying its own bg-white / bg-slate-50, so scrolling
// never crosses a visible seam. None of this touches the shared `.card`,
// `.btn-ghost` etc. utility classes in globals.css: those stay light-themed
// for the authenticated dashboards, so this page defines its own dark-glass
// equivalents locally instead.
const PAGE_BG = "#060b16";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs font-bold uppercase tracking-wider text-sky-300">{children}</p>;
}

// Local stand-in for the global `.card` class (which is light-themed for the
// dashboards) — a translucent panel that reads as "elevated" against the
// page's single dark background instead of a solid white surface.
const glassCard = "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm";
const cardHover = "transition-all duration-300 hover:-translate-y-1 hover:border-medical/40 hover:bg-white/[0.07] hover:shadow-elevated";

// Local stand-in for `.btn-ghost` (also light-themed) — same shape/behaviour,
// re-coloured for a dark background.
const ghostBtn =
  "inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 text-sm font-semibold text-white transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/10 active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical";

// Icon "chip" used throughout for feature/service icons — frosted glass with
// a teal glyph, the same treatment the "Why choose us" section already used.
const iconChip =
  "grid place-items-center rounded-xl bg-gradient-to-br from-white/15 to-teal-400/10 text-teal-300 ring-1 ring-white/10";

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
  const [openFaq, setOpenFaq] = useState<number | null>(0);

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
    <div className="min-h-screen text-white" style={{ backgroundColor: PAGE_BG }}>
      {/* One fixed ambient layer for the whole page — ombre glows plus a faint
          dot texture, pinned to the viewport so it never seams or repeats as
          sections scroll past it. This (not per-section backgrounds) is what
          makes the page read as one continuous background. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundColor: PAGE_BG }} />
        <div className="absolute -left-32 top-[10%] h-[32rem] w-[32rem] rounded-full bg-medical/10 blur-[120px]" />
        <div className="absolute -right-24 top-[45%] h-[28rem] w-[28rem] rounded-full bg-teal-400/10 blur-[120px]" />
        <div className="absolute left-1/4 bottom-[-10%] h-[30rem] w-[30rem] rounded-full bg-medical/10 blur-[120px]" />
        <div className="bg-dot-grid absolute inset-0 text-white/[0.025]" />
      </div>

      <div aria-hidden className="h-1 w-full bg-gradient-to-r from-medical via-teal to-medical-dark" />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-navy"
      >
        Skip to main content
      </a>

      {/* Header */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-md transition-colors ${
          scrolled ? "border-white/10 bg-[#060b16]/85" : "border-transparent bg-[#060b16]/40"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="#home" className="flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-medical to-medical-dark shadow-glow">
              <Activity size={20} className="text-white" aria-hidden />
            </span>
            <span className="text-sm font-bold leading-tight text-white sm:text-base">Capital Radiology</span>
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
                    isActive ? "text-white" : "text-slate-300 hover:text-white"
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
            <a href="/login" className={`${ghostBtn} px-4 py-2`}>
              <LogIn size={16} aria-hidden />
              Log in
            </a>
            <a href="/signup" className="btn-primary">
              Sign up
            </a>
          </div>

          <button
            type="button"
            className="flex items-center justify-center rounded-lg border border-white/20 p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>

        {menuOpen && (
          <div id="mobile-menu" className="border-t border-white/10 bg-[#060b16] px-4 py-4 lg:hidden">
            <nav className="flex flex-col gap-1" aria-label="Primary">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
              <a href="/login" className={`${ghostBtn} justify-center px-4 py-2`} onClick={() => setMenuOpen(false)}>
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
        <section id="home" className="scroll-mt-20 relative pb-24 sm:pb-32">
          <div className="relative mx-auto max-w-4xl px-4 pt-16 sm:px-6 sm:pt-24 lg:px-8">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-sky-200">
                <ShieldCheck size={14} aria-hidden />
                Subspecialist-reported medical imaging
              </div>

              <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
                Book your MRI online.{" "}
                <span className="bg-gradient-to-r from-sky-300 to-teal-300 bg-clip-text text-transparent">
                  Get your results without a second trip to the clinic.
                </span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
                Capital Radiology&rsquo;s patient portal lets you schedule your MRI appointment, complete your safety
                screening, and securely view your radiologist&rsquo;s report the moment it&rsquo;s signed off &mdash;
                all from your phone or computer.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a href="/signup" className="btn-primary px-6 py-3 text-base">
                  <CalendarPlus size={18} aria-hidden />
                  Book an MRI
                </a>
                <a href="/login" className={`${ghostBtn} px-6 py-3 text-base`}>
                  <LogIn size={18} aria-hidden />
                  Patient login
                </a>
              </div>
              <a
                href="#anatomy"
                className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-300 underline-offset-4 hover:text-sky-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical"
              >
                See what an MRI can show
                <ArrowDown size={15} aria-hidden />
              </a>
            </div>
          </div>
        </section>

        {/* Stats — elevated glass card bridging the hero into the page body */}
        <div className="relative z-10 -mt-16 px-4 sm:-mt-20 sm:px-6 lg:px-8">
          <Reveal>
            <div className={`mx-auto max-w-5xl rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-elevated backdrop-blur-md sm:p-8`}>
              <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 sm:gap-6">
                {STATS.map((stat) => (
                  <div key={stat.label} className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
                    <span className={`${iconChip} h-11 w-11 shrink-0`}>
                      <stat.icon size={19} aria-hidden />
                    </span>
                    <div>
                      <p className="text-xl font-extrabold text-white sm:text-2xl">{stat.value}</p>
                      <p className="text-xs font-medium text-slate-400 sm:text-sm">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        <AnatomyExperience />

        {/* About */}
        <section id="about" className="scroll-mt-20 pt-8">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
              <Reveal className="lg:col-span-2">
                <Eyebrow>Who we are</Eyebrow>
                <h2 className="text-2xl font-bold text-white sm:text-3xl">About Capital Radiology</h2>
                <p className="mt-4 text-base leading-relaxed text-slate-300">
                  Capital Radiology is a medical imaging provider delivering CT, MRI, ultrasound and X-ray services
                  across multiple clinics. Our radiologists and technicians work to the same standards of accuracy
                  and care at every location, so wherever you scan, you get the same trusted read.
                </p>
                <p className="mt-4 text-base leading-relaxed text-slate-300">
                  We built our online portal because getting a scan shouldn&rsquo;t mean two trips to the clinic
                  &mdash; one for the scan, one for the results. Book online, attend your appointment, and read your
                  report as soon as it&rsquo;s ready, from wherever you are.
                </p>
              </Reveal>
              <Reveal delay={120}>
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-medical/10 via-white/[0.04] to-transparent p-6">
                  <Quote size={30} className="text-white/15" aria-hidden />
                  <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-sky-300">Our promise</p>
                  <p className="mt-3 text-base leading-relaxed text-white">
                    &ldquo;Every scan, read by a subspecialist radiologist and delivered straight to your portal
                    &mdash; no second trip required.&rdquo;
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="scroll-mt-20 border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>What we scan</Eyebrow>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">MRI scans we perform</h2>
              <p className="mt-3 text-base text-slate-300">
                High-resolution imaging across the body, reported by subspecialist radiologists.
              </p>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
              {SERVICES.map((service, i) => (
                <Reveal key={service.name} delay={i * 70}>
                  <div className={`${glassCard} group relative flex h-full flex-col gap-3 overflow-hidden p-5 ${cardHover}`}>
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-medical to-teal transition-transform duration-300 group-hover:scale-x-100"
                    />
                    <span className={`${iconChip} h-12 w-12 shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-glow`}>
                      <service.icon size={22} aria-hidden />
                    </span>
                    <h3 className="text-base font-bold text-white">{service.name}</h3>
                    <p className="text-sm leading-relaxed text-slate-300">{service.description}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Team */}
        <section id="team" className="scroll-mt-20 border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>Our radiologists</Eyebrow>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Subspecialist radiologists behind every report</h2>
              <p className="mt-3 text-base text-slate-300">
                Every scan is read and signed off by a qualified radiologist with subspecialty training in the
                relevant area of the body.
              </p>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {TEAM.map((member, i) => (
                <Reveal key={member.name} delay={i * 80}>
                  <div className={`${glassCard} h-full p-5 text-center ${cardHover}`}>
                    <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-medical to-teal-dark text-lg font-bold text-white shadow-glow">
                      {member.initials}
                    </span>
                    <h3 className="mt-4 text-base font-bold text-white">{member.name}</h3>
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">{member.credentials}</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">{member.specialty}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>Process</Eyebrow>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">How it works</h2>
              <p className="mt-3 text-base text-slate-300">From booking to results, in four simple steps.</p>
            </Reveal>

            <div className="relative mt-12">
              {/* An <ol> may only contain <li> children per the HTML spec —
                  this connecting line lives in the wrapping (positioned) div
                  instead of inside the list itself. */}
              <span aria-hidden className="absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-medical/0 via-medical/40 to-medical/0 lg:block" />
              <ol className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {STEPS.map((step, index) => (
                  <li key={step.title} className="h-full">
                    <Reveal delay={index * 90} className="h-full">
                      <div className={`${glassCard} relative h-full p-5 ${cardHover}`}>
                        <span className="relative z-10 grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-medical to-teal-dark text-sm font-bold text-white shadow-glow">
                          {index + 1}
                        </span>
                        <h3 className="mt-4 text-base font-bold text-white">{step.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{step.description}</p>
                      </div>
                    </Reveal>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Insurance & Medicare */}
        <section id="insurance" className="scroll-mt-20 border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
              <Reveal>
                <Eyebrow>Cost &amp; cover</Eyebrow>
                <h2 className="text-2xl font-bold text-white sm:text-3xl">Medicare, private health cover &amp; costs</h2>
                <p className="mt-4 text-base leading-relaxed text-slate-300">
                  Most MRI scans performed with a valid referral are eligible for a Medicare rebate, and many are
                  bulk-billed with no out-of-pocket cost. Where a gap applies, we&rsquo;ll always let you know the
                  amount before your appointment &mdash; there are no surprise bills.
                </p>
                <p className="mt-3 text-base leading-relaxed text-slate-300">
                  A small number of scans &mdash; shoulder, right knee and left knee &mdash; can be booked without a
                  GP referral. These self-referred scans aren&rsquo;t eligible for a Medicare rebate, so you&rsquo;ll
                  pay the private fee directly, and we&rsquo;ll confirm the cost with you at booking.
                </p>
              </Reveal>
              <Reveal delay={100}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className={`${glassCard} p-5`}>
                    <span className={`${iconChip} h-10 w-10`}>
                      <Landmark size={18} aria-hidden />
                    </span>
                    <h3 className="mt-3 text-sm font-bold text-white">Medicare bulk billing</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                      Available for most referred scans that meet Medicare eligibility criteria.
                    </p>
                  </div>
                  <div className={`${glassCard} p-5`}>
                    <span className={`${iconChip} h-10 w-10`}>
                      <ShieldCheck size={18} aria-hidden />
                    </span>
                    <h3 className="mt-3 text-sm font-bold text-white">Private health cover</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                      We can process eligible private health fund rebates for select scans.
                    </p>
                  </div>
                  <div className={`${glassCard} p-5 sm:col-span-2`}>
                    <span className={`${iconChip} h-10 w-10`}>
                      <CalendarCheck size={18} aria-hidden />
                    </span>
                    <h3 className="mt-3 text-sm font-bold text-white">No-referral scans</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                      Shoulder, right knee and left knee MRI can be booked online without a GP referral.
                    </p>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Why choose us */}
        <section id="why-us" className="scroll-mt-20 relative overflow-hidden border-t border-white/10">
          <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>Benefits</Eyebrow>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Why patients choose Capital Radiology</h2>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {WHY_US.map((item, i) => (
                <Reveal key={item.title} delay={i * 70}>
                  <div className={`${glassCard} h-full p-5 ${cardHover}`}>
                    <span className={`${iconChip} h-11 w-11`}>
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

        {/* Testimonials */}
        <section id="testimonials" className="scroll-mt-20 border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>Patient stories</Eyebrow>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">What our patients say</h2>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
              {TESTIMONIALS.map((t, i) => (
                <Reveal key={t.name} delay={i * 90}>
                  <div className={`${glassCard} relative h-full p-6 ${cardHover}`}>
                    <Quote size={24} className="text-white/15" aria-hidden />
                    <div className="mt-2 flex gap-0.5 text-amber-400" aria-hidden>
                      {Array.from({ length: 5 }).map((_, s) => (
                        <Star key={s} size={14} fill="currentColor" strokeWidth={0} />
                      ))}
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-300">&ldquo;{t.quote}&rdquo;</p>
                    <p className="mt-4 text-sm font-bold text-white">
                      {t.name} <span className="font-normal text-slate-400">&middot; {t.location}</span>
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Locations */}
        <section id="locations" className="scroll-mt-20 border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>Clinics</Eyebrow>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Find a clinic near you</h2>
              <p className="mt-3 text-base text-slate-300">Three clinics across Sydney, all offering MRI, CT, ultrasound and X-ray.</p>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
              {LOCATIONS.map((location, i) => (
                <Reveal key={location.name} delay={i * 90}>
                  <div className={`${glassCard} group relative h-full overflow-hidden p-5 ${cardHover}`}>
                    <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-medical to-teal" />
                    <span className={`${iconChip} h-10 w-10`}>
                      <MapPin size={18} aria-hidden />
                    </span>
                    <h3 className="mt-3 text-base font-bold text-white">{location.name}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">{location.address}</p>
                    <div className="mt-4 space-y-1 border-t border-white/10 pt-3">
                      {location.hours.map((line) => (
                        <p key={line} className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Clock size={13} aria-hidden />
                          {line}
                        </p>
                      ))}
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:border-medical hover:bg-medical hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical"
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
        <section id="safety" className="scroll-mt-20 border-t border-white/10">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Reveal>
              <div className="flex flex-col gap-4 rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-400/10 to-amber-500/5 p-6 sm:flex-row sm:p-7">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-amber-400/15 ring-1 ring-amber-400/20">
                  <ShieldAlert size={22} className="text-amber-300" aria-hidden />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-amber-100">Before you book: MRI safety</h2>
                  <p className="mt-2 text-sm leading-relaxed text-amber-200/80">
                    MRI uses a strong magnetic field, so it&rsquo;s important to tell us about certain implants and
                    devices before your appointment. Please disclose any pacemakers, defibrillators, cochlear implants,
                    metal implants, surgical clips or shrapnel when you book &mdash; some of these may mean MRI
                    isn&rsquo;t suitable for you, or that we need extra time to plan your scan safely.
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-amber-200/80">
                    If you feel anxious in enclosed spaces, let us know too. We can talk you through what to expect,
                    offer a wider-bore scanner where available, or discuss sedation options with your referring doctor.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-white/10">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>FAQ</Eyebrow>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Frequently asked questions</h2>
            </Reveal>

            <div className="mt-10 space-y-3">
              {FAQS.map((item, i) => {
                const isOpen = openFaq === i;
                return (
                  <Reveal key={item.q} delay={i * 50}>
                    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                      <button
                        type="button"
                        onClick={() => setOpenFaq(isOpen ? null : i)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical"
                      >
                        <span className="flex items-center gap-2.5">
                          <HelpCircle size={16} className="shrink-0 text-teal-300" aria-hidden />
                          {item.q}
                        </span>
                        <ChevronDown
                          size={18}
                          className={`shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                          aria-hidden
                        />
                      </button>
                      <div className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                        <div className="overflow-hidden">
                          <p className="px-5 pb-4 text-sm leading-relaxed text-slate-300">{item.a}</p>
                        </div>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="relative overflow-hidden border-t border-white/10">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-medical/25 blur-3xl" />
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
                <a href="/login" className={`${ghostBtn} px-6 py-3 text-base`}>
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
      <footer id="contact" className="scroll-mt-20 border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-medical to-medical-dark">
                  <Activity size={20} className="text-white" aria-hidden />
                </span>
                <span className="text-sm font-bold text-white">Capital Radiology</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                Online booking, secure reporting and radiologist-reviewed MRI, CT, ultrasound and X-ray across Sydney.
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contact</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <Phone size={14} className="text-slate-500" aria-hidden />
                  <a href="tel:1300722674" className="hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                    1300 722 674
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Mail size={14} className="text-slate-500" aria-hidden />
                  <a href="mailto:care@capitalradiology.com.au" className="hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                    care@capitalradiology.com.au
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quick links</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {NAV_LINKS.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Account</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li>
                  <a href="/login" className="hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                    Patient login
                  </a>
                </li>
                <li>
                  <a href="/signup" className="hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                    Create an account
                  </a>
                </li>
                <li>
                  <a href="/privacy" className="hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                    Privacy policy
                  </a>
                </li>
                <li>
                  <a href="/terms" className="hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                    Terms of service
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-1 border-t border-white/10 pt-6 text-xs text-slate-500">
            <p>&copy; {new Date().getFullYear()} Capital Radiology. All rights reserved.</p>
            <p>
              3D anatomy model:{" "}
              <a
                href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-white"
              >
                BodyParts3D
              </a>
              , &copy; The Database Center for Life Science, licensed under{" "}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-white"
              >
                CC BY 4.0
              </a>
              {" "}(parts grouped and simplified).
            </p>
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
