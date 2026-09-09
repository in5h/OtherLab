"use client";

import Image from "next/image";
import {
  useState,
  useRef,
  useCallback,
  type CSSProperties,
  type PointerEvent,
} from "react";

interface MilkshakeDropProps {
  onCatch: () => void;
  onAnimationEnd?: () => void;
}

export default function MilkshakeDrop({
  onCatch,
  onAnimationEnd,
}: MilkshakeDropProps) {
  const [dragging, setDragging] = useState(false);
  const [top, setTop] = useState(0);

  const suppressClick = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const startDrag = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    suppressClick.current = false;
    setDragging(true);
    setTop((e.clientY / window.innerHeight) * 100);
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
      setTop(Math.min(92, Math.max(4, (e.clientY / window.innerHeight) * 100)));
    },
    [dragging],
  );

  const endDrag = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(suppressClick.current);
  }, []);

  const click = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onCatch();
  };

  return (
    <button
      type="button"
      className={`milkshake-drop ${dragging ? "milkshake-dragging" : ""}`}
      aria-label="Catch the mango milkshake"
      onClick={click}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ "--milkshake-top": `${top}vh` } as CSSProperties}
    >
      <Image
        src="/milkshake.png"
        alt="Mango milkshake"
        width={104}
        height={104}
        onAnimationEnd={onAnimationEnd}
      />{" "}
    </button>
  );
}
