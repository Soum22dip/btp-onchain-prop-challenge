'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ResizableHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
}

export function ResizableHandle({ direction, onResize }: ResizableHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    },
    [direction],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPos.current;
      startPos.current = currentPos;
      onResize(delta);
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, direction, onResize]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`
        ${isHorizontal ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'}
        ${isDragging ? 'bg-[#7C3AED]' : 'bg-white/[0.04] hover:bg-[#7C3AED]/40'}
        transition-colors flex items-center justify-center shrink-0 select-none
      `}
    >
      <div
        className={`
          ${isHorizontal ? 'w-[2px] h-6' : 'h-[2px] w-6'}
          rounded-full
          ${isDragging ? 'bg-[#7C3AED]' : 'bg-white/10'}
        `}
      />
    </div>
  );
}
