# livn.tr DNS envanteri

Her DNS işleminden önce `bash scripts/dns-inventory.sh` çalıştırılır ve sonuç buraya eklenir (salt okunur).
Korunacaklar: `livn.tr` + `www` → Pages `livn`; MX/SPF/DKIM/DMARC (Cloudflare Email Routing, Resend);
`livn.tr/win` Page Rule → 301 `raw.githubusercontent.com/LiVNLOUD/livn-tools/main/win.ps1`.
Not: API token'ı Rulesets/Page Rules okuyamıyor; `/win` kuralı yalnız HTTP ile doğrulanıyor.

## 2026-10-30 — F0, av.livn.tr eklenmeden önce

#### Public resolution (DoH 1.1.1.1) — 2026-10-30T12:20:22Z

| Name | Type | Answer |
|---|---|---|
| livn.tr | NS | iris.ns.cloudflare.com., leonard.ns.cloudflare.com. |
| livn.tr | A | 104.21.43.15, 172.67.215.215 |
| livn.tr | AAAA | 2606:4700:3031::6815:2b0f, 2606:4700:3031::ac43:d7d7 |
| livn.tr | CNAME | — |
| livn.tr | MX | 31 route3.mx.cloudflare.net., 49 route1.mx.cloudflare.net., 67 route2.mx.cloudflare.net. |
| livn.tr | TXT | "v=spf1 include:_spf.mx.cloudflare.net ~all" |
| www.livn.tr | NS | — |
| www.livn.tr | A | 172.67.215.215, 104.21.43.15 |
| www.livn.tr | AAAA | 2606:4700:3031::ac43:d7d7, 2606:4700:3031::6815:2b0f |
| www.livn.tr | CNAME | — |
| www.livn.tr | MX | — |
| www.livn.tr | TXT | — |
| av.livn.tr | NS | — |
| av.livn.tr | A | — |
| av.livn.tr | AAAA | — |
| av.livn.tr | CNAME | — |
| av.livn.tr | MX | — |
| av.livn.tr | TXT | — |

#### Cloudflare zone records (API)

| Type | Name | Content | Proxied |
|---|---|---|---|
| CNAME | livn.tr | `livn.pages.dev` | True |
| CNAME | rsend.livn.tr | `rsend-euw1.forge.rmta.net` | False |
| CNAME | send.livn.tr | `send.forge.rmta.net` | False |
| CNAME | www.livn.tr | `livn.pages.dev` | True |
| MX | livn.tr | `route3.mx.cloudflare.net` | False |
| MX | livn.tr | `route2.mx.cloudflare.net` | False |
| MX | livn.tr | `route1.mx.cloudflare.net` | False |
| TXT | cf2024-1._domainkey.livn.tr | `"v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgk…` | False |
| TXT | _dmarc.livn.tr | `"v=DMARC1; p=none; rua=mailto:kaan@livn.…` | False |
| TXT | livn.tr | `"v=spf1 include:_spf.mx.cloudflare.net ~…` | False |
| TXT | resend._domainkey.livn.tr | `"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBg…` | False |

#### HTTP checks

```
https://livn.tr/ -> 200 
https://www.livn.tr/ -> 200 
https://livn.tr/win -> 301 https://raw.githubusercontent.com/LiVNLOUD/livn-tools/main/win.ps1
win.ps1 first line: <# .SYNOPSIS     Livn Tools - kurulum ve guncelleme. .DESCRIPTION     Kullanim (
```

## 2026-10-30 — F0, Workers Custom Domain `av.livn.tr` eklendikten sonra

Fark: yalnız `AAAA av.livn.tr 100:: (proxied)` eklendi (Workers Custom Domain'in yönettiği kayıt). Diğer kayıtlar ve `/win` değişmedi.

#### Public resolution (DoH 1.1.1.1) — 2026-10-30T12:23:09Z

| Name | Type | Answer |
|---|---|---|
| livn.tr | NS | iris.ns.cloudflare.com., leonard.ns.cloudflare.com. |
| livn.tr | A | 172.67.215.215, 104.21.43.15 |
| livn.tr | AAAA | 2606:4700:3031::6815:2b0f, 2606:4700:3031::ac43:d7d7 |
| livn.tr | CNAME | — |
| livn.tr | MX | 31 route3.mx.cloudflare.net., 49 route1.mx.cloudflare.net., 67 route2.mx.cloudflare.net. |
| livn.tr | TXT | "v=spf1 include:_spf.mx.cloudflare.net ~all" |
| www.livn.tr | NS | — |
| www.livn.tr | A | 104.21.43.15, 172.67.215.215 |
| www.livn.tr | AAAA | 2606:4700:3031::6815:2b0f, 2606:4700:3031::ac43:d7d7 |
| www.livn.tr | CNAME | — |
| www.livn.tr | MX | — |
| www.livn.tr | TXT | — |
| av.livn.tr | NS | — |
| av.livn.tr | A | 172.67.215.215, 104.21.43.15 |
| av.livn.tr | AAAA | 2606:4700:3031::6815:2b0f, 2606:4700:3031::ac43:d7d7 |
| av.livn.tr | CNAME | — |
| av.livn.tr | MX | — |
| av.livn.tr | TXT | — |

#### Cloudflare zone records (API)

| Type | Name | Content | Proxied |
|---|---|---|---|
| CNAME | livn.tr | `livn.pages.dev` | True |
| CNAME | rsend.livn.tr | `rsend-euw1.forge.rmta.net` | False |
| CNAME | send.livn.tr | `send.forge.rmta.net` | False |
| CNAME | www.livn.tr | `livn.pages.dev` | True |
| MX | livn.tr | `route3.mx.cloudflare.net` | False |
| MX | livn.tr | `route2.mx.cloudflare.net` | False |
| MX | livn.tr | `route1.mx.cloudflare.net` | False |
| TXT | cf2024-1._domainkey.livn.tr | `"v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgk…` | False |
| TXT | _dmarc.livn.tr | `"v=DMARC1; p=none; rua=mailto:kaan@livn.…` | False |
| TXT | livn.tr | `"v=spf1 include:_spf.mx.cloudflare.net ~…` | False |
| TXT | resend._domainkey.livn.tr | `"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBg…` | False |
| AAAA | av.livn.tr | `100::` | True |

#### HTTP checks

```
https://livn.tr/ -> 200 
https://www.livn.tr/ -> 200 
https://livn.tr/win -> 301 https://raw.githubusercontent.com/LiVNLOUD/livn-tools/main/win.ps1
win.ps1 first line: <# .SYNOPSIS     Livn Tools - kurulum ve guncelleme. .DESCRIPTION     Kullanim (
```
