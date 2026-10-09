"use client";

import Image from "next/image";
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type CSSProperties,
  type PointerEvent,
} from "react";

const DOLL_MESSAGES = [
  "Would you like a mango milkshake?",
  "Hurry, click on it!",
  "I want you to do something for me.",
  "Click on the button here.",
];

interface DollCompanionProps {
  messageStep: number;
  bubbleOpen: boolean;
  followButton: boolean;
  onOpenBubble: () => void;
  onCloseBubble: () => void;
  onAcceptMilkshake: () => void;
}

export default function DollCompanion({
  messageStep,
  bubbleOpen,
  followButton,
  onOpenBubble,
  onCloseBubble,
  onAcceptMilkshake,
}: DollCompanionProps) {
  const [scrollY, setScrollY] = useState(18);
  const [manualPosition, setManualPosition] = useState<{
    left: number;
    y: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const suppressClick = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  /* --- scroll-based positioning --- */
  useEffect(() => {
    function update() {
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
      setScrollY(18 + progress * 62);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  /* --- drag handlers --- */
  const startDrag = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    suppressClick.current = false;
    setDragging(true);
  }, []);

  const moveDrag = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (!dragging) return;
      const dist = Math.hypot(
        e.clientX - dragStart.current.x,
        e.clientY - dragStart.current.y,
      );
      if (dist > 4) suppressClick.current = true;
      if (!suppressClick.current) return;
      setManualPosition({
        left: Math.min(
          88,
          Math.max(2, (e.clientX / window.innerWidth) * 100 - 4),
        ),
        y: Math.min(94, Math.max(8, (e.clientY / window.innerHeight) * 100)),
      });
    },
    [dragging],
  );

  const endDrag = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  }, []);

  const openBubble = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onOpenBubble();
  };

  const displayedLeft = manualPosition?.left ?? 4;
  const displayedY = manualPosition?.y ?? scrollY;

  return (
    <div
      className={`doll-companion ${followButton ? "doll-follow-button" : ""}`}
      style={
        {
          "--doll-left": `${displayedLeft}vw`,
          "--doll-y": `${displayedY}vh`,
        } as CSSProperties
      }
    >
      <button
        type="button"
        className={`doll-trigger ${dragging ? "doll-trigger-dragging" : ""}`}
        aria-label="Talk to the doll"
        onClick={openBubble}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <Image
          src="/doll.png"
          alt=""
          className="doll-image"
          width={112}
          height={140}
          priority
        />
      </button>

      {bubbleOpen && (
        <div
          className={`doll-bubble ${displayedLeft < 50 ? "doll-bubble-right" : "doll-bubble-left"} ${followButton ? "doll-bubble-follow" : ""}`}
          role="dialog"
          aria-label="Message from the doll"
        >
          {messageStep === 0 && (
            <button
              type="button"
              className="doll-choice doll-choice-no"
              aria-label="No, close this message"
              onClick={onCloseBubble}
            >
              x
            </button>
          )}

          <p
            key={messageStep}
            className="doll-message-typewriter"
            aria-label={DOLL_MESSAGES[messageStep]}
          >
            {Array.from(DOLL_MESSAGES[messageStep]).map((char, i) => (
              <span
                key={`${messageStep}-${i}`}
                className="doll-message-character"
                aria-hidden="true"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                {char === " " ? "\u00a0" : char}
              </span>
            ))}
          </p>

          {messageStep === 0 && (
            <button
              type="button"
              className="doll-choice doll-choice-yes"
              aria-label="Yes, show me the milkshake"
              onClick={onAcceptMilkshake}
            >
              ✓
            </button>
          )}
        </div>
      )}
    </div>
  );
}
