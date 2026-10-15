import { useEffect, useState, useRef } from 'react';

export function TacticalCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [visible, setVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  const requestRef = useRef<number | null>(null);
  const targetPos = useRef({ x: -100, y: -100 });

  useEffect(() => {
    // Disable on touch devices
    if (window.matchMedia('(pointer: coarse)').matches) {
      setIsTouch(true);
      return;
    }

    document.documentElement.classList.add('custom-cursor-active');

    const handleMouseMove = (e: MouseEvent) => {
      targetPos.current = { x: e.clientX, y: e.clientY };
      if (!visible) setVisible(true);

      // Check if hovering interactive target
      const target = e.target as HTMLElement | null;
      if (target) {
        const interactive = Boolean(
          target.closest('button, a, input, select, textarea, [role="button"], [data-slot="button"], .cursor-pointer')
        );
        setIsHovering(interactive);
      }
    };

    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);
    const handleMouseLeave = () => setVisible(false);
    const handleMouseEnter = () => setVisible(true);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    // Smooth render loop
    const animate = () => {
      setPos({ x: targetPos.current.x, y: targetPos.current.y });
      requestRef.current = requestAnimationFrame(animate);
    };
    requestRef.current = requestAnimationFrame(animate);

    return () => {
      document.documentElement.classList.remove('custom-cursor-active');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [visible]);

  if (isTouch || !visible) return null;

  const color = isHovering ? '#CCFF00' : '#FACC15';

  return (
    <div
      className="fixed pointer-events-none z-[999999] select-none"
      style={{
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%) scale(${
          isClicking ? 0.85 : isHovering ? 1.15 : 1
        }) rotate(${isHovering ? 45 : 0}deg)`,
        transition: 'transform 0.14s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <svg
        width="38"
        height="38"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="transition-colors duration-150 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]"
      >
        {/* Outer broken circular ring with 4 gaps */}
        <circle
          cx="20"
          cy="20"
          r="14.5"
          stroke={color}
          strokeWidth="2.6"
          strokeDasharray="16.57 6.2"
          strokeDashoffset="8.28"
        />

        {/* 4 Inward cardinal notches at 12, 6, 9, and 3 o'clock */}
        <line x1="20" y1="4.5" x2="20" y2="10.5" stroke={color} strokeWidth="2.6" strokeLinecap="square" />
        <line x1="20" y1="35.5" x2="20" y2="29.5" stroke={color} strokeWidth="2.6" strokeLinecap="square" />
        <line x1="4.5" y1="20" x2="10.5" y2="20" stroke={color} strokeWidth="2.6" strokeLinecap="square" />
        <line x1="35.5" y1="20" x2="29.5" y2="20" stroke={color} strokeWidth="2.6" strokeLinecap="square" />

        {/* Inner thin concentric ring */}
        <circle cx="20" cy="20" r="9" stroke={color} strokeWidth="1.2" />

        {/* Central crosshair (+ cross) */}
        <line x1="11" y1="20" x2="29" y2="20" stroke={color} strokeWidth="1.2" />
        <line x1="20" y1="11" x2="20" y2="29" stroke={color} strokeWidth="1.2" />

        {/* Tick marks on horizontal arm */}
        <line x1="14.5" y1="18.2" x2="14.5" y2="21.8" stroke={color} strokeWidth="1" />
        <line x1="17.2" y1="18.5" x2="17.2" y2="21.5" stroke={color} strokeWidth="1" />
        <line x1="22.8" y1="18.5" x2="22.8" y2="21.5" stroke={color} strokeWidth="1" />
        <line x1="25.5" y1="18.2" x2="25.5" y2="21.8" stroke={color} strokeWidth="1" />

        {/* Tick marks on vertical arm */}
        <line x1="18.2" y1="14.5" x2="21.8" y2="14.5" stroke={color} strokeWidth="1" />
        <line x1="18.5" y1="17.2" x2="21.5" y2="17.2" stroke={color} strokeWidth="1" />
        <line x1="18.5" y1="22.8" x2="21.5" y2="22.8" stroke={color} strokeWidth="1" />
        <line x1="18.2" y1="25.5" x2="21.8" y2="25.5" stroke={color} strokeWidth="1" />

        {/* Center filled circle / dot */}
        <circle cx="20" cy="20" r="2.4" fill={color} />
      </svg>

      {/* Target status indicator when locked on interactive element */}
      {isHovering && (
        <span className="absolute -top-3.5 left-6 bg-[#CCFF00] text-black font-mono font-black text-[9px] px-1 py-0.2 tracking-widest uppercase pointer-events-none select-none">
          TARGET
        </span>
      )}
    </div>
  );
}
