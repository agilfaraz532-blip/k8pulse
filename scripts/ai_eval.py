"""
Evaluate the K8sPulse AI copilot against real Kubernetes failures.

Deploy the scenarios first (kubectl apply -f demo/ai-eval.yaml), wait a minute for them to fail, then:

    python scripts/ai_eval.py                       # backend on http://localhost:8000
    python scripts/ai_eval.py --api http://host:8000 --user admin --password secret --out results.json

For every scenario the copilot's incident analysis is checked for the concepts that make up the real
root cause (each group needs at least one match). Uses only the Python standard library.
"""
import argparse
import json
import re
import sys
import time
import urllib.request

NAMESPACE = "ai-eval"

# name -> (ground truth, concept groups that must all appear in the answer)
SCENARIOS = {
    "web-image-typo": (
        "Image tag nginx:1.27-alpien does not exist",
        [["image"], ["alpien", "tag", "typo", "not found", "does not exist", "incorrect", "invalid", "misspel"]],
    ),
    "api-missing-configmap": (
        "ConfigMap api-config does not exist",
        [["configmap", "config map"], ["api-config"]],
    ),
    "worker-missing-secret": (
        "Secret db-credentials does not exist",
        [["secret"], ["db-credentials"]],
    ),
    "cache-oom": (
        "Memory limit (24Mi) too low, container OOMKilled",
        [["oom", "out of memory", "memory"], ["limit"]],
    ),
    "frontend-bad-liveness": (
        "Liveness probe targets port 8080, nginx listens on 80",
        [["liveness"], ["8080", "port"]],
    ),
    "checkout-not-ready": (
        "Readiness probe path /healthz returns 404",
        [["readiness"], ["healthz", "404"]],
    ),
    "ml-unschedulable": (
        "Requests 64 CPUs, no node can fit it",
        [["cpu"], ["insufficient", "schedul", "request", "64"]],
    ),
    "jobs-bad-command": (
        "Entrypoint /app/run-jobs does not exist in the image",
        [["run-jobs", "command", "executable", "entrypoint", "binary"],
         ["not found", "no such file", "does not exist", "missing", "exec"]],
    ),
    "uploads-readonly-fs": (
        "Root filesystem is read-only, app needs a writable directory",
        [["read-only", "readonly", "read only"]],
    ),
    "orders-db-unreachable": (
        "Service orders-db does not exist, DNS lookup fails",
        [["orders-db"], ["resolve", "dns", "service", "not known", "does not exist"]],
    ),
    "healthy-control": (
        "Healthy, nothing to fix",
        [["healthy", "no issue", "no problem", "running normally", "functioning", "operating normally"]],
    ),
}

# Does the suggested fix name the specific change? (regex, any match)
FIXES = {
    "web-image-typo": r"alpine",
    "api-missing-configmap": r"create configmap|creat\w*.{0,40}api-config|api-config.{0,60}(creat|apply)",
    "worker-missing-secret": r"create secret|creat\w*.{0,40}db-credentials|db-credentials.{0,60}(creat|apply)",
    "cache-oom": r"(increase|raise|higher).{0,40}(memory|limit)|(memory|limit).{0,40}(increase|raise|higher)",
    "frontend-bad-liveness": r"(port|:)\s*80\b",
    "checkout-not-ready": r"(change|update|correct|set|fix|point)\w*.{0,60}(path|endpoint|readiness)|(path|endpoint).{0,40}(exist|200|valid)",
    "ml-unschedulable": r"(reduce|lower|decrease).{0,40}(cpu|request)|(cpu|request).{0,40}(reduce|lower|decrease)",
    "jobs-bad-command": r"(correct|fix|update|change|set)\w*.{0,30}(command|entrypoint)|image.{0,40}(contain|include|build)",
    "uploads-readonly-fs": r"emptydir|writable volume|readonlyrootfilesystem.{0,40}(false|remov|disabl)|(remov|disabl).{0,40}readonlyrootfilesystem",
    "orders-db-unreachable": r"\b(create|deploy|expose|add)\b.{0,40}\b(service|database)\b",
    "healthy-control": r"no action|nothing to fix|no (remediation|fix|changes|commands)\b.{0,20}(required|needed)",
}

