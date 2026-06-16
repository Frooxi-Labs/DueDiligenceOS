/** Minimal route-transition loader: the Band mark inside a thin spinning ring. */
export default function Loading() {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
        <span
          className="absolute inset-0 rounded-full animate-spin"
          style={{ border: '2px solid rgba(255,255,255,0.08)', borderTopColor: '#35d277', animationDuration: '0.85s' }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/band-logo.svg" alt="" width={30} height={30} style={{ opacity: 0.95 }} />
      </div>
    </div>
  );
}
