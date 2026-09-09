# Deploy the MWPD certificate to all PCs

The MWPtD Tracker is served over HTTPS with a **self-signed certificate**. The
connection is encrypted, but browsers show **"Not secure"** until each computer is
told to *trust* the certificate. This guide covers deploying that trust to many
machines at once.

- **Certificate file:** `mwpd-ca.crt` (the DMW server certificate)
- **For a single PC** instead, see [STAFF-PC-SETUP.md](STAFF-PC-SETUP.md).

---

## Option 1 — Windows domain (Active Directory): push it via Group Policy

Best when office PCs are joined to a domain — do it once, applies to every machine.

### Step 0 — Confirm you have a domain
On any office PC, in Command Prompt:
```cmd
systeminfo | findstr /C:"Domain"
```
- Real domain name (e.g. `dmw.local`) → continue below.
- **WORKGROUP** → no domain; use **Option 2** instead.

### Step 1 — Put the cert on the Domain Controller
Copy **`mwpd-ca.crt`** to the Domain Controller (or an admin PC with the Group
Policy tools).

### Step 2 — Open Group Policy Management
Press **Win + R**, type **`gpmc.msc`**, Enter.
*(Missing on a non-server PC? Install "RSAT: Group Policy Management Tools" from
Settings → Optional Features.)*

### Step 3 — Create a GPO
- Expand **Forest → Domains → your domain**.
- Right-click the domain (or the **OU** holding staff computers) →
  **Create a GPO in this domain, and Link it here…**
- Name it **`MWPD Trusted Certificate`** → OK.

### Step 4 — Edit the GPO
Right-click **MWPD Trusted Certificate** → **Edit**, then navigate to:
**Computer Configuration → Policies → Windows Settings → Security Settings →
Public Key Policies → Trusted Root Certification Authorities**

### Step 5 — Import the certificate
- Right-click **Trusted Root Certification Authorities** → **Import…**
- Wizard → **Next** → **Browse** to `mwpd-ca.crt` → **Next**
- Confirm the store is **"Trusted Root Certification Authorities"** → **Next** →
  **Finish** → **OK**.

### Step 6 — Confirm targeting
Select the GPO link; under **Scope**, confirm it's linked to the **domain** (all
PCs) or the correct **OU**. Leave **Security Filtering** at **Authenticated Users**.

### Step 7 — Apply and verify
On a test PC, Command Prompt **as admin**:
```cmd
gpupdate /force
```
*(Or wait — GPO refreshes automatically ~every 90 minutes and at restart.)*

Verify the cert landed:
```powershell
Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -like "*MWPD*" }
```
Then open `https://192.168.100.109/login` in a **freshly restarted** browser → padlock.

Once verified, every domain-joined computer gets it automatically — no per-PC visits.

---

## Option 2 — No domain (WORKGROUP): one-line install per PC

No central push, but you can skip the click-through wizard. Put `mwpd-ca.crt` in a
shared folder or on a USB stick, then on each PC run **PowerShell as Administrator**:

```powershell
Import-Certificate -FilePath "\\path\to\mwpd-ca.crt" -CertStoreLocation Cert:\LocalMachine\Root
```

Then **restart the browser** on that PC. You can also save the line as a `.ps1`/`.bat`
and run it from the USB stick on each machine.

---

## Verifying on any PC

```powershell
Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -like "*MWPD*" } | Select-Object Subject, Thumbprint, NotAfter
```
Expected thumbprint: `E7EF1245C91A43A713B54E79D76C5499ABECF2A4` (CA, valid to 2036-09-05).

Then browse to `https://192.168.100.109/login` in a **freshly restarted** browser.

---

## Important notes

- **Restart the browser** after the cert applies — Chrome/Edge only read the trust
  store at launch. If "Not secure" persists, kill background processes:
  `taskkill /IM chrome.exe /F`, then reopen.
- Installing to **Local Machine → Trusted Root** covers **all users on that PC**, but
  **not** other PCs — each machine needs it (hence Option 1 for domains).
- The certificate is valid for `192.168.100.77`, `192.168.0.199`, and `mwpd.local`.
  If the server moves to a **new IP not in that list**, regenerate the certificate
  (with the new address in its Subject Alternative Name) and re-deploy.
- Once a PC trusts the certificate, the packaged **MWPtD Tracker** desktop app also
  works without the `--ignore-certificate-errors` flag.
