# Broker egress isolation pilot (WSL)

Status: credential-free pilot only. Production MCP services, firewall and tunnel configuration are unchanged.

## Evidence
- User service IPAddressDeny=any did not stop an actual loopback TCP connection on this WSL host. Do not count that property as an enforced firewall.
- Bubblewrap user, PID and network namespaces worked with NoNewPrivileges=yes.
- The probe masks /run, /tmp, /home, /mnt and /var/tmp, replaces /proc and /dev, clears inherited environment and exposes only the pilot script and private relay directory for its test.
- Both official real-account TLS hosts completed verified TLS 1.3 handshakes through fixed Unix-socket relays; direct TCP connection to each host failed with an unreachable/permission error.
- No brokerage credential or API request was used. This is not an exhaustive filesystem or Unix IPC confinement proof.
- A separate synthetic systemd-creds test succeeded with /run visible, failed with /run masked, and succeeded after narrowly binding /run/systemd/io.systemd.Credentials. Credential IPC is a required exception for the current host-encrypted cache.

## Reproduce
Run on the authorized WSL Linux host with bubblewrap and Python:
```
python3 -B scripts/broker_egress_probe.py
```

## Production gate
1. Build broker-specific long-running relay with fixed host/port, private sockets, bounded concurrency/timeouts and no user-directed destinations. No arbitrary CONNECT requests.
2. Adapt NH Node.js and KIS Python HTTPS transports to Unix sockets, preserving certificate verification and SNI, never falling back to direct TCP.
3. Bind only required code, configuration, state and explicitly reviewed credential IPC; review all available Unix socket paths, inherited file descriptors, Windows interop, and cross-broker access.
4. Preserve local encrypted caches, locking, snapshots, daily timers, and MCP stdout protocol. Broker relay must not see decrypted HTTP data.
5. Test direct and alternate IPC denial, relay failure, restart, credential operation, token reuse, both read-only API calls and scheduled captures in separate canaries.
6. Review rollback before deploying. Do not edit host-wide firewall, disable token encryption or restart unrelated services.

Network namespaces alone do not protect against all same-user compromise or malicious host services. The pilot is not a production egress enforcement claim.

## Relay transport canary

Implemented fixed NH/KIS TLS-blind relay, socket owner/mode checks, peer UID check, 8 concurrent connections per relay and bounded timeouts. NH Node and KIS Python TLS clients verify the official hostname; when a relay socket variable is configured, a missing or broken socket fails closed without direct fallback. The relay currently supports only real-account official endpoints.

Credential-free HEAD requests inside masked namespaces succeeded (NH HTTP 405; KIS HTTP 200). The explicit live read-only canary below used only copies of encrypted token caches and a narrowly bound systemd credentials socket. It returned NH current price HTTP 200 and complete KIS domestic balance without token issuance. It does not modify the original caches or output holdings/credentials.

```bash
npm run build
python3 -B scripts/broker_egress_canary.py --live-readonly
```

Canary uses the local WSL project layout (including KIS miniconda Python), binds the repository read-only and masks /home, /run, /mnt, /tmp and /var/tmp before exposing required paths. Not an exhaustive IPC isolation proof. Production tunnel and scheduled jobs still use their original transport; do not set relay variables until service lifetime, sandbox mounts, scheduled job compatibility, and rollback have been verified.

## WSL deployment checkpoint

`broker-egress-relay@NH.service` and `broker-egress-relay@KIS.service` are enabled user services with private runtime directories and independent socket paths. `scripts/broker_sandbox.py` binds one broker repository, private state/share directories, and the credential socket; test-root mode sets BROKER_CACHE_ONLY=1. Three live canary captures using temporary encrypted caches and share directories passed. The NH holdings/NAV and KIS snapshot units use sandbox drop-ins; timers were not changed. KIS MCP profile has been switched to `broker_sandbox.py KIS mcp`; live ChatGPT balance returned complete and its Python child is in a different network namespace than the tunnel. NH MCP profile remains direct pending a read-only replacement for user-systemd diagnostic IPC. ETF composition refresh and existing NH validation service are unchanged. A backup of the KIS profile exists on WSL (private permissions); rollback restores that profile, removes only the KIS relay dependency drop-in and restarts the KIS tunnel. Scheduled job rollback removes only its sandbox drop-in, then daemon-reload. Never remove live cache files or globally alter the firewall.
