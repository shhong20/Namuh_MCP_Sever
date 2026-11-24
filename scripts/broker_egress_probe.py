#!/usr/bin/env python3
"""Credential-free WSL network-namespace pilot. Never launches an MCP server."""
import argparse
import errno
import json
import os
from pathlib import Path
import select
import socket
import ssl
import subprocess
import tempfile
import threading

# No request-controlled hostname, port, CONNECT command or arbitrary proxy.
DESTINATIONS = {
    "NH": ("api.nhplug.com", 8443),
    "KIS": ("openapi.koreainvestment.com", 9443),
}

def relay_once(listener, host, port, result):
    try:
        listener.settimeout(15)
        client, _ = listener.accept()
        with client, socket.create_connection((host,port),timeout=10) as remote:
            client.settimeout(10)
            remote.settimeout(10)
            result["connected"] = True
            result["destination"] = f"{host}:{port}"
            while True:
                ready,_,_=select.select([client,remote],[],[],10)
                if not ready:break
                for src in ready:
                    data=src.recv(65536)
                    if not data:return
                    (remote if src is client else client).sendall(data)
    except (OSError,ValueError):
        result["relay_error"]=True

def child(path,host,port,ip):
    if Path("/run/user").exists() or Path("/mnt/c").exists():
        print(json.dumps({"host_mounts_hidden":False}))
        return 2
    # No token, account information, API request, or application data is sent.
    with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as s:
        s.settimeout(3)
        direct=s.connect_ex((ip,port))
    blocked=direct in (errno.ENETUNREACH,errno.EHOSTUNREACH,errno.EACCES,errno.EPERM)
    if not blocked:
        print(json.dumps({"direct_blocked":False,"connect_errno":direct}))
        return 2
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as local:
        local.settimeout(10)
        local.connect(path)
        with ssl.create_default_context().wrap_socket(local,server_hostname=host) as tls:
            report={"direct_blocked":True,"host_mounts_hidden":True,"official_tls_verified":bool(tls.getpeercert()),"tls_version":tls.version()}
            print(json.dumps(report))
    return 0

def probe():
    report={}
    with tempfile.TemporaryDirectory(prefix="broker-egress-") as root:
        os.chmod(root,0o700)
        for name,(host,port) in DESTINATIONS.items():
            ip=socket.getaddrinfo(host,port,socket.AF_INET,socket.SOCK_STREAM)[0][4][0]
            result={}
            path=str(Path(root)/(name+".sock"))
            with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as listener:
                listener.bind(path)
                os.chmod(path,0o600)
                listener.listen(1)
                worker=threading.Thread(target=relay_once,args=(listener,host,port,result),daemon=True)
                worker.start()
                command=["/usr/bin/bwrap","--unshare-user","--unshare-net","--unshare-pid","--ro-bind","/","/",
                         "--proc","/proc","--dev","/dev","--tmpfs","/run","--tmpfs","/tmp","--tmpfs","/home",
                         "--tmpfs","/mnt","--tmpfs","/var/tmp","--ro-bind",str(Path(__file__).resolve()),"/tmp/probe.py",
                         "--ro-bind",root,"/tmp/relay","--chdir","/","--clearenv","--setenv","PATH","/usr/bin:/bin","--die-with-parent","--",
                         "/usr/bin/python3","/tmp/probe.py","--child","/tmp/relay/"+name+".sock",host,str(port),ip]
                try:
                    p=subprocess.run(command,capture_output=True,text=True,timeout=20)
                    details=json.loads(p.stdout) if p.stdout.strip() else {}
                    report[name]={"exit_code":p.returncode,**details}
                    if p.returncode:report[name]["probe_stderr"]=p.stderr[:500]
                except (OSError,ValueError,subprocess.TimeoutExpired):
                    report[name]={"exit_code":1,"probe_failed":True}
                worker.join(15)
                report[name].update(result)
    print(json.dumps({"pilot_only":True,"credentials_used":False,"brokers":report}))
    return 0 if all(x.get("exit_code")==0 and x.get("direct_blocked") and x.get("host_mounts_hidden") and x.get("official_tls_verified") for x in report.values()) else 1

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--child",nargs=4)
    args=parser.parse_args()
    if args.child:
        path,host,port,ip=args.child
        if (host,int(port)) not in DESTINATIONS.values():raise SystemExit(2)
        raise SystemExit(child(path,host,int(port),ip))
    raise SystemExit(probe())
