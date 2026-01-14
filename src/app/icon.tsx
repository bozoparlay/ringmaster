import { ImageResponse } from 'next/og';

// Route segment config
export const runtime = 'edge';

// Image metadata
export const size = {
  width: 32,
  height: 32,
};
export const contentType = 'image/png';

// Image generation
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Circus tent / ringmaster top hat shape */}
          <path
            d="M12 2L3 10h18L12 2z"
            fill="#f59e0b"
          />
          <path
            d="M4 10v10a2 2 0 002 2h12a2 2 0 002-2V10H4z"
            fill="#fbbf24"
          />
          {/* Ring */}
          <circle
            cx="12"
            cy="15"
            r="4"
            stroke="#1a1a2e"
            strokeWidth="2"
            fill="none"
          />
          {/* Star accent */}
          <circle cx="12" cy="15" r="1.5" fill="#1a1a2e" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
