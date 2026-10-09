"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import DollCompanion from "./components/DollCompanion";
import MilkshakeDrop from "./components/MilkshakeDrop";
import WelcomeScreen from "./components/WelcomeScreen";
import Typewriter from "./components/Typewriter";
import SiteChecker from "./components/SiteChecker";

export default function Home() {
  const router = useRouter();
  const [milkshakeVisible, setMilkshakeVisible] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);

  // Lifted doll state
  const [dollMessageStep, setDollMessageStep] = useState(0);
  const [dollBubbleOpen, setDollBubbleOpen] = useState(false);
  const [dollFollowButton, setDollFollowButton] = useState(false);
  const [dollResetKey, setDollResetKey] = useState(0);

  // Auto-close bubble (timer is an external system, so this is valid)
  useEffect(() => {
    if (!dollBubbleOpen) return;
    const timer = setTimeout(() => setDollBubbleOpen(false), 50000);
    return () => clearTimeout(timer);
  }, [dollBubbleOpen, dollMessageStep]);

  // Progress message step after catching (timer is an external system)
  useEffect(() => {
    if (dollMessageStep !== 2) return;
    const timer = setTimeout(() => setDollMessageStep(3), 1800);
    return () => clearTimeout(timer);
  }, [dollMessageStep]);

  // Show the welcome overlay briefly, then go to the contact page
  useEffect(() => {
    if (!welcomeVisible) return;
    router.prefetch("/contact");
    const timer = setTimeout(() => router.push("/contact"), 2000);
    return () => clearTimeout(timer);
  }, [welcomeVisible, router]);

  function goToContact() {
    if (welcomeVisible) return;
    setMilkshakeVisible(false);
    setWelcomeVisible(true);
    setDollBubbleOpen(false);
    setDollMessageStep(0);
    setDollFollowButton(false);
    setDollResetKey((k) => k + 1);
  }

  function openDollBubble() {
    setDollBubbleOpen(true);
  }

  function closeDollBubble() {
    setDollBubbleOpen(false);
  }

  function acceptMilkshake() {
    // State updates happen directly in the event handler
    setDollMessageStep(1);
    setDollBubbleOpen(true);
    setMilkshakeVisible(true);
  }

  function missMilkshake() {
    // The milkshake fell without being caught: reset the doll so it can offer again
    setMilkshakeVisible(false);
    setDollMessageStep(0);
    setDollBubbleOpen(false);
  }

  function catchMilkshake() {
    // State updates happen directly in the event handler
    setMilkshakeVisible(false);
    setDollMessageStep(2);
    setDollBubbleOpen(true);
    setDollFollowButton(true);
  }

  return (
    <main className="coraline-page min-h-screen text-[#d9d0b8]">
      {/* Doll companion */}
      <DollCompanion
        key={dollResetKey}
        messageStep={dollMessageStep}
        bubbleOpen={dollBubbleOpen}
        followButton={dollFollowButton}
        onOpenBubble={openDollBubble}
        onCloseBubble={closeDollBubble}
        onAcceptMilkshake={acceptMilkshake}
      />

      {/* Milkshake drop */}
      {milkshakeVisible && (
        <MilkshakeDrop
          onCatch={catchMilkshake}
          onAnimationEnd={missMilkshake}
        />
      )}

      {/* Floating CTA */}
      <button
        type="button"
        className="floating-cta-button"
        aria-label="Get in touch about a personal QA review"
        onClick={goToContact}
      >
        <Image src="/button.png" alt="" width={72} height={90} />
      </button>

      {/* Welcome overlay */}
      {welcomeVisible && <WelcomeScreen />}

      {/* Stars */}
      <div className="coraline-stars" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} />
        ))}
      </div>

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-16">
        {/* Hero */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="stitched-border mb-6 inline-flex rounded-full bg-[#3d315b] px-4 py-2 text-sm font-medium text-[#d8b84c] shadow-[3px_3px_0_rgba(0,0,0,0.28)]">
            OtherLab by Insharah
          </div>

          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl lg:text-7xl" aria-label="Does your website actually work?">
            <span className="typewriter-line">
              <Typewriter text="Does your website" id="h1" />
            </span>
            <span className="typewriter-line typewriter-line-accent text-[#d8b84c]">
              <Typewriter text="actually work?" id="h2" delay={19 * 45} />
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-500">
            OtherLab checks the parts of your website visitors use first, then
            explains anything that may need fixing in plain language.
          </p>

          <SiteChecker />
        </div>

        {/* Empty state */}
        <div className="mt-10 text-center">
          <p className="text-sm text-gray-400">
            No account required. Enter a URL and OtherLab will test it.
          </p>
          <div className="mx-auto mt-8 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="font-medium">1. Enter URL</p>
              <p className="mt-1 text-sm text-gray-500">
                Tell OtherLab which website to test.
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="font-medium">2. OtherLab scans</p>
              <p className="mt-1 text-sm text-gray-500">
                It opens the page and checks speed, SEO, accessibility, security and links.
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="font-medium">3. See the results</p>
              <p className="mt-1 text-sm text-gray-500">
                See what passed, failed, or needs attention.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
