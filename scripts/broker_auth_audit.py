#!/usr/bin/env python3
"""Read both private WSL broker journals; output only allowlisted aggregate metadata."""
import argparse
import collections
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import tempfile

BROKERS = {
    "NH": ("namuh-mcp-tunnel.service", {"https://api.nhplug.com:8443","https://moapi.nhplug.com:8443","https://api.n2plug.com:8443","https://moapi.n2plug.com:8443"}),
    "KIS": ("kis-mcp-tunnel.service", {"https://openapi.koreainvestment.com:9443","https://openapivts.koreainvestment.com:29443"}),
}
EVENTS = {"issue_attempt","issued","memory_reuse","disk_reuse","revoked","outbound","cache_encrypted"}
LIMIT = 20000

def summarize(lines, broker, allowed):
    counts = collections.Counter()
    destinations = collections.Counter()
    unknown_destinations = 0
    parsed = 0
    for line in lines:
        try:
            row = json.loads(line)
            message = row.get("MESSAGE","")
            if not isinstance(message,str):
                continue
            # Tunnel can prefix the child's stderr message.
            start = message.find("{")
            if start < 0:
                continue
            event = json.loads(message[start:])
            if not isinstance(event,dict) or event.get("broker") != broker or event.get("event") not in EVENTS:
                continue
            name = event["event"]
            counts[name] += 1
            parsed += 1
            if name == "outbound":
                origin = event.get("origin")
                if isinstance(origin,str) and origin in allowed:
                    destinations[origin] += 1
                else:
                    unknown_destinations += 1
        except (ValueError,TypeError,AttributeError):
            continue
    alerts = []
    if unknown_destinations:
        alerts.append("UNEXPECTED_DESTINATION")
    if counts["issue_attempt"] > 3:
        alerts.append("EXCESS_TOKEN_ISSUE_ATTEMPTS")
    if counts["revoked"] > 1:
        alerts.append("REPEATED_TOKEN_REVOCATION")
    if counts["issue_attempt"] > counts["issued"]:
        alerts.append("UNMATCHED_ISSUE_ATTEMPT")
    return {"counts":dict(counts),"official_destinations":dict(destinations),
            "unexpected_destination_count":unknown_destinations,"parsed_events":parsed,"alerts":alerts}

def collect(hours):
    result = {"generated_utc":dt.datetime.now(dt.timezone.utc).isoformat(),"window_hours":hours,
              "scope":"broker MCP application audit only; not packet-level evidence","brokers":{}}
    for broker,(unit,allowed) in BROKERS.items():
        units = [unit] + (["namuh-portfolio-snapshot.service","namuh-nav-candidate.service"] if broker=="NH" else ["kis-portfolio-snapshot.service"])
        cmd = ["journalctl","--user",*[arg for name in units for arg in ("-u",name)],"--since",f"{hours} hours ago","-n",str(LIMIT+1),"-o","json","--no-pager","--quiet"]
        try:
            p = subprocess.run(cmd,capture_output=True,text=True,timeout=20)
            rows = p.stdout.splitlines()
            summary = summarize(rows[-LIMIT:],broker,allowed)
            summary["coverage"] = "bounded" if len(rows)>LIMIT else "journal_query_ok" if p.returncode==0 else "query_failed"
            if p.returncode or len(rows)>LIMIT:
                summary["alerts"].append("INCOMPLETE_JOURNAL_QUERY")
            if not summary["parsed_events"]:
                summary["alerts"].append("NO_AUDIT_EVENTS_OBSERVED")
            result["brokers"][broker] = summary
        except (OSError,subprocess.TimeoutExpired):
            result["brokers"][broker]={"coverage":"query_failed","alerts":["INCOMPLETE_JOURNAL_QUERY"]}
    return result

def save_report(report, root):
    root.mkdir(mode=0o700,parents=True,exist_ok=True)
    if root.is_symlink() or root.stat().st_mode&0o077 or root.stat().st_uid!=os.getuid():
        raise RuntimeError("Audit directory permissions invalid")
    dest=root/(dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")+".json")
    fd,tmp=tempfile.mkstemp(prefix=".audit-",dir=root)
    try:
        with os.fdopen(fd,"w") as f:
            json.dump(report,f,ensure_ascii=False,indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp,dest)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
    cutoff=dt.datetime.now(dt.timezone.utc).timestamp()-90*86400
    for p in root.glob("????????T??????Z.json"):
        if not p.is_symlink() and p.is_file() and p.stat().st_mtime<cutoff:
            p.unlink()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--hours",type=int,default=24,choices=range(1,169))
    parser.add_argument("--save",action="store_true")
    args=parser.parse_args()
    report=collect(args.hours)
    if args.save:
        save_report(report,Path.home()/".local/state/broker-auth-audit")
    print(json.dumps(report,ensure_ascii=False))
    return 2 if any(b["coverage"]=="query_failed" for b in report["brokers"].values()) else 0

if __name__=="__main__":
    raise SystemExit(main())
