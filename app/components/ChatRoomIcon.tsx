// Parent-room icon (provided by the design): a chat bubble, themed via currentColor.
export default function ChatRoomIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M15.961,4.543c-3.71,0-7.556,1.26-10.21,3.927c-3.049,3.064-3.238,7.267-1.983,11.192c0.92,2.879,2.488,5.706,4.819,7.677c0.079,0.067,0.197,0.07,0.274,0c0.733-0.665,1.436-1.722,2.091-2.976c1.542,0.511,3.233,0.795,5.009,0.795c7.18,0,13-4.615,13-10.308C28.961,9.159,23.14,4.543,15.961,4.543z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
