import { type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export interface AnimatedGradientTextProps extends ComponentPropsWithoutRef<"span"> {
  speed?: number;
  colorFrom?: string;
  colorVia?: string;
  colorTo?: string;
}

export function AnimatedGradientText({
  children,
  className,
  speed = 1,
  colorFrom = "#0ea5e9",
  colorVia = "#38bdf8",
  colorTo = "#818cf8",
  ...props
}: AnimatedGradientTextProps) {
  return (
    <span
      style={
        {
          "--bg-size": `${speed * 300}%`,
        } as React.CSSProperties
      }
      className={cn(
        "animate-gradient inline bg-gradient-to-r from-[#0ea5e9] via-[#38bdf8] to-[#818cf8] bg-[length:300%_100%] bg-clip-text text-transparent font-extrabold",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
