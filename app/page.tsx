"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Atom,
  BadgeCheck,
  Bone,
  Building2,
  CalendarCheck,
  CalendarPlus,
  ChevronDown,
  Clock,
  FileCheck2,
  Globe,
  Heart,
  HeartPulse,
  HelpCircle,
  Landmark,
  LogIn,
  Magnet,
  Mail,
  MapPin,
  Menu,
  Phone,
  Quote,
  Ribbon,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Smile,
  Stethoscope,
  Syringe,
  Waves,
  Wind,
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
  { value: "40+", label: "Clinics across Melbourne", icon: Building2 },
  { value: "15", label: "Clinics with MRI", icon: Magnet },
  { value: "2–3 days", label: "Report to your doctor", icon: FileCheck2 },
  { value: "Bulk-billed", label: "Most services", icon: Landmark },
];

const SERVICES = [
  { name: "MRI", icon: Magnet, description: "Uses a strong magnetic field and radio waves to produce detailed images of the body’s internal structures." },
  { name: "CT", icon: ScanLine, description: "Uses X-rays to create detailed cross-sectional images of the body in thin slices." },
  { name: "General X-Ray", icon: Bone, description: "Fast, widely used imaging for bones, chest and joints. Walk-ins welcome." },
  { name: "Ultrasound", icon: Waves, description: "Uses high-frequency sound waves to create real-time images of the body." },
  { name: "Mammography", icon: Ribbon, description: "Breast imaging that helps detect breast cancer in its early stages." },
  { name: "Bone Densitometry", icon: Activity, description: "A low-energy X-ray test that measures bone density or bone loss." },
  { name: "Nuclear Medicine", icon: Atom, description: "Uses small amounts of radioactive material to show how organs and tissues are functioning." },
  { name: "CT Coronary Angiography", icon: HeartPulse, description: "A non-invasive CT examination of the coronary arteries." },
  { name: "Echocardiography", icon: Heart, description: "An ultrasound examination of the heart." },
  { name: "Lung Cancer Screening", icon: Wind, description: "Low-dose chest CT, in partnership with the National Lung Cancer Screening Program." },
  { name: "Interventional Procedures", icon: Syringe, description: "Image-guided procedures, including injections for osteoarthritis, targeted precisely using imaging." },
  { name: "Dental Imaging (OPG)", icon: Smile, description: "A panoramic image of the entire mouth. Walk-ins welcome." },
];

const STEPS = [
  { title: "Get a referral", description: "Ask your GP or specialist for a referral. GP referrals are valid for 12 months." },
  { title: "Book online", description: "Choose your nearest MRI clinic and a time that suits you, attach your referral and complete your safety screening." },
  { title: "Attend your scan", description: "Our radiographers take you through your scan. How long it takes depends on the type of MRI your doctor has requested." },
  { title: "Results", description: "A radiologist reports on your images and your referring doctor typically receives the report within 2–3 business days." },
];

const WHY_US = [
  { title: "All referrals accepted", icon: FileCheck2, description: "We accept referrals from any GP or specialist, for all of our imaging services." },
  { title: "Bulk billing", icon: Landmark, description: "Most services are bulk-billed, and pensioners and health care card holders are bulk-billed." },
  { title: "40+ clinics", icon: Building2, description: "A network of more than 40 clinics across Melbourne, 15 of them offering MRI." },
  { title: "Radiologist-reported", icon: Stethoscope, description: "Radiologists, radiographers, sonographers and support staff working together at every clinic." },
];