# Advice that cannot work for a Deployment-managed pod
BAD_ADVICE = ["kubectl exec", "kubectl edit pod", "kubectl delete pod"]


def request(api: str, path: str, token: str = None, body: dict = None, timeout: int = 420) -> dict:
    req = urllib.request.Request(
        f"{api}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})},
        method="POST" if body is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read())


def fix_section(text: str) -> str:
    """Only what the model says to do counts as a fix, not its description of the problem."""
    match = re.search(r"remediation", text, re.IGNORECASE)
    return text[match.start():] if match else text


def score(text: str, groups) -> list:
    lower = text.lower()
    return [any(term in lower for term in group) for group in groups]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--user", default="admin")
    parser.add_argument("--password", default="admin")
    parser.add_argument("--only", nargs="*", help="run only these scenarios")
    parser.add_argument("--out", help="write full results as JSON")
    args = parser.parse_args()

    def login() -> str:
        return request(args.api, "/api/auth/login", body={"username": args.user, "password": args.password})["access_token"]

    pods = request(args.api, f"/api/cluster/pods?namespace={NAMESPACE}", login())

    results = []
    for name, (truth, groups) in SCENARIOS.items():
        if args.only and name not in args.only:
            continue
        pod = next((p for p in pods if p["name"].startswith(name + "-")), None)
        if pod is None:
            print(f"! {name}: no pod found in namespace {NAMESPACE}", file=sys.stderr)
            continue

        started = time.time()
        try:
            # Fresh token per scenario: a full run can outlast the token lifetime
            answer = request(args.api, "/api/ai/analyze-incident", login(), {"namespace": NAMESPACE, "pod_name": pod["name"]})
            error = None
        except Exception as exc:  # report and keep going
            answer, error = None, str(exc)
        seconds = round(time.time() - started, 1)

        text = (answer or {}).get("root_cause_analysis", "")
        matched = score(text, groups) if answer else [False] * len(groups)
        passed = bool(answer) and all(matched)
        if name == "healthy-control" and answer:
            passed = passed and answer.get("severity") == "Normal"
        bad = [b for b in BAD_ADVICE if b in text.lower()]
        fix_ok = bool(answer) and re.search(FIXES[name], fix_section(text), re.IGNORECASE | re.DOTALL) is not None

        results.append({
            "scenario": name, "pod": pod["name"], "pod_status": pod["status"], "truth": truth,
            "passed": passed, "concepts_matched": f"{sum(matched)}/{len(groups)}", "specific_fix": fix_ok,
            "bad_advice": bad,
            "severity": (answer or {}).get("severity"), "seconds": seconds,
            "model": (answer or {}).get("model_used"), "error": error, "answer": text,
        })
        mark = "PASS" if passed else "FAIL"
        print(f"{mark}  {name:<24} {pod['status']:<28} {sum(matched)}/{len(groups)} concepts  "
              f"fix:{'yes' if fix_ok else 'no ':<3}  {seconds:>6}s"
              + (f"  bad advice: {bad}" if bad else "") + (f"  error: {error}" if error else ""), flush=True)

    total = len(results)
    passed = sum(r["passed"] for r in results)
    clean = sum(not r["bad_advice"] for r in results)
    fixes = sum(r["specific_fix"] for r in results)
    avg = round(sum(r["seconds"] for r in results) / total, 1) if total else 0
    print(f"\nRoot cause found: {passed}/{total}   Specific fix: {fixes}/{total}   "
          f"Safe remediation: {clean}/{total}   Avg latency: {avg}s"
          f"   Model: {results[0]['model'] if results else '-'}")

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
