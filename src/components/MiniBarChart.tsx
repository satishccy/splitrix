import React from "react";

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
  const maxValue = Math.max(...data, 1);
  const paddingX = 16;
  const barGap = 16;
  const barCount = data.length;
  const width = 480;
  const innerWidth = width - paddingX * 2;
  const barWidth = Math.max(
    12,
    (innerWidth - barGap * (barCount - 1)) / barCount
  );
  const chartHeight = height - 40; // leave room for value labels

  return (
    <div className="w-full overflow-x-auto">
      <svg width={width} height={height} className="max-w-full">
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
                fontSize={12}
                fill="#111827"
              >
                {(value / 100000000).toFixed(2)}
              </text>
              {/* Category label */}
              <text
                x={x + barWidth / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize={11}
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
