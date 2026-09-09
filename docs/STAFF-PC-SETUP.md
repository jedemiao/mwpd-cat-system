# MWPtD Tracker — Staff PC Setup

A one-time setup so a staff computer can securely open the MWPtD Tracker
(clears the browser's red **"Not secure"** warning) and sign in.

- **Server address:** `https://192.168.100.109/login`
  (or `https://tracker.dmw.internal/login` once the router's DNS entry is added)
- **You'll need:** the file `mwpd-ca.crt`, and your username/password (from the Division Chief)

> For deploying to many PCs at once on a Windows domain, see
> [CERT-DEPLOYMENT.md](CERT-DEPLOYMENT.md) instead of doing Part A on each PC.

---

## Part A — Trust the certificate authority *(once per PC, needs admin rights)*

This is what removes the red **"Not secure"** warning.

You are installing **`mwpd-ca.crt`** — the office's own certificate authority, not
the server's own certificate. That distinction matters: once a PC trusts the
authority, it accepts any server certificate the authority issues. So this is done
**once per computer, ever**. When the server certificate is replaced — because it
expired, or the server's address changed — nothing on these PCs needs touching
again.

`mwpd-ca.crt` contains no private key. It is safe to email, put on a USB stick, or
leave in a shared folder.

### The reliable way — PowerShell

**1. Copy `mwpd-ca.crt` onto the PC** (USB drive or shared folder).

**2. Open PowerShell as Administrator**
Right-click **Start** → **Terminal (Admin)** or **Windows PowerShell (Admin)** →
**Yes** on the prompt.

**3. Run this**, with the path adjusted to where you put the file:

```powershell
Import-Certificate -FilePath "C:\Users\Public\mwpd-ca.crt" -CertStoreLocation Cert:\LocalMachine\Root
```

It should print a line ending `CN=MWPD Caraga Internal CA`.

**4. Fully restart the browser** — see step 5 below.

### The click-through way — double-click wizard

Use this if you would rather not type a command. **Step 3 is where this goes
wrong**, so read it carefully.

**1. Double-click `mwpd-ca.crt`** → a Certificate window opens → **Install Certificate…**

**2. Store Location:** select **Local Machine** → **Next** → **Yes** on the admin prompt.

**3. Pick the store — do not accept the default.**
The wizard offers "Automatically select the certificate store based on the type of
certificate". That files it somewhere the browser does not look, and the warning
stays. Instead:
- Select **"Place all certificates in the following store"** → **Browse…**
- Choose **"Trusted Root Certification Authorities"** → **OK** → **Next** → **Finish**

**4. A security warning appears.** Check the thumbprint matches, then **Yes**:

```
E7EF1245C91A43A713B54E79D76C5499ABECF2A4
```

You should see **"The import was successful."** → **OK**

**5. Fully restart the browser** *(essential — a refresh is not enough)*
Close **all** browser windows and check the system tray for a background instance,
then reopen. Browsers only re-read the trusted-certificate store on startup, so an
open tab keeps showing the old warning. In Chrome, typing **`chrome://restart`**
forces a complete relaunch.

---

## Part B — Access the app

**6. Open the site**
Go to **`https://192.168.100.109/login`** — you should now see a **padlock**, no
warning. Clicking the padlock should show the certificate was issued by
**MWPD Caraga Internal CA**.

**7. Bookmark it** so staff don't have to type the address.

**8. Sign in** with the username and password provided by the Division Chief.
- Forgot your password later? Ask the **Division Chief** — they can reset it from **Settings**.
- After first sign-in, set your own password from **Settings → Change password**.

---

## Part C — *(Optional)* Desktop app icon

To open it like a normal app (its own window + taskbar icon) instead of a browser
tab, use the packaged **MWPtD Tracker** app: copy the app folder to the PC and make
a shortcut to `MWPtD Tracker.exe`.

> The desktop app only works if Part A is done on that PC.

---

## Check it worked

In PowerShell:

```powershell
Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -like '*MWPD*' }
```

It should list **one** entry — `CN=MWPD Caraga Internal CA`, thumbprint
`E7EF1245C91A43A713B54E79D76C5499ABECF2A4`.

### Remove the old certificate, if this PC has one

A PC set up before 2026-09-08 also carries `CN=192.168.100.77, O=MWPD`
(thumbprint `266F232AA6EF7A35E2FE4F0E884EDCF00DA2E898`) — the self-signed
certificate used before the office had its own authority. Nothing needs it now:
the server has left that address, nginx no longer serves it, and it sits in
Trusted Root as a bare certificate rather than an authority. It was usually
installed in both stores, so clear both, in an **admin** PowerShell:

```powershell
Get-ChildItem Cert:\LocalMachine\Root, Cert:\CurrentUser\Root |
  Where-Object { $_.Thumbprint -eq '266F232AA6EF7A35E2FE4F0E884EDCF00DA2E898' } |
  Remove-Item
```

Removing it changes nothing about access — the app is reached through the
authority above.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Still "Not secure" after reopening | The browser kept background processes. In PowerShell: `taskkill /IM chrome.exe /F`, then reopen. Or type `chrome://restart`. |
| `NET::ERR_CERT_AUTHORITY_INVALID` | The CA is not in **Trusted Root Certification Authorities** — almost always the wizard's default store in Part A step 3. Check with the command above; if nothing lists, install it again. |
| "This page can't be reached" by IP | The PC isn't on the same network as the server, or the server's address changed. |
| "This page can't be reached" by name | `tracker.dmw.internal` has no DNS entry yet. Use the IP, or add the entry on the router. |
| Firefox still warns | Firefox ignores the Windows certificate store. Import `mwpd-ca.crt` under **Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import**, and tick "Trust this CA to identify websites". |

---

## Notes

- The **CA** expires in 2036. The **server certificate** expires December 2028 and
  is replaced on the server alone — staff PCs are unaffected.
- The server certificate currently covers `tracker.dmw.internal`, `dmw.internal`,
  `mwpd.dmw.internal`, `mwpd.local`, and the addresses `192.168.100.109`,
  `192.168.100.77`, `192.168.0.199`. An address outside that list needs the
  certificate reissued **on the server** — still nothing to do on staff PCs.
- Keep **`mwpd-ca.crt`** in a shared folder or USB so it's easy to reuse on new PCs.
- The CA's private key (`certs/ca-key.pem` on the server) must **never** be copied
  anywhere. It is what issues certificates in the office's name.
