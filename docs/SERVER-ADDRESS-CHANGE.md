# The server's IP address changed — what to do

Nothing is broken. The app, the database and the files are untouched by an address
change; only *finding* the server is affected. Work through this in order and stop
as soon as it works.

**Most of the time, step 2 is the whole job.**

---

## 1. Find the new address

On the server, in PowerShell:

```powershell
(Get-NetIPAddress -InterfaceAlias 'Wi-Fi' -AddressFamily IPv4).IPAddress
```

Or check the router's client list. Write it down — it is referred to below as
`NEW_IP`.

---

## 2. Update the DNS entry on the router

Open **http://192.168.100.1** → the local DNS / DNS host entries / address book
section, and change:

```
tracker.dmw.internal   →   NEW_IP
```

Anyone browsing to `https://tracker.dmw.internal` now works again, with a padlock,
**with no change on their PC and no new certificate**. The certificate is bound to
the name, not the address.

If everybody uses the name, you are finished here.

---

## 3. Stop it happening again — reserve the new address

Same router, under DHCP / LAN → Address Reservation (wording varies):

```
MAC  54-14-F3-FE-5D-03   →   NEW_IP
```

That is the server's Wi-Fi adapter. With a reservation the router hands back the
same address every time, including after a restart.

If a reservation was already in place and the address moved anyway, the router was
probably factory-reset — check the DNS entry from step 2 survived too, and take a
photo of both settings pages this time.

---

## 4. Only if staff browse by IP rather than by name

Skip this if everyone uses `tracker.dmw.internal`.

The certificate lists these addresses: `192.168.100.109`, `192.168.100.77`,
`192.168.0.199`. If `NEW_IP` is one of them, the padlock still works — just tell
people the new address.

If it is **not** in that list, browsers will show
`ERR_CERT_COMMON_NAME_INVALID` — the authority is still trusted, but the
certificate does not claim that address. Either move staff onto the hostname
(better), or reissue the certificate:

```bash
cd /c/Users/jhong/Desktop/DMW/mwpd-cat-system
export MSYS_NO_PATHCONV=1

# Add NEW_IP as another IP.n entry in the [alt] section, then:
notepad certs/server.ext

openssl req -newkey rsa:2048 -nodes -keyout certs/key.pem -out certs/server.csr \
  -subj "/C=PH/O=DMW Regional Office XIII/CN=tracker.dmw.internal"

openssl x509 -req -in certs/server.csr -CA certs/ca.pem -CAkey certs/ca-key.pem \
  -CAcreateserial -out certs/cert.pem -days 825 -sha256 -extfile certs/server.ext

rm certs/server.csr
docker compose restart nginx
```

**Nothing needs installing on any staff PC.** They trust the CA, and the CA signed
this new certificate — that is the whole reason for having a CA rather than a
self-signed certificate.

---

## What you do *not* need to do

- **No application config change.** `AUTH_TRUST_HOST=1` makes the app derive its
  own origin from whatever address the browser used, and `/api/files` signs MinIO
  links against the same. Sign-in, redirects and scanned copies all follow the
  address automatically.
- **No rebuild, no migration, no restart of the app container.** Only nginx, and
  only if the certificate was reissued.
- **No visit to any staff PC.**
- **No data risk.** Postgres and MinIO live in named volumes; an address change
  does not touch them.

---

## Check it worked

From the server:

```bash
curl -s --ssl-no-revoke --cacert certs/ca.pem \
  --resolve tracker.dmw.internal:443:NEW_IP \
  -o /dev/null -w "%{http_code}\n" https://tracker.dmw.internal/login
```

`200` means the certificate and the app are both fine, and anything left is DNS.

From a staff PC: open `https://tracker.dmw.internal` in a **freshly restarted**
browser and confirm the padlock.

---

## Why this keeps happening

The server is a laptop on Wi-Fi with a 24-hour DHCP lease. It has already moved
twice — `192.168.100.77` → `192.168.100.109`, and once onto `192.168.0.199` on the
`DMW-DICT-XIII` network entirely.

A reservation fixes the common case. It cannot help when the machine joins a
different network, because that router knows nothing about it. A wired connection
is the only thing that ends that class of problem for good.
