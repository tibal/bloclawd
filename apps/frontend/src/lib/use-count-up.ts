import {
  animate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";
import { useEffect, useState } from "react";

import { formatInteger } from "./format";

export function useCountUp(
  target: number | null | undefined,
  options: { duration?: number; format?: (n: number) => string } = {},
): string {
  const { duration = 1.2, format = formatInteger } = options;
  const value = useMotionValue(0);
  const reduce = useReducedMotion();
  const [text, setText] = useState(() => format(0));

  useMotionValueEvent(value, "change", (latest) => {
    setText(format(Math.round(latest)));
  });

  useEffect(() => {
    if (typeof target !== "number" || !Number.isFinite(target)) return;
    if (value.get() === target) return;

    const controls = animate(value, target, {
      duration: reduce ? 0 : duration,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [target, duration, reduce, value]);

  return text;
}
