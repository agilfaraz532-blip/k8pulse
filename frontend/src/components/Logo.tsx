import { Activity } from 'lucide-react';

/** K8sPulse brand mark: one icon everywhere (sidebar, login, loading screen). */
export function LogoMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const box = { sm: 'w-8 h-8 rounded-lg', md: 'w-9 h-9 rounded-lg', lg: 'w-12 h-12 rounded-xl' }[size];
  const icon = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' }[size];
  return (
    <div className={`${box} bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 flex-shrink-0`}>
      <Activity className={`${icon} text-white`} strokeWidth={2.5} />
    </div>
  );
}

export function Wordmark({ className = 'text-base' }: { className?: string }) {
  return (
    <span className={`font-bold tracking-wide text-white ${className}`}>
      K8s<span className="text-cyan-400">Pulse</span>
    </span>
  );
}
