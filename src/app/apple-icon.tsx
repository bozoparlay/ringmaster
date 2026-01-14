import { ImageResponse } from 'next/og';

// Route segment config
export const runtime = 'edge';

// Image metadata
export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

// Apple touch icon generation
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0a0a0f',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '36px',
        }}
      >
        <svg
          width="140"
          height="140"
          viewBox="0 0 140 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer ring */}
          <circle
            cx="70"
            cy="70"
            r="58"
            stroke="rgba(245, 158, 11, 0.4)"
            strokeWidth="5"
            fill="none"
          />
          {/* Inner ring */}
          <circle
            cx="70"
            cy="70"
            r="40"
            stroke="rgba(245, 158, 11, 0.6)"
            strokeWidth="4"
            fill="none"
          />
          {/* Center dot */}
          <circle cx="70" cy="70" r="12" fill="#f59e0b" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
