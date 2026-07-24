# Cloudflare Tunnel — Remote Access Integration Plan

A structured, phased plan for exposing the MWPD tracker to staff on **other
networks** (home, mobile data, another office) **without opening any inbound
port** on the office firewall, and without putting an unprotected login page on
the public internet.

This document is a plan to follow later — nothing here has been applied to the
running stack yet. Work through the phases in order; each ends in a state you
can verify before moving on.

---

## 1. Why this approach

Today only the `nginx` service faces the network (ports `80`/`443`), and it is
only reachable on the **office LAN**. Everything else (`app`, `db`, `minio`,
`clamav`) is bound to `127.0.0.1`. See `docker-compose.yml`.

Cloudflare Tunnel adds a `cloudflared` container that dials **outbound** to
Cloudflare and holds that connection open. Cloudflare then routes requests for
your public hostname back down that tunnel to `nginx`. The result:

- **No inbound ports opened** on the office router/firewall — nothing to scan.
- Staff reach the system at a normal URL (e.g. `https://mwpd.example.gov.ph`)
  from any browser, on any network, **with nothing to install**.
- `db` / `minio` / `clamav` stay bound to `127.0.0.1`, completely unexposed.
- **Cloudflare Access** (a free companion) gates the URL behind an email
  allowlist, so only approved people ever reach the NextAuth login page.

```
Staff device (any network)
     │  https://mwpd.example.gov.ph
     ▼
 ┌────────────┐   TLS termination, bot/DDoS filtering,
 │ Cloudflare │   Cloudflare Access identity check (email allowlist)
 └────────────┘
     ▲
     │  outbound-only tunnel (office server dials OUT; no open ports)
     │
 ┌──────────────────────────────────────────────┐
 │ Office server (Docker)                        │
 │  cloudflared ──► nginx:443 ──► app:3000        │
 │                       └──► minio:9000 (/mwpd-scans/) │
 │  db / minio / clamav remain on 127.0.0.1       │
 └──────────────────────────────────────────────┘
```

**Why point the tunnel at `nginx`, not directly at `app:3000`:** `nginx.conf`
carries three things we must not lose — the login brute-force rate limit
(`/api/auth/callback/credentials`), the SSE notification stream config
(`/api/notifications/stream`), and the MinIO `/mwpd-scans/` download proxy.
Routing the tunnel through nginx keeps all of it.

---

## 2. Prerequisites (one-time, before any config change)

| # | Item | Notes |
|---|------|-------|
| 1 | A **domain name** | e.g. a `.gov.ph` or any domain (~a small yearly fee). Required — Cloudflare Tunnel needs a hostname you control. |
| 2 | A **Cloudflare account** (free) | Sign up at cloudflare.com. |
| 3 | Domain's **nameservers pointed to Cloudflare** | Done once in the domain registrar; Cloudflare walks you through it when you "Add a site". Propagation can take a few hours. |
| 4 | Ability to **edit `docker-compose.yml` and `.env`** on the office server | Same files you already deploy with. |
| 5 | A list of **staff email addresses** that should have access | Used for the Cloudflare Access allowlist in Phase 4. |

No changes to application code are required — `AUTH_TRUST_HOST: "1"` (already
set in `docker-compose.yml`) makes NextAuth derive its origin from the incoming
request, so login works on the new public hostname automatically.

---

## 3. Phase 1 — Create the tunnel in Cloudflare

Do this in the Cloudflare dashboard (**Zero Trust → Networks → Tunnels**),
using the "Cloudflared" connector type.

1. **Create a tunnel**, name it e.g. `mwpd-office`.
2. Cloudflare shows a **tunnel token** (a long string). Copy it — this is the
   only secret the container needs. Treat it like a password.