const LOCATIONS = [
  { name: "Berwick", address: "286 Clyde Road, Berwick VIC 3806", phone: "(03) 8773 5788", hours: ["Mon–Fri: 8:30am – 5:30pm", "Sat: 9am – 1pm"] },
  { name: "Camberwell", address: "607-609 Riversdale Road, Camberwell VIC 3124", phone: "(03) 8808 7688", hours: ["Mon–Fri: 8:30am – 5pm", "Sat: Closed"] },
  { name: "Cheltenham", address: "4/10 Jamieson Street, Cheltenham VIC 3192", phone: "(03) 9262 5488", hours: ["Mon–Fri: 8:30am – 5pm", "Sat: 9am – 1pm"] },
  { name: "Clayton Monash House", address: "Suite 1, 271 Clayton Road, Clayton VIC 3168", phone: "(03) 8546 6288", hours: ["Mon–Fri: 8:30am – 5pm", "Sat: 9am – 1pm"] },
  { name: "Cranbourne", address: "130-132 South Gippsland Highway, Cranbourne VIC 3977", phone: "(03) 5911 5200", hours: ["Mon–Fri: 9am – 5pm", "Sat: Closed"] },
  { name: "Dandenong", address: "54/56 Princes Highway, Dandenong VIC 3175", phone: "(03) 8788 9888", hours: ["Mon–Fri: 9am – 5pm", "Sat: 9am – 1pm"] },
  { name: "Epping", address: "1/500 High Street, Epping VIC 3076", phone: "(03) 8401 8401", hours: ["Mon–Fri: 8:30am – 5pm", "Sat: Closed"] },
  { name: "Footscray Western Private Hospital", address: "Western Private Hospital - Corner Eleanor and Marion Streets, Footscray VIC 3011", phone: "(03) 9236 4088", hours: ["Mon–Fri: 9am – 5pm", "Sat: 9am – 1pm"] },
  { name: "Niddrie", address: "1 Treadwell Road, Niddrie VIC 3042", phone: "(03) 9334 3434", hours: ["Mon–Fri: 9am – 5pm", "Sat: Closed"] },
  { name: "Pakenham", address: "Suite 1, 20 Station St, Pakenham VIC 3810", phone: "(03) 5929 8100", hours: ["Mon–Fri: 9am – 5pm", "Sat: Closed"] },
  { name: "Spotswood", address: "G3-4/30 Macindoe Ct, Spotswood VIC 3015", phone: "(03) 9688 2888", hours: ["Mon–Fri: 9am – 5pm", "Sat: Closed"] },
  { name: "Sunshine Private Hospital", address: "Ground Floor, 145 Furlong Road, St Albans VIC 3021", phone: "(03) 8312 7888", hours: ["Mon–Fri: 8:30am – 5pm", "Sat: 9am – 1pm"] },
  { name: "Sydenham", address: "530-532 Melton Highway, Sydenham VIC 3037", phone: "(03) 8361 4488", hours: ["Mon–Fri: 9am – 5pm", "Sat: Closed"] },
  { name: "Vermont Private", address: "Ground Floor 645-647 Burwood Highway, Vermont VIC 3133", phone: "(03) 9841 2555", hours: ["Mon–Fri: 9am – 5pm", "Sat: 9am – 1pm"] },
  { name: "Werribee", address: "27 Princes Highway, Werribee VIC 3030", phone: "(03) 8734 3222", hours: ["Mon–Fri: 9am – 5pm", "Sat: Closed"] },
];

