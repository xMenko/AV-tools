# AV Tools

Rechner und Messwerkzeuge für die Veranstaltungstechnik als Web-App. Sie läuft auf dem iPhone, auf Android, auf dem Tablet und am Laptop und lässt sich wie eine App auf den Home-Bildschirm legen.

- **Offline:** Nach dem ersten Laden funktioniert alles ohne Netz.
- **Keine Datenerhebung:** keine Cookies, kein Tracking, keine Werbung, keine externen Ressourcen. Das Mikrofon wird nur während einer Messung genutzt und nichts davon gespeichert.
- **Open Source** unter der MIT-Lizenz.

> **Hinweis:** Alle Ergebnisse sind Richtwerte ohne Gewähr. Messungen mit Smartphone-Mikrofonen sind unkalibriert. Rigging- und Stromberechnungen ersetzen keine fachkundige Planung.

## Tools

| Tool | Status |
|---|---|
| Delay-Rechner (mehrere Linien, Felder, Bezug Quelle/Hörposition, Temperatur) | ✅ |
| Zahnlücken-Rechner (Sub-Abstand λ/2 bzw. λ/N, Arc-Delay) | ✅ |
| Signalgenerator (Sinus, rosa/weißes Rauschen, Sweep, Polaritätssignal) | ✅ |
| RTA (1/1, 1/3, 1/6 Oktave) | ✅ |
| Polaritätscheck (Sweep + Kreuzkorrelation, Mikrofon-Referenz) | ✅ |
| DMX-Adressrechner mit Lampendatenbank | geplant |
| DIP-Schalter-Rechner | geplant |

Die vollständige Roadmap steht in [`spec/SPEC.md`](spec/SPEC.md).

## Installieren (für Nutzer)

Link im Browser öffnen, dann:
- **iPhone/iPad (Safari):** Teilen → „Zum Home-Bildschirm“
- **Android (Chrome):** Menü ⋮ → „App installieren“

## Entwickeln

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:phone    # HTTPS im lokalen Netz, z. B. für Mikrofontests auf dem Handy
npm run verify       # Typprüfung + Tests + Build
```

Aufbau:
- `src/lib/core`: Berechnungen und Signalverarbeitung als reines TypeScript mit Tests
- `src/lib/audio`: Web-Audio-Anbindung
- `src/tools`: die einzelnen Tools
- `public/datenschutz.html`: Datenschutzerklärung

Veröffentlicht wird per GitHub Pages: Jeder Push auf `main` baut, testet und deployt automatisch. Einmalig unter Settings → Pages → Source „GitHub Actions“ wählen.

## Beitragen

Fehler in Berechnungen bitte als Issue melden, mit Eingabewerten, erwartetem und tatsächlichem Ergebnis sowie der Quelle des erwarteten Werts. Korrekturen an Berechnungen haben Vorrang vor neuen Features.

## Lizenzen

- Eigener Code: MIT, siehe [LICENSE](LICENSE)
- Lampendatenbank (geplant): [Open Fixture Library](https://github.com/OpenLightingProject/open-fixture-library), MIT
