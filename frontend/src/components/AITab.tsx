import { useState } from 'react';
import {
  Bot,
  Sparkles,
  Send,
  Terminal,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
} from 'lucide-react';
import { AIAnalysisResponse } from '../types';
import { explainClusterHealth } from '../services/api';

export function AITab() {
  const [question, setQuestion] = useState('');
  const [analysis, setAnalysis] = useState<AIAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const runAnalysis = async (customQ?: string) => {
    setLoading(true);
    try {
      const data = await explainClusterHealth(customQ || question);
      setAnalysis(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const quickPrompts = [
    'Explain overall cluster health and node resource balance',
    'Why is auth-service entering CrashLoopBackOff?',
    'Recommend CPU and memory limit optimizations',
    'Audit recent warning events across all namespaces',
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Copilot Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-950/50 via-slate-900 to-blue-950/40 border border-purple-800/40 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/50 flex items-center justify-center shadow-lg shadow-purple-600/20">
              <Bot className="w-6 h-6 text-purple-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Gemini Kubernetes SRE Copilot
              </h2>
              <p className="text-xs text-purple-300/80 font-mono">Autonomous Diagnostic & Root Cause Engine</p>
            </div>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Powered by local Ollama (llama3.2) with Google Gemini fallback. Analyzes real-time metrics, node capacity, CrashLoop container logs,
            and cluster event streams to explain incidents and recommend fixes.
          </p>
        </div>

        <button
          onClick={() => runAnalysis()}
          disabled={loading}
          className="px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold text-xs transition-all shadow-lg shadow-purple-600/25 flex items-center gap-2 self-start md:self-auto flex-shrink-0"
        >
          <Sparkles className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Synthesizing Cluster State...' : 'Explain Cluster Health'}
        </button>
      </div>

      {/* Quick Prompts */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-purple-400" /> Quick SRE Diagnostic Prompts:
        </p>
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={() => {
                setQuestion(p);
                runAnalysis(p);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-800 text-slate-300 text-xs transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Prompt Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (question) runAnalysis();
        }}
        className="flex items-center gap-3"
      >
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Ask Gemini anything about your cluster, pods, or metrics..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full pl-4 pr-10 py-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !question}
          className="px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium text-xs transition-colors flex items-center gap-2"
        >
          <Send className="w-4 h-4" /> Send
        </button>
      </form>

      {/* AI Analysis Result */}
      {analysis && (
        <div className="space-y-5">
          <div className="p-6 rounded-2xl bg-[#111827] border border-slate-800 space-y-5 shadow-xl">
            {/* Title & Severity */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    analysis.severity === 'Critical'
                      ? 'bg-rose-950 text-rose-400 border border-rose-800'
                      : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{analysis.title}</h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Engine: <span className="text-purple-300">{analysis.model_used}</span> • Generated at:{' '}
                    {analysis.timestamp.includes('T') ? analysis.timestamp.split('T')[1].slice(0, 8) : analysis.timestamp}
                  </p>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold self-start sm:self-auto ${
                  analysis.severity === 'Critical'
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}
              >
                Severity: {analysis.severity}
              </span>
            </div>

            {/* Executive Summary */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-200 leading-relaxed">
              <span className="font-semibold text-cyan-400">Executive Summary: </span>
              {analysis.summary}
            </div>

            {/* Root Cause Markdown Breakdown */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Detailed Diagnostic Findings</h4>
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                {analysis.root_cause_analysis}
              </div>
            </div>

            {/* Actionable Recommendations */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4 text-amber-400" /> SRE Action Plan
              </h4>
              <div className="space-y-2">
                {analysis.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-slate-900 border border-slate-800/70 flex items-start gap-2.5 text-xs text-slate-200"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>{rec}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Suggested Kubectl Commands */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-cyan-400" /> Suggested Kubectl Diagnostic Commands
              </h4>
              <div className="space-y-2">
                {analysis.suggested_commands.map((cmd, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-[#090D16] border border-slate-800 flex items-center justify-between gap-3 font-mono text-xs text-cyan-300"
                  >
                    <span className="truncate">{cmd}</span>
                    <button
                      onClick={() => copyToClipboard(cmd)}
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex-shrink-0 flex items-center gap-1 text-[11px] font-sans"
                      title="Copy command"
                    >
                      {copiedCmd === cmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCmd === cmd ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
