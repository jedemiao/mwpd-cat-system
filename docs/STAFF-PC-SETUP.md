# MWPtD Tracker — Staff PC Setup

A one-time setup so a staff computer can securely open the MWPtD Tracker
(clears the browser's red **"Not secure"** warning) and sign in.

- **Server address:** `https://192.168.100.77/login`
- **You'll need:** the file `mwpd-cert.crt`, and your username/password (from the Division Chief)

> For deploying the certificate to many PCs at once on a Windows domain, see
> [CERT-DEPLOYMENT.md](CERT-DEPLOYMENT.md) instead of doing Part A on each PC.

---

## Part A — Trust the security certificate *(once per PC, needs admin rights)*

This is what removes the red **"Not secure"** warning.

**1. Get the certificate file onto the PC**
Copy **`mwpd-cert.crt`** to the computer (USB drive or shared folder). Put it on the Desktop.

**2. Open the certificate**
Double-click **`mwpd-cert.crt`** → a "Certificate" window opens → click **Install Certificate…**

**3. Choose where to install it**
- Store Location: select **Local Machine** → **Next**
- Click **Yes** on the admin (UAC) prompt.

**4. Pick the trust store**
- Select **"Place all certificates in the following store"** → **Browse…**
- Choose **"Trusted Root Certification Authorities"** → **OK** → **Next** → **Finish**
- A security warning appears → **Yes**
- You should see **"The import was successful."** → **OK**

**5. Fully restart the browser** *(essential — a refresh is not enough)*
- Close **all** browser windows, then reopen.
- The browser only re-reads the trusted-certificate store when it starts, so an open tab keeps showing the old warning until you restart.

---

## Part B — Access the app

**6. Open the site**
Go to **`https://192.168.100.77/login`** — you should now see a **padlock** (no warning).

**7. Bookmark it** so staff don't have to type the address.

**8. Sign in** with the username and password provided by the Division Chief.
- Forgot your password later? Ask the **Division Chief** — they can reset it from **Settings**.
- After first sign-in, set your own password from **Settings → Change password**.

---

## Part C — *(Optional)* Desktop app icon

To open it like a normal app (its own window + taskbar icon) instead of a browser
tab, use the packaged **MWPtD Tracker** app: copy the app folder to the PC and make
a shortcut to `MWPtD Tracker.exe`.

> The desktop app only works if the certificate in **Part A** is installed on that PC.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Still "Not secure" after reopening | The browser kept background processes. In PowerShell: `taskkill /IM chrome.exe /F` then reopen. |
| "This page can't be reached" | The PC isn't on the same network as the server, or the server IP changed. Confirm the server is reachable at `192.168.100.77`. |
| Desktop app opens blank | The certificate (Part A) isn't installed on that PC — do Part A first. |

---

## Notes

- The certificate is valid for the addresses `192.168.100.77`, `192.168.0.199`, and
  `mwpd.local`. If the server ever moves to a **new** IP not in that list, the
  certificate must be regenerated and re-installed.
- Keep **`mwpd-cert.crt`** in a shared folder / USB so it's easy to reuse on new PCs.