const FAQS = [
  {
    q: "Do I need a referral?",
    a: "Yes. A referral is required for all services at Capital Radiology clinics, and we accept referrals from any GP or specialist. For MRI, we need your referral before scheduling your appointment so we book the correct scan, clinic and appointment length.",
  },
  {
    q: "How long is my referral valid?",
    a: "GP referrals are valid for 12 months. Specialist referral timeframes vary, so contact your clinic if you’re unsure. If your referral lists more than one service, check with our team.",
  },
  {
    q: "Will my scan be bulk-billed?",
    a: "The majority of our services are eligible for bulk billing, and pensioners and health care card holders are bulk-billed. Some specialised services, including certain MRI procedures, may have limited or no Medicare coverage — we’ll let you know about any out-of-pocket cost when you book.",
  },
  {
    q: "Does private health insurance cover my scan?",
    a: "Private health insurance only covers medical imaging for private hospital inpatients.",
  },
  {
    q: "When will my doctor get my results?",
    a: "Your referring doctor can typically expect your report within 2–3 business days. Reports are sent to the doctor who referred you.",
  },
  {
    q: "Can I walk in without an appointment?",
    a: "Walk-ins are available for X-ray and dental imaging only. All other services, including MRI, need an appointment.",
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
                  Capital Radiology is a major provider of advanced diagnostic imaging services and radiology
                  education across Victoria, with more than 40 clinics throughout Melbourne. Our radiologists,
                  radiographers, sonographers and support staff provide care to both patients and referring doctors
                  every day.
                </p>
                <p className="mt-4 text-base leading-relaxed text-slate-300">
                  Capital Radiology is part of Integral Diagnostics (IDX), a group that brings together radiology
                  practices across Australia and New Zealand. Our values: patients first, medical leadership, one
                  team, create value, integrity &amp; excellence, and embrace change.
                </p>
              </Reveal>
              <Reveal delay={120}>
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-medical/10 via-white/[0.04] to-transparent p-6">
                  <Quote size={30} className="text-white/15" aria-hidden />
                  <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-sky-300">Our purpose</p>
                  <p className="mt-3 text-base leading-relaxed text-white">
                    &ldquo;Deliver the best health outcomes for our patients.&rdquo;
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
              <Eyebrow>What we offer</Eyebrow>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Our imaging services</h2>
              <p className="mt-3 text-base text-slate-300">
                A full range of diagnostic imaging across our Melbourne clinics. MRI appointments can be booked online.
              </p>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
                  In the majority of cases we bulk-bill Medicare for your procedure, so in most instances you
                  don&rsquo;t need to pay anything upfront. Pension and concession card holders are bulk-billed where
                  they meet Medicare&rsquo;s criteria.
                </p>
                <p className="mt-3 text-base leading-relaxed text-slate-300">
                  Medicare coverage may be limited or may not apply for some specialised services, including certain
                  MRI procedures, and specialised interventional procedures performed by a radiologist can attract
                  additional fees. We&rsquo;ll let you know about any out-of-pocket cost when you book &mdash; or
                  check with your local clinic before your appointment.
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
                      The majority of our services are eligible for bulk billing.
                    </p>
                  </div>
                  <div className={`${glassCard} p-5`}>
                    <span className={`${iconChip} h-10 w-10`}>
                      <ShieldCheck size={18} aria-hidden />
                    </span>
                    <h3 className="mt-3 text-sm font-bold text-white">Private health cover</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                      Private health insurance only covers medical imaging for private hospital inpatients.
                    </p>
                  </div>
                  <div className={`${glassCard} p-5 sm:col-span-2`}>
                    <span className={`${iconChip} h-10 w-10`}>
                      <CalendarCheck size={18} aria-hidden />
                    </span>
                    <h3 className="mt-3 text-sm font-bold text-white">Other billing arrangements</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                      Workers&rsquo; compensation and overseas patients have separate arrangements &mdash; contact
                      your clinic for details.
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

        {/* Locations */}
        <section id="locations" className="scroll-mt-20 border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>Clinics</Eyebrow>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Find an MRI clinic near you</h2>
              <p className="mt-3 text-base text-slate-300">
                15 of our 40+ Melbourne clinics offer MRI. For X-ray, ultrasound, CT and other services, see{" "}
                <a
                  href="https://capitalradiology.com.au/locations/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-semibold text-sky-300 underline-offset-4 hover:underline"
                >
                  all locations
                </a>
                .
              </p>
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
                    <a
                      href={`tel:${location.phone.replace(/[^\d]/g, "")}`}
                      className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-200 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical"
                    >
                      <Phone size={13} aria-hidden />
                      {location.phone}
                    </a>
                    <div className="mt-4 space-y-1 border-t border-white/10 pt-3">
                      {location.hours.map((line) => (
                        <p key={line} className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Clock size={13} aria-hidden />
                          {line}
                        </p>
                      ))}
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Capital Radiology ${location.address}`)}`}
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
                    If you feel anxious in enclosed spaces, let us know when you book so we can talk you through what
                    to expect.
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
                  <FileCheck2 size={13} aria-hidden /> All referrals accepted
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
                Advanced diagnostic imaging across 40+ clinics in Melbourne. A subsidiary of Integral Diagnostics
                (IDX).
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contact</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <Phone size={14} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
                  <a href="#locations" className="hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical">
                    Call your nearest clinic
                  </a>
                </li>
                <li className="flex items-start gap-2">
                  <Mail size={14} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
                  <span>PO Box 551, East Melbourne VIC 8002</span>
                </li>
                <li className="flex items-start gap-2">
                  <Globe size={14} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
                  <a
                    href="https://capitalradiology.com.au/about/general-enquiry/"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical"
                  >
                    General enquiry form
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