3. Add a **Public Hostname** route on the tunnel:
   - **Subdomain/hostname:** `mwpd.example.gov.ph` (your choice)
   - **Service type:** `HTTPS`
   - **URL:** `nginx:443`
   - Under **Additional application settings → TLS**, enable **No TLS Verify**
     (nginx currently serves a **self-signed** cert on 443 — see the note in
     `nginx.conf`. Cloudflare terminates the *public* TLS with a real cert; the
     internal hop to nginx is trusted because it never leaves the Docker
     network, so skipping verification on that hop is fine. If you later put a
     CA-issued cert on nginx, turn this back off.)

**Verification for this phase:** the tunnel shows as **connected** in the
dashboard once Phase 2 is running. The public hostname will 502 until then —
that's expected.

---

## 4. Phase 2 — Add the `cloudflared` service to Docker

Store the tunnel token from Phase 1 in `.env` (never commit it):

```dotenv
# .env  (add this line; keep it out of git — .env is already gitignored)
CLOUDFLARE_TUNNEL_TOKEN=paste_the_long_tunnel_token_here
```

Add the service to `docker-compose.yml`. It only needs to reach `nginx`, which
lives on `storage-net`, so put it there:

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - nginx
    networks:
      - storage-net   # so it can resolve and reach the nginx service
```

Notes:
- The token embeds the tunnel config, so no `config.yml` file or mounted
  credentials are needed — the container is stateless.
- `cloudflared` makes an **outbound** connection; it publishes **no ports** to
  the host. That is the whole point.

Bring it up:

```bash
docker compose up -d cloudflared
docker compose logs -f cloudflared   # look for "Registered tunnel connection"
```

**Verification:** the tunnel goes **connected** in the dashboard, and
`https://mwpd.example.gov.ph` now loads the app's login page over HTTPS from a
device **off** the office network (test on mobile data).

---

## 5. Phase 3 — Point the app at the public hostname

Two env vars must match the public URL the browser uses, or login redirects and
file downloads will break. Update `.env` on the server:

```dotenv
# The public HTTPS address staff will use:
NEXTAUTH_URL=https://mwpd.example.gov.ph
MINIO_PUBLIC_URL=https://mwpd.example.gov.ph
```

Why each matters:
- **`NEXTAUTH_URL`** — the canonical origin for auth callbacks. `AUTH_TRUST_HOST`
  already lets login work per-request, but set this correctly anyway so
  generated links and redirects use the public name.
- **`MINIO_PUBLIC_URL`** — scanned-copy downloads are MinIO **presigned URLs**
  served through nginx's `/mwpd-scans/` proxy (see `src/lib/minio.ts` and the
  comment in `nginx.conf`). The Host is part of what MinIO signs, so this must
  equal the exact public hostname the browser hits, or downloads return a
  signature error.

Apply:

```bash
docker compose up -d app     # recreate app with the new env
```

**Verification:** log in over the public URL, then open a record with a scanned
attachment and confirm the file downloads (this exercises the MinIO presign +
Host chain end-to-end).

---

## 6. Phase 4 — Lock the door: Cloudflare Access

Until now the public URL is reachable by anyone (they'd still hit your NextAuth
login, but the page is public). Add **Cloudflare Access** so only approved
people even reach it.

In **Zero Trust → Access → Applications**:

1. **Add an application → Self-hosted.**
2. **Application domain:** `mwpd.example.gov.ph` (the same hostname).
3. Add a **policy**:
   - Action: **Allow**
   - Rule: **Emails** → paste your staff email list (or **Emails ending in**
     `@dmw.gov.ph` to cover a whole domain).
4. Choose a login method: **One-time PIN** (Cloudflare emails a code — zero
   setup) is the simplest; Google/Microsoft SSO also works if the office uses
   it.

Now the request flow is **two locked doors**: Cloudflare Access (who may knock)
→ your NextAuth login (username/password). Cloudflare Access is free for up to
50 users — comfortably more than the division.

**Verification:** from a browser that is *not* signed in to an approved email,
`https://mwpd.example.gov.ph` should show Cloudflare's identity prompt, **not**
your login page. After entering the emailed code for an allowlisted address, it
should pass through to the NextAuth login.

