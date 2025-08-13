import React, { useEffect, useRef, useState } from "react";

interface MiniBarChartProps {
  data: number[];
  labels: string[];
  colors?: string[];
  height?: number;
}

export const MiniBarChart: React.FC<MiniBarChartProps> = ({
  data,
  labels,
  colors,
  height = 140,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(480);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setContainerWidth(w);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const maxValue = Math.max(...data, 1);
  const paddingX = containerWidth < 360 ? 10 : 16;
  const barGap = containerWidth < 360 ? 8 : 16;
  const barCount = data.length;
  const width = Math.max(containerWidth, 200);
  const innerWidth = width - paddingX * 2;
  const barWidth = Math.max(8, (innerWidth - barGap * (barCount - 1)) / barCount);
  const chartHeight = height - 40; // leave room for value labels
  const valueFontSize = containerWidth < 360 ? 10 : 12;
  const labelFontSize = containerWidth < 360 ? 10 : 11;

  return (
    <div ref={containerRef} className="w-full pt-2">
      <svg width={width} height={height} className="block overflow-visible">
        {/* Axis line */}
        <line
          x1={paddingX}
          y1={chartHeight}
          x2={width - paddingX}
          y2={chartHeight}
          stroke="#E5E7EB"
          strokeWidth={1}
        />
        {data.map((value, idx) => {
          const barHeight = (value / maxValue) * (chartHeight - 8);
          const x = paddingX + idx * (barWidth + barGap);
          const y = chartHeight - barHeight;
          const color = colors?.[idx] ?? "#06b6d4";
          return (
            <g key={idx}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={6}
                fill={color}
                opacity={0.9}
              />
              {/* Value label */}
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize={valueFontSize}
                fill="#111827"
              >
                {(value / 100000000).toFixed(2)}
              </text>
              {/* Category label */}
              <text
                x={x + barWidth / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize={labelFontSize}
                fill="#6B7280"
              >
                {labels[idx]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
