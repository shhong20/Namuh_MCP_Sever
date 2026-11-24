#!/usr/bin/env python3
"""Fixed-destination, TLS-blind Unix-socket relay. No client-selected destinations."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import signal
import socket
import stat
import struct
import sys
import time

DESTINATIONS={"NH":("api.nhplug.com",8443),"KIS":("openapi.koreainvestment.com",9443)}
MAX_CONNECTIONS=8
CONNECT_TIMEOUT=8
IDLE_TIMEOUT=20
SESSION_TIMEOUT=60

def event(name,broker):
    print(json.dumps({"event":name,"broker":broker,"time":int(time.time())}),file=sys.stderr,flush=True)

async def copy(reader,writer):
    while True:
        data=await asyncio.wait_for(reader.read(65536),IDLE_TIMEOUT)
        if not data:
            if writer.can_write_eof():writer.write_eof()
            return
        writer.write(data)
        await asyncio.wait_for(writer.drain(),IDLE_TIMEOUT)

async def serve(broker,root):
    root=Path(root)
    root.mkdir(mode=0o700,parents=True,exist_ok=True)
    st=root.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode&0o077:
        raise RuntimeError("Unsafe relay directory")
    path=root/(broker.lower()+".sock")
    # Never replace an existing socket: service lifecycle must own its directory.
    if path.exists() or path.is_symlink():raise RuntimeError("Socket already exists")
    active=0
    host,port=DESTINATIONS[broker]
    async def handle(reader,writer):
        nonlocal active
        remote=None
        admitted=False
        try:
            sock=writer.get_extra_info("socket")
            _,uid,_=struct.unpack("3i",sock.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
            if uid!=os.getuid() or active>=MAX_CONNECTIONS:
                event("relay_refused",broker);return
            active+=1;admitted=True
            rr,remote=await asyncio.wait_for(asyncio.open_connection(host,port),CONNECT_TIMEOUT)
            event("relay_connected",broker)
            tasks=[asyncio.create_task(copy(reader,remote)),asyncio.create_task(copy(rr,writer))]
            try:
                await asyncio.wait_for(asyncio.gather(*tasks),SESSION_TIMEOUT)
            finally:
                for task in tasks:task.cancel()
                await asyncio.gather(*tasks,return_exceptions=True)
        except (OSError,TimeoutError,ValueError):
            event("relay_connection_closed",broker)
        finally:
            if admitted:active-=1
            for w in (remote,writer):
                if w:
                    w.close()
                    try:await asyncio.wait_for(w.wait_closed(),2)
                    except (OSError,TimeoutError):pass
    old=os.umask(0o077)
    try:server=await asyncio.start_unix_server(handle,path=path,backlog=16)
    finally:os.umask(old)
    os.chmod(path,0o600)
    identity=path.lstat().st_ino
    stop=asyncio.Event()
    loop=asyncio.get_running_loop()
    for sig in (signal.SIGTERM,signal.SIGINT):loop.add_signal_handler(sig,stop.set)
    try:
        async with server:
            event("relay_ready",broker)
            await stop.wait()
    finally:
        try:
            if path.lstat().st_ino==identity:path.unlink()
        except FileNotFoundError:pass

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--broker",choices=DESTINATIONS,required=True)
    p.add_argument("--socket-dir",required=True)
    a=p.parse_args()
    asyncio.run(serve(a.broker,a.socket_dir))