---

## 7. Phase 5 — Fix client-IP for the login rate limit (important)

`nginx.conf` rate-limits login attempts per client IP
(`limit_req_zone $binary_remote_addr`). Once traffic arrives via the tunnel,
`$remote_addr` becomes **cloudflared's internal IP** for *every* request — so
the limiter would treat all staff as one IP (one person's typos could throttle
everyone, and a real attacker's IP would be invisible).

Restore the true client IP from Cloudflare's `CF-Connecting-IP` header. In the
`server { listen 443 ... }` block of `nginx.conf`, add:

```nginx
    # Cloudflare Tunnel forwards the real client IP in CF-Connecting-IP.
    # Trust it only from the internal tunnel hop, then use it for logging
    # and for the per-IP login rate limit.
    real_ip_header CF-Connecting-IP;
    set_real_ip_from 0.0.0.0/0;   # tunnel traffic only reaches nginx internally
```

Notes:
- `set_real_ip_from 0.0.0.0/0` is acceptable **here** because nothing but the
  tunnel (and the office LAN) can reach nginx — there is no untrusted direct
  client that could spoof the header. If you keep LAN access too and want to be
  stricter, narrow this to the Docker network / cloudflared subnet instead.
- After editing, reload: `docker compose restart nginx`.

**Verification:** trip the limit deliberately — 6+ bad logins in a minute from
one device should start returning 429/503, while a *second* device is
unaffected. That proves per-real-IP limiting is back.

---

## 8. Rollback / on/off

Remote access is fully contained in the `cloudflared` service plus the two env
vars. To disable remote access and return to LAN-only:

```bash
docker compose stop cloudflared      # tunnel closes; public URL goes dark
```

To remove entirely: delete the `cloudflared` service block, revert
`NEXTAUTH_URL` / `MINIO_PUBLIC_URL` to the LAN address, delete the tunnel in the
Cloudflare dashboard. The LAN deployment is unchanged throughout — this is
purely additive.

---

## 9. Coexisting with LAN access

You can keep both at once:
- **In-office** staff keep using the LAN address (`https://<server-lan-ip>`),
  served by nginx directly — fast, no internet round-trip.
- **Remote** staff use the Cloudflare hostname.

`AUTH_TRUST_HOST: "1"` makes login work on whichever Host the request arrives
with, so no per-address auth config is needed. The only caveat: `NEXTAUTH_URL`
and `MINIO_PUBLIC_URL` hold a single canonical value — set them to the
**public** hostname, and confirm scanned-file downloads still work for LAN users
(they route out to Cloudflare and back for the presigned URL host match; if that
round-trip is undesirable for LAN users, that's the one thing to test and
decide on).

---

## 10. Cost summary

| Item | Cost |
|------|------|
| Cloudflare Tunnel | Free |
| Cloudflare Access (≤ 50 users) | Free |
| Automatic TLS certificate | Free (Cloudflare-managed) |
| Bot / DDoS protection | Included |
| **Domain name** | ~small yearly fee (the only real cost) |

---

## 11. Integration checklist

- [ ] Domain registered and nameservers pointed to Cloudflare
- [ ] Tunnel `mwpd-office` created; token saved to `.env` as `CLOUDFLARE_TUNNEL_TOKEN`
- [ ] Public hostname route → `HTTPS` → `nginx:443`, **No TLS Verify** on
- [ ] `cloudflared` service added to `docker-compose.yml` on `storage-net`
- [ ] `docker compose up -d cloudflared` → tunnel shows **connected**
- [ ] `NEXTAUTH_URL` and `MINIO_PUBLIC_URL` set to the public hostname; `app` recreated
- [ ] Cloudflare Access application + email-allowlist policy created
- [ ] `nginx.conf` `real_ip` lines added; `nginx` restarted
- [ ] End-to-end test from **off-network**: Access prompt → login → open a record → download a scanned file
- [ ] Login rate-limit verified per real client IP
