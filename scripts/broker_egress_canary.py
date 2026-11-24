#!/usr/bin/env python3
"""Explicit read-only live canary. Copies only encrypted cache; never issues tokens."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

NH_CODE=r'''
import {loadConfig} from "./dist/config.js";
import {relayFetch} from "./dist/relay-transport.js";
import {unseal} from "./dist/cache-crypto.js";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {homedir} from "node:os";
import {join} from "node:path";
const c=loadConfig();
const scope=createHash("sha256").update(JSON.stringify([c.authUrl,c.baseUrl,c.appKey,c.appSecret])).digest("hex").slice(0,32);
const file=join(homedir(),".local/state/namuh-mcp","token-"+scope+".json");
const {value,scheme}=unseal(JSON.parse(readFileSync(file,"utf8")),c.appSecret,scope,"systemd-host-v1");
if(scheme!=="systemd-host-v1"||value.scope!==scope||value.expiresAt<=Date.now()+60000)throw Error("CACHE_UNAVAILABLE");
const r=await relayFetch(c.baseUrl+"/krstock/quote/v1/currentPrice",{method:"POST",redirect:"manual",headers:{"x-client-id":c.appKey,"x-client-secret":c.appSecret,authorization:"Bearer "+value.token,"content-type":"application/json"},body:JSON.stringify({Input_0:{iem_cd:"005930",market_cd:"KRX"}})},"/tmp/relay/nh.sock");
const data=await r.json();
console.log(JSON.stringify({http_status:r.status,broker_ok:r.ok&&data.rsp_cd==="00000",token_reused:true}));
'''
KIS_CODE=r'''
import json
from kis_mcp.client import KISClient,TOKEN_PATH
from kis_mcp.config import Settings
def transport(url,method,headers,payload):
    if url.split("?")[0].endswith(TOKEN_PATH):raise RuntimeError("ISSUANCE_FORBIDDEN")
    return KISClient._urlopen_transport(url,method,headers,payload)
c=KISClient(Settings.from_env(),transport=transport)
c._allow_disk_cache=True
assert c.auth_security_status()["cache_format"]=="systemd-host-v1"
assert c.auth_security_status()["disk_valid"]
result=c.domestic_balance()
print(json.dumps({"broker_ok":result.get("complete") is True,"token_reused":True}))
'''

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--live-readonly",action="store_true",required=True)
    args=parser.parse_args()
    home=Path.home()
    all_ok=True
    for broker,repo,state in (("NH","Namuh_MCP_Sever","namuh-mcp"),("KIS","KIS_MCP_Sever","kis-mcp")):
        with tempfile.TemporaryDirectory(prefix="broker-canary-") as temp:
            root=Path(temp); relay=root/"relay";relay.mkdir(mode=0o700)
            cache=root/"cache";cache.mkdir(mode=0o700)
            source=home/".local/state"/state
            # No plaintext or unrelated data copied.
            for file in source.glob("token-*.json"):
                obj=json.loads(file.read_text())
                if obj.get("scheme")!="systemd-host-v1":raise RuntimeError("Encrypted cache required")
                shutil.copy2(file,cache/file.name)
            shutil.copy2(source/"host-protection",cache/"host-protection")
            if not list(cache.glob("token-*.json")):raise RuntimeError("Cache absent")
            p=subprocess.Popen(["/usr/bin/python3",str(home/"Namuh_MCP_Sever/scripts/broker_egress_relay.py"),"--broker",broker,"--socket-dir",str(relay)],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
            try:
                for _ in range(50):
                    if (relay/(broker.lower()+".sock")).is_socket():break
                    if p.poll() is not None:raise RuntimeError("Relay exited")
                    time.sleep(.1)
                assert (relay/(broker.lower()+".sock")).is_socket()
                cred="/run/systemd/io.systemd.Credentials"
                cmd=["/usr/bin/bwrap","--unshare-user","--unshare-net","--unshare-pid","--ro-bind","/","/",
                     "--proc","/proc","--dev","/dev","--tmpfs","/run","--tmpfs","/tmp","--tmpfs","/home","--tmpfs","/mnt","--tmpfs","/var/tmp",
                     "--ro-bind",cred,cred,"--dir",str(home),"--ro-bind",str(home/repo),str(home/repo),
                     "--bind",str(cache),str(home/".local/state"/state),"--ro-bind",str(relay),"/tmp/relay",
                     "--chdir",str(home/repo),"--clearenv","--setenv","HOME",str(home),"--setenv","PATH","/usr/bin:/bin","--die-with-parent"]
                if broker=="NH":
                    cmd+=["--","/usr/bin/node","--input-type=module","-e",NH_CODE]
                else:
                    cmd+=["--ro-bind",str(home/"miniconda3"),str(home/"miniconda3"),"--setenv","KIS_BROKER_RELAY_SOCKET","/tmp/relay/kis.sock","--",str(home/repo/".venv/bin/python"),"-c",KIS_CODE]
                r=subprocess.run(cmd,capture_output=True,text=True,timeout=35)
                # Never echo raw stderr/stdout from authenticated process.
                try:
                    data=json.loads(r.stdout)
                    safe={"broker_ok":data.get("broker_ok") is True,"token_reused":data.get("token_reused") is True}
                    if isinstance(data.get("http_status"),int):safe["http_status"]=data["http_status"]
                except (ValueError,AttributeError):
                    safe={"broker_ok":False}
                ok=r.returncode==0 and safe["broker_ok"]
                all_ok=all_ok and ok
                print(json.dumps({"broker":broker,"exit_code":r.returncode,**safe}),flush=True)
            finally:
                p.terminate()
                p.communicate(timeout=8)
    return 0 if all_ok else 1

if __name__=="__main__":
    raise SystemExit(main())
