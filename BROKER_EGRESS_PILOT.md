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
