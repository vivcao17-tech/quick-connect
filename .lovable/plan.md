# Fix Cloudflare Error 1000 on nosure.app

Error 1000 appears because the `nosure.app` A record is **proxied** through Cloudflare (orange cloud) toward an IP Cloudflare recognises as its own network. The fix is DNS configuration only — no code changes. You chose DNS-only records with the root domain as primary.

## Current state

- `www.nosure.app` is connected in Lovable and shows status **active**.
- The root `nosure.app` is **not** registered as a domain on the project, so nothing on the Lovable side is serving it.

## Steps

### 1. Add the root domain in Lovable
Project Settings → Project → Domains → **Connect Domain** → enter `nosure.app`. Leave the "uses Cloudflare or a similar proxy" advanced option **unchecked**, since we are going DNS-only. Lovable will show the records to create.

### 2. Set the Cloudflare records to DNS only
In the Cloudflare dashboard for `nosure.app`, DNS → Records:

```text
Type   Name    Content              Proxy status
A      @       185.158.133.1        DNS only (grey cloud)
A      www     185.158.133.1        DNS only (grey cloud)
TXT    _lovable  <value shown in the Lovable connect dialog>
```

Key point: toggle the orange cloud to grey on **both** A records. That single change is what clears Error 1000.

Remove any conflicting records for `@` or `www` (old A, AAAA, or CNAME entries pointing elsewhere). If you have CAA records, make sure they permit Let's Encrypt.

### 3. Set root as primary
Once `nosure.app` verifies and goes active, mark `nosure.app` as **Primary** in the Domains list. `www.nosure.app` will then redirect to the root.

### 4. Wait and verify
Verification and SSL issuance usually complete within minutes; DNS propagation can take longer. Check with dnschecker.org that `nosure.app` resolves to `185.158.133.1` and is not returning Cloudflare proxy IPs.

## Notes

- Since the records are DNS-only, Cloudflare will no longer proxy the site — Lovable's own CDN and SSL serve the traffic. Cloudflare page rules, WAF, and caching for this hostname will not apply.
- If you later want Cloudflare's proxy back on, the domain must be re-connected in Lovable with the Advanced "uses Cloudflare or a similar proxy" box ticked; that flow swaps the A records for a CNAME target that Lovable displays in the dialog. That target is project-specific and only visible there.
- Email records (MX, SPF, DKIM, DMARC) stay in Cloudflare and are unaffected.
