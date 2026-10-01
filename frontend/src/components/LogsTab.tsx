import { useState, useEffect, useRef } from 'react';
import {
  Search,
  RefreshCw,
  Download,
  Pause,
  Play,
  Terminal,
} from 'lucide-react';
import { PodInfo, PodLogsResponse } from '../types';
import { fetchPodLogs } from '../services/api';

interface LogsTabProps {
  pods: PodInfo[];
  initialNamespace?: string;
  initialPod?: string;
}

export function LogsTab({ pods, initialNamespace, initialPod }: LogsTabProps) {
  const [selectedNamespace, setSelectedNamespace] = useState<string>(initialNamespace || (pods[0]?.namespace ?? 'default'));
  const [selectedPodName, setSelectedPodName] = useState<string>(initialPod || (pods[0]?.name ?? ''));
  const [tailLines, setTailLines] = useState<number>(100);
  const [isLive, setIsLive] = useState<boolean>(true);
  const [filterText, setFilterText] = useState<string>('');
  const [logsData, setLogsData] = useState<PodLogsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const availablePods = pods.filter((p) => p.namespace === selectedNamespace);

  const loadLogs = async () => {
    if (!selectedPodName) return;
    setLoading(true);
    try {
      const data = await fetchPodLogs(selectedNamespace, selectedPodName, undefined, tailLines);
      setLogsData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialPod && initialNamespace) {
      setSelectedNamespace(initialNamespace);
      setSelectedPodName(initialPod);
    }
  }, [initialPod, initialNamespace]);

  useEffect(() => {
    loadLogs();
  }, [selectedNamespace, selectedPodName, tailLines]);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(loadLogs, 3000);
    return () => clearInterval(interval);
  }, [isLive, selectedNamespace, selectedPodName, tailLines]);

  useEffect(() => {
    if (isLive && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logsData, isLive]);

  const filteredLines = (logsData?.logs || []).filter((l) =>
    l.toLowerCase().includes(filterText.toLowerCase())
  );

  const downloadLogs = () => {
    if (!logsData) return;
    const blob = new Blob([logsData.logs.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedNamespace}-${selectedPodName}-${new Date().toISOString()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLineColor = (line: string) => {
    if (line.includes('ERROR') || line.includes('FATAL') || line.includes('Failed')) {
      return 'text-rose-400 bg-rose-950/20';
    }
    if (line.includes('WARN') || line.includes('Warning')) {
      return 'text-amber-400';
    }
    if (line.includes('INFO')) {
      return 'text-cyan-300';
    }
    return 'text-slate-300';
  };

  return (
    <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col">
      {/* Controls Bar */}
      <div className="p-4 rounded-xl bg-[#111827] border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Namespace selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Namespace:</span>
            <select
              value={selectedNamespace}
              onChange={(e) => {
                setSelectedNamespace(e.target.value);
                const firstPod = pods.find((p) => p.namespace === e.target.value);
                if (firstPod) setSelectedPodName(firstPod.name);
              }}
              className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              {Array.from(new Set(pods.map((p) => p.namespace))).map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </select>
          </div>

          {/* Pod selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Pod:</span>
            <select
              value={selectedPodName}
              onChange={(e) => setSelectedPodName(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 font-mono max-w-[240px] truncate"
            >
              {availablePods.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} ({p.status})
                </option>
              ))}
            </select>
          </div>

          {/* Lines count */}
          <select
            value={tailLines}
            onChange={(e) => setTailLines(Number(e.target.value))}
            className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value={50}>Tail 50 lines</option>
            <option value={100}>Tail 100 lines</option>
            <option value={250}>Tail 250 lines</option>
            <option value={500}>Tail 500 lines</option>
          </select>
        </div>

        {/* Filter and Stream Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search in log lines..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-48"
            />
          </div>

          {/* Live Stream Toggle */}
          <button
            onClick={() => setIsLive(!isLive)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
              isLive
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {isLive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isLive ? 'Live Streaming' : 'Paused'}
          </button>

          {/* Manual Refresh */}
          <button
            onClick={loadLogs}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          {/* Download */}
          <button
            onClick={downloadLogs}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Download log file"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="flex-1 rounded-xl bg-[#090D16] border border-slate-800 flex flex-col overflow-hidden font-mono text-xs shadow-2xl">
        <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>
              {selectedNamespace} / <span className="text-white">{selectedPodName}</span>
            </span>
          </div>
          <span>Showing {filteredLines.length} lines</span>
        </div>

        <div ref={logContainerRef} className="flex-1 p-4 overflow-y-auto space-y-1 select-text">
          {filteredLines.length > 0 ? (
            filteredLines.map((line, idx) => (
              <div key={idx} className={`px-2 py-0.5 rounded leading-relaxed transition-colors ${getLineColor(line)}`}>
                <span className="text-slate-600 select-none mr-3">{idx + 1}</span>
                {line}
              </div>
            ))
          ) : (
            <div className="text-slate-500 italic text-center py-10">
              {loading ? 'Fetching logs...' : 'No log lines match the current filter.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
