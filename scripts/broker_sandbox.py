#!/usr/bin/env python3
"""Broker-only namespace launcher. Fixed task selection, no arbitrary command."""
import argparse
import os
from pathlib import Path
import stat
import sys
import time

TASKS={
 "NH":{"mcp":["/usr/bin/node","dist/index.js"],"snapshot":["/usr/bin/node","scripts/capture_daily.mjs"],"nav":["/usr/bin/node","scripts/capture_nav_daily.mjs"]},
 "KIS":{"mcp":[".venv/bin/python","-m","kis_mcp"],"snapshot":[".venv/bin/python","-m","kis_mcp.capture_daily"]},
}
def build(broker,task,*,home,relay,state,share,cache_only=False):
    repo=home/("Namuh_MCP_Sever" if broker=="NH" else "KIS_MCP_Sever")
    state_name="namuh-mcp" if broker=="NH" else "kis-mcp"
    share_name="namuh-portfolio" if broker=="NH" else "kis-mcp"
    sock=relay/(broker.lower()+".sock")
    for p in (relay,state,share):
        st=p.lstat()
        if not stat.S_ISDIR(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode&0o077:
            raise RuntimeError("Unsafe private directory")
    deadline=time.monotonic()+10
    while not sock.exists() and not sock.is_symlink() and time.monotonic()<deadline:
        time.sleep(.1)
    st=sock.lstat()
    if not stat.S_ISSOCK(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode&0o077:
        raise RuntimeError("Relay socket unavailable")
    cred="/run/systemd/io.systemd.Credentials"
    cmd=["/usr/bin/bwrap","--unshare-user","--unshare-net","--unshare-pid","--ro-bind","/","/",
         "--proc","/proc","--dev","/dev","--tmpfs","/run","--tmpfs","/tmp","--tmpfs","/home","--tmpfs","/mnt","--tmpfs","/var/tmp",
         "--ro-bind",cred,cred,"--dir",str(home),"--ro-bind",str(repo),str(repo),
         "--bind",str(state),str(home/".local/state"/state_name),
         "--bind",str(share),str(home/".local/share"/share_name),
         "--ro-bind",str(relay),"/tmp/relay","--chdir",str(repo),"--clearenv",
         "--setenv","HOME",str(home),"--setenv","PATH","/usr/bin:/bin","--setenv","TZ","Asia/Seoul",
         "--setenv","PYTHONDONTWRITEBYTECODE","1","--die-with-parent",
         "--setenv",("NH" if broker=="NH" else "KIS")+"_BROKER_RELAY_SOCKET","/tmp/relay/"+broker.lower()+".sock"]
    if broker=="KIS":
        cmd+=["--ro-bind",str(home/"miniconda3"),str(home/"miniconda3")]
    if cache_only:cmd+=["--setenv","BROKER_CACHE_ONLY","1"]
    args=TASKS[broker][task].copy()
    if args[0].startswith("."):args[0]=str(repo/args[0])
    return cmd+["--",*args]

def main():
    p=argparse.ArgumentParser()
    p.add_argument("broker",choices=TASKS)
    p.add_argument("task",choices=("mcp","snapshot","nav"))
    p.add_argument("--test-root",type=Path,help="isolated copies for explicit canary only")
    a=p.parse_args()
    if a.task not in TASKS[a.broker]:p.error("task unavailable")
    h=Path.home()
    state=h/".local/state"/("namuh-mcp" if a.broker=="NH" else "kis-mcp")
    share=h/".local/share"/("namuh-portfolio" if a.broker=="NH" else "kis-mcp")
    if a.test_root:
        state=a.test_root/"state";share=a.test_root/"share"
    relay=Path("/run/user")/str(os.getuid())/("broker-relay-"+a.broker)
    os.execv("/usr/bin/bwrap",build(a.broker,a.task,home=h,relay=relay,state=state,share=share,cache_only=bool(a.test_root)))
if __name__=="__main__":main()
