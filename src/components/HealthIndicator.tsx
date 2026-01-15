'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  timestamp: number;
  uptime: number;
  circuits: {
    name: string;
    isOpen: boolean;
    failures: number;
  }[];
}

interface HealthIndicatorProps {
  /** How often to check health (ms). Default: 15000 (15s) */
  pollInterval?: number;
  /** Callback when status changes */
  onStatusChange?: (status: HealthStatus['status'], previousStatus: HealthStatus['status']) => void;
}

interface StatusAlert {
  message: string;
  type: 'warning' | 'error' | 'success';
  timestamp: number;
}

const STATUS_CONFIG = {
  healthy: {
    color: 'bg-green-500',
    pulse: false,
    label: 'Server healthy',
    ringColor: 'ring-green-500/30',
  },
  degraded: {
    color: 'bg-yellow-500',
    pulse: true,
    label: 'Server degraded',
    ringColor: 'ring-yellow-500/30',
  },
  unhealthy: {
    color: 'bg-red-500',
    pulse: true,
    label: 'Server unhealthy',
    ringColor: 'ring-red-500/30',
  },
  unknown: {
    color: 'bg-surface-500',
    pulse: false,
    label: 'Checking...',
    ringColor: 'ring-surface-500/30',
  },
};

export function HealthIndicator({ pollInterval = 15000, onStatusChange }: HealthIndicatorProps) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [alert, setAlert] = useState<StatusAlert | null>(null);
  const previousStatusRef = useRef<HealthStatus['status']>('unknown');
  const consecutiveFailuresRef = useRef(0);
  // Stable reference to onStatusChange to avoid recreating checkHealth
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  // Auto-dismiss alerts after 8 seconds
  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [alert]);

  const checkHealth = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('/api/health', {
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: HealthStatus = await response.json();
      setHealth(data);
      consecutiveFailuresRef.current = 0;

      // Notify on status change
      if (data.status !== previousStatusRef.current && previousStatusRef.current !== 'unknown') {
        onStatusChangeRef.current?.(data.status, previousStatusRef.current);

        // Show alert for status changes
        if (data.status === 'unhealthy') {
          setAlert({
            message: 'Server is not responding. Some features may not work.',
            type: 'error',
            timestamp: Date.now(),
          });
        } else if (data.status === 'degraded') {
          setAlert({
            message: 'Server is degraded. AI features may be temporarily unavailable.',
            type: 'warning',
            timestamp: Date.now(),
          });
        } else if (previousStatusRef.current === 'unhealthy' && data.status === 'healthy') {
          setAlert({
            message: 'Server connection restored.',
            type: 'success',
            timestamp: Date.now(),
          });
        }
      }
      previousStatusRef.current = data.status;
    } catch {
      consecutiveFailuresRef.current += 1;

      // After 2 consecutive failures, mark as unhealthy
      if (consecutiveFailuresRef.current >= 2) {
        const unhealthyStatus: HealthStatus = {
          status: 'unhealthy',
          timestamp: Date.now(),
          uptime: 0,
          circuits: [],
        };
        setHealth(unhealthyStatus);

        if (previousStatusRef.current !== 'unhealthy') {
          onStatusChangeRef.current?.('unhealthy', previousStatusRef.current);
          setAlert({
            message: 'Lost connection to server. Some features may not work.',
            type: 'error',
            timestamp: Date.now(),
          });
        }
        previousStatusRef.current = 'unhealthy';
      }
    }
  }, []); // No dependencies - uses refs for stable polling

  // Initial check and polling
  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, pollInterval);
    return () => clearInterval(interval);
  }, [checkHealth, pollInterval]);

  const status = health?.status ?? 'unknown';
  const config = STATUS_CONFIG[status];

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const alertStyles = {
    warning: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-200',
    error: 'bg-red-500/20 border-red-500/50 text-red-200',
    success: 'bg-green-500/20 border-green-500/50 text-green-200',
  };

  return (
    <>
      {/* Status Alert Banner - fixed position so it's always visible */}
      {alert && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className={`flex items-center gap-3 px-4 py-2 rounded-lg border backdrop-blur-sm shadow-lg ${alertStyles[alert.type]}`}>
            {alert.type === 'error' && (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            {alert.type === 'warning' && (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {alert.type === 'success' && (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            <span className="text-sm font-medium">{alert.message}</span>
            <button
              onClick={() => setAlert(null)}
              className="ml-2 p-1 rounded hover:bg-white/10 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <button
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={() => checkHealth()}
          className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-surface-800/50 transition-colors"
          title="Click to refresh server status"
        >
          {/* Status dot with optional pulse */}
          <div className="relative">
            <div className={`w-2 h-2 rounded-full ${config.color}`} />
            {config.pulse && (
              <div className={`absolute inset-0 w-2 h-2 rounded-full ${config.color} animate-ping opacity-75`} />
            )}
          </div>
          {/* Only show text label when not healthy - keeps UI subtle when things are working */}
          {status !== 'healthy' && (
            <span className="text-xs text-surface-400">{config.label}</span>
          )}
        </button>

        {/* Tooltip with details */}
        {showTooltip && health && (
          <div className="absolute top-full mt-2 right-0 w-64 bg-surface-900 border border-surface-700 rounded-lg shadow-xl p-3 z-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-surface-200">Server Status</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                status === 'healthy' ? 'bg-green-500/20 text-green-400' :
                status === 'degraded' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {status}
              </span>
            </div>

            {health.uptime > 0 && (
              <div className="text-xs text-surface-400 mb-2">
                Uptime: {formatUptime(health.uptime)}
              </div>
            )}

            {health.circuits.length > 0 && (
              <div className="space-y-1 mt-2 pt-2 border-t border-surface-800">
                <span className="text-xs text-surface-500">Circuit Breakers:</span>
                {health.circuits.map((circuit) => (
                  <div key={circuit.name} className="flex items-center justify-between text-xs">
                    <span className="text-surface-400">{circuit.name}</span>
                    <span className={circuit.isOpen ? 'text-red-400' : 'text-green-400'}>
                      {circuit.isOpen ? `OPEN (${circuit.failures} fails)` : 'closed'}
                    </span>
                  </div>
                ))}
              </div>
            )}


            <div className="mt-2 pt-2 border-t border-surface-800 text-xs text-surface-500">
              Click to refresh • Auto-checks every {pollInterval / 1000}s
            </div>
          </div>
        )}
      </div>
    </>
  );
}
