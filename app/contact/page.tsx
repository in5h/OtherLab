"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function ContactPage() {
  const [idea, setIdea] = useState("");
  const [error, setError] = useState("");

  function prepareEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!idea.trim()) {
      setError("Write a thought first, even if it is only a sentence.");
      return;
    }

    const subject = encodeURIComponent("An idea for OtherLab");
    const body = encodeURIComponent(idea.trim());
    window.location.href = `mailto:insharahaman8@gmail.com?subject=${subject}&body=${body}`;
  }

  return (
    <main className="coraline-page min-h-screen text-[#d9d0b8]">
      <section className="relative z-10 mx-auto flex min-h-screen max-w-5xl items-center px-6 py-16">
        <div className="w-full">
          <Link className="coraline-link text-sm" href="/">
            Back to OtherLab
          </Link>

          <div className="coraline-card mt-8 max-w-3xl rounded-2xl border p-7 sm:p-10">
            <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-[#9e3f35]">
                  OtherLab by Insharah
                </p>
                <h1 className="mt-4 text-4xl font-bold text-[#171717] sm:text-6xl">
                  Welcome to OtherLab
                </h1>
                <p className="mt-5 max-w-xl text-lg leading-8 text-[#51475a]">
                  Have a suggestion, an idea, or a website that needs a proper QA review? Reach out and let us make the next version better.
                </p>
              </div>

              <Image
                src="/button.png"
                alt="OtherLab button"
                width={92}
                height={115}
                className="shrink-0"
              />
            </div>

            <form className="mt-10" onSubmit={prepareEmail}>
              <label className="block text-lg font-semibold text-[#171717]" htmlFor="idea">
                What should we improve or explore?
              </label>
              <textarea
                id="idea"
                value={idea}
                onChange={(event) => {
                  setIdea(event.target.value);
                  setError("");
                }}
                placeholder="Tell me what you noticed, what you need, or what you would love to see next..."
                className="mt-3 min-h-36 w-full resize-y rounded-xl border border-[#665a86] bg-[#182b49] p-4 text-[#d9d0b8] outline-none placeholder:text-[#a79c9d] focus:border-[#d8b84c]"
              />
              {error && <p className="mt-2 text-sm text-[#9e3f35]">{error}</p>}
              <button
                type="submit"
                className="mt-4 rounded-xl bg-[#171717] px-6 py-3 font-semibold text-[#d9d0b8] shadow-[4px_4px_0_#665a86] transition hover:-translate-y-0.5 hover:bg-[#3d315b]"
              >
                Send this idea
              </button>
            </form>

            <div className="mt-10 border-t border-[#665a86] pt-6">
              <p className="text-sm text-[#51475a]">Prefer a direct conversation?</p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold">
                <a className="coraline-link" href="mailto:insharahaman8@gmail.com?subject=Book%20an%20OtherLab%20session">
                  Book a QA session
                </a>
                <a className="coraline-link" href="https://www.linkedin.com/in/insharah-aman/" target="_blank" rel="noreferrer">
                  Connect on LinkedIn
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
