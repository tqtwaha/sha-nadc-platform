'use client';

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        padding: '6px 14px',
        background: '#50C020',
        color: 'white',
        border: 0,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      Print / Save as PDF
    </button>
  );
}
