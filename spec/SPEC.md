# AV-Tools – Spezifikation

Stand: 2026-10-10 · Status: Entwurf V1 · Plattform: Web-App (PWA)

## 1. Ziel und Rahmen

Eine Web-App (PWA), die die Rechnungen und einfachen Messungen bündelt, die im Veranstaltungsalltag ständig anfallen: Delays, Sub-Abstände, Signalgenerator, RTA, Polaritätscheck, DMX-Patch, DIP-Schalter, später Video, Netzwerk, Strom und Rigging. Sie ist für den Einsatz am Bühnenrand gedacht: schnell, offline und auch mit Handschuhen im Dunkeln bedienbar.

| Punkt | Entscheidung |
|---|---|
| Plattform | Progressive Web App: Vite, Svelte 5, TypeScript. Läuft auf iPhone, Android, iPad und Desktop. Auf dem Handy über „Zum Home-Bildschirm“ wie eine App installierbar |
| Warum keine native App | Für die Verteilung über App Store oder TestFlight wäre das Apple Developer Program nötig (99 €/Jahr), das ist bei einer kostenlosen App nicht gewollt |
| Preis | kostenlos, keine Käufe, keine Werbung |
| Lizenz | Open Source, MIT; Repo öffentlich auf GitHub |
| Daten | keine Datenerhebung; nach dem ersten Laden komplett offline (Service Worker); Datenbanken gebündelt, Updates mit neuen App-Versionen |
| Sprache | Deutsch, Englisch später |
| Verteilung | GitHub Pages (Link an Kollegen und Freunde), keine aktive Werbung |
| Haftung | Rigging- und Strom-Tools mit Bestätigungsdialog und „Richtwert“-Hinweis, siehe §6 |

## 2. Version 1 – Umfang

### 2.1 Delay-Rechner (Referenzimplementierung)

**Zweck:** Delays für eine oder mehrere Delay-Linien aus Abstand und Höhe berechnen.

**Globale Eingaben**
- Lufttemperatur in °C, Standard 20 °C. Daraus wird c = 331,3 · √(1 + T/273,15) m/s berechnet. Optional kann c manuell überschrieben werden.
- Referenzquelle (Main-PA): Höhe der akustischen Mitte H_main in m. Sie liegt im Ursprung (x = 0, y = 0).
- Zusätzliche Verzögerung (Haas-Offset) in ms, Standard 0. Sie wirkt global und kann pro Linie überschrieben werden.

**Linien und Felder**
- Beliebig viele Linien: „Delay-Linie 1“, „Delay-Linie 2“ … mit umbenennbarem Namen.
- Pro Linie beliebig viele **Felder**, also Lautsprecherpositionen (z. B. Tower links, Tower rechts). Jedes Feld hat:
  - Name (optional)
  - Abstand x: horizontal zur Main-PA in m (Pflicht)
  - Höhe z in m (Pflicht, akustische Mitte des Delay-Lautsprechers)
  - seitlicher Versatz y in m (optional, Standard 0)

**Rechenmodi** (pro Linie wählbar)
1. **Quelle → Quelle (Standard):** Δt = |Main → Delay| / c + Offset. Gemessen wird die 3D-Distanz.
2. **Hörposition:** Pro Linie gibt es einen Referenz-Hörpunkt (Abstand x_L, Ohrhöhe z_L mit Standard 1,7 m, seitlicher Versatz y_L).
   Δt = (|Main → L| − |Delay → L|) / c + Offset.
   Ist das Ergebnis < 0, liegt der Hörpunkt vor dem Delay. Dann erscheint eine Warnung statt eines negativen Werts.

**Ausgabe**
- Pro Feld: Distanz in m und Delay in ms mit 2 Nachkommastellen.
- Pro Linie: Minimum, Maximum, Mittelwert und Spreizung (Max − Min) der Felder.
- Formel-Box mit Formel, verwendetem c und Annahmen: Freifeld, keine Windkorrektur, keine Systemlatenzen.
- Optional: Systemlatenz (DSP/Netzwerk), die abgezogen wird. Standard 0.

**Später (V1.1)**
- Kaskade, d. h. Linie 2 bezogen auf Linie 1.
- Mehrere Hörpunkte pro Linie.
- Speichern als Projekt (derzeit: letzte Eingaben bleiben lokal erhalten).

### 2.2 Zahnlücken-Rechner (Sub-Linie) mit Arc-Delay

**Zweck:** Für eine gerade Sub-Linie den maximalen und den empfohlenen Abstand der Bässe bestimmen und optional Delays für einen Delay-Arc berechnen. Rechenkern: `src/lib/core/audio/subArray.ts`.

**Teil A – Abstand („Zahnlücke“)**
- Eingaben:
  - Gehäusemaße B × H × T in m. Ausrichtung: welches Maß entlang der Linie liegt (Standard Breite).
  - Übergangsfrequenz f in Hz, also die höchste Frequenz der Subs.
  - Temperatur oder c, wie beim Delay-Rechner.
- λ = c / f.
- Rechengrundlage ist immer die **Mitte des Lautsprechers** (akustisches Zentrum), also Abstand Mitte–Mitte.
- **Maximaler Abstand** = λ/2, fest und nicht änderbar. Darüber entstehen bis zur Übergangsfrequenz Nebenkeulen (Grating Lobes).
- **Empfohlener Abstand** = λ/4 als Standard. Der Nutzer kann den Faktor anpassen, erlaubt ist 0 < Faktor ≤ 1/2.
- **Zahnlücke** (Kante–Kante) = Abstand − Gehäusemaß entlang der Linie. Sie ist nur eine abgeleitete Zusatzinfo für den Aufbau. Ist der Wert negativ bzw. das Gehäuse größer als der maximale Abstand, erscheint eine Warnung: Die Übergangsfrequenz ist für diese Gehäuse in einer Reihe zu hoch.
- Ausgabe:
  - λ, maximaler und empfohlener Abstand (Mitte–Mitte), jeweils mit Lücke (Kante–Kante)
  - Formel-Box

Bestätigt (Robin, 10.10.2026): λ/2 als festes Maximum, λ/4 als anpassbarer Standard für den empfohlenen Abstand.

**Teil B – Arc-Delay (Bonus)**
- Eingaben:
  - Anzahl Subs n (≥ 2)
  - Abstand d: Standard ist der empfohlene Abstand aus Teil A, überschreibbar
  - Öffnungswinkel θ in Grad (0 < θ ≤ 180)
- Modell: konvexer Bogen auf gerader Linie. Eine virtuelle Punktquelle liegt hinter der Linie, der Bogen läuft durch die beiden äußeren Subs. Positionen sind die akustischen Zentren.
  - x_i = (i − (n−1)/2) · d
  - x_o = (n−1)/2 · d
  - R = x_o / sin(θ/2)
  - h = x_o / tan(θ/2)
  - t_i = (√(x_i² + h²) − h) / c, danach so normiert, dass der früheste Sub 0 ms hat
- **Mitte = T0**, nach außen wird das Delay größer. Bei gerader Anzahl haben die beiden inneren Subs 0 ms.
- Beispiel: 5 Subs, 1,2 m, 60°, 20 °C → 1,87 / 0,49 / 0 / 0,49 / 1,87 ms.
- Ausgabe:
  - Tabelle Sub # / Position / Delay in ms
  - Linienlänge, Radius
  - kleine Skizze der Linie mit virtuellem Bogen und Delays

Damit ist „Arc-Delay“ aus Phase 2 hierher gewandert. Cardioid und End-Fire bleiben in Phase 2.

### 2.3 DMX-Adressrechner (Patch)

**Lampendatenbank**
- Quelle: Open Fixture Library (MIT, https://github.com/OpenLightingProject/open-fixture-library).
- Ein Import-Skript unter `scripts/ofl-import/` erzeugt `public/fixtures.json` mit Hersteller, Modell, Modi (Name, Kanalzahl, Kanalliste) und OFL-Version.
- Die Datei (JSON, ggf. komprimiert) liegt gebündelt in der App, wird vom Service Worker offline vorgehalten und ist read-only. Die DB-Version wird in „Über“ angezeigt.
- **Eigene Geräte** (Name, Modi, Kanalzahl) werden lokal im Browser gespeichert, also getrennt von der gebündelten DB. Export/Import als Datei.
- Suche über Hersteller und Modell mit Favoriten.
- Lizenzhinweis für OFL in „Über → Lizenzen“.
- Hinweise in der App (im DMX-Rechner und unter „Über“):
  - Eigene Geräte und Favoriten liegen nur lokal im Browser dieses Geräts. Sie werden nicht übertragen und gehen beim Löschen der Browserdaten oder über „Gespeicherte Eingaben löschen“ verloren. Deshalb gibt es Export/Import als Sicherung.
  - Die Datenbank ist Teil der App und wird nur mit einer neuen App-Version aktualisiert. Updates werden geladen, wenn die App mit Internetverbindung geöffnet wird („Neue Version verfügbar → Neu laden“). Angezeigt wird der Stand der Datenbank (OFL-Version/Datum).

**Patch-Eingabe:** Liste von **Gruppen**. Jede Gruppe hat:
- Gerät und Modus, aus DB oder eigenen Geräten. Die Kanalzahl ergibt sich daraus.
- Anzahl
- Ziel-Universe (1-basiert) und optional eine Startadresse; ohne Startadresse wird die nächste freie Adresse genommen.
- Optional eine Lücke zwischen Geräten (Kanäle).

Derselbe Gerätetyp in mehreren Universen bedeutet einfach mehrere Gruppen.

**Globale Optionen**
- Ausrichtung der Startadressen: keine / auf glatte Adressen (x01, x11, x21 … bzw. Raster N).
- Überlauf: Passt eine Gruppe nicht mehr ins Ziel-Universe, gilt entweder (a) **automatisch ins nächste Universe** (Standard) oder (b) Fehler anzeigen.
- Reservierte Bereiche pro Universe, z. B. 1–20 für Nebel und Hazer.

**Regeln**
- Ein Gerät überschreitet **nie** die Universe-Grenze. Startadresse + Kanalzahl − 1 ≤ 512.
- Überlappungen zwischen Gruppen mit fester Startadresse werden als Konflikt angezeigt, nicht still verschoben.

**Ausgabe:** Tabelle mit Gerät #, Name, Universe, Startadresse, Endadresse, DIP-Stellung (Kurzform), Art-Net-Adresse (Net/Subnet/Universe). Dazu Belegung pro Universe (frei/belegt).
Export als CSV und Druckansicht (als PDF speicherbar) (V1.1).

### 2.4 DIP-Schalter-Rechner

- Adresse → Schalterstellung: 9 Schalter (Wertigkeit 1, 2, 4 … 256) für Adressen 1–511, grafisch als DIP-Block.
- Rückwärts: Schalter antippen → Adresse.
- Gerätekonventionen als Profil:
  - Bitreihenfolge (Schalter 1 = LSB/MSB)
  - invertierte Logik (ON = 0)
  - Offset (Adresse = Summe oder Summe + 1)
  - Anzahl Schalter (9/10; Schalter 10 = Funktion)
- Standardprofil: Schalter 1 = 1, ON = 1, Adresse = Summe, 10 Schalter, wobei Schalter 10 nicht zur Adresse zählt.
- Hinweis bei Adresse 0 bzw. > 511.


### 2.5 Signalgenerator

**Zweck:** Testsignale über Kopfhörerausgang, USB-Audio oder Lautsprecher des Geräts.

- Signale:
  - Sinus 1 Hz – 24 kHz: Eingabefeld, logarithmischer Schieberegler, Schnellwahl 31,5 Hz … 16 kHz
  - rosa Rauschen (Kellet-Filter) und weißes Rauschen
  - log. Sweep 20 Hz – 20 kHz (1/5/10 s, 0,5 s Pause, Schleife)
  - **Polaritätssignal** als Sender für den Polaritätscheck auf einem zweiten Gerät (siehe 2.7)
- Pegel in dBFS nach AES17 (0 dBFS = Effektivwert eines voll ausgesteuerten Sinus), −60 … 0 dBFS, Standard −20 dBFS. Rauschen ist auf denselben Effektivwert normiert; oberhalb der Clipping-Grenze erscheint eine Warnung.
- Ausgang: links / beide / rechts.
- Sicherheit:
  - weiches Ein- und Ausblenden (50 ms)
  - automatischer Stopp, wenn die App in den Hintergrund geht
  - Warnhinweis zu Pegel und Bluetooth-Latenz
- iPhone: `navigator.audioSession.type = 'playback'`, damit der Ton auch bei Stummschalter spielt.
- Rechenkern: `core/dsp/signals.ts`, `levels.ts`; Browser: `lib/audio/generator.ts`.

### 2.6 RTA (Echtzeit-Analyzer)

- Mikrofon per `getUserMedia`, Echo-, Rausch- und Pegelautomatik aus.
- FFT 16384 Punkte (AnalyserNode), zusammengefasst in Bänder nach IEC 61260 (Basis 10): 1/1, 1/3 (Standard) und 1/6 Oktave, 20 Hz – 20 kHz.
- Pegelskala in dBFS (AES17): Ein voll ausgesteuerter Sinus zeigt 0 dB in seinem Band, die Summe aller Bänder entspricht dem Gesamtpegel. Die Skalierung des AnalyserNode (Blackman-Fenster, 1/N) wird dafür korrigiert (`core/dsp/analyser.ts`).
- Anzeige:
  - Balken, Bereich 0 … −80 dB
  - Spitzenwert halten (abschaltbar, zurücksetzbar)
  - Mittelung schnell/langsam
  - Gesamtpegel
  - Hinweis „unkalibriert“
- Bänder schmaler als ein FFT-Bin werden blass dargestellt.
- **Nicht in V1:** Kalibrierung auf dB SPL, Mikrofon-Korrekturkurven, Bewertungsfilter A/C, Transferfunktion. Mögliche spätere Erweiterungen.

### 2.7 Polaritätscheck

- Prinzip: Matched Filter. Das Mikrofonsignal wird mit dem bekannten Testsignal kreuzkorreliert. Das Vorzeichen der stärksten Korrelationsspitze ist die Polarität des dominanten Anteils (`core/dsp/polarity.ts`).
- Testsignal: log. Sweep 0,5 s, Wiederholung jede Sekunde.
  - Band **Mitte/Hoch:** 300 Hz – 8 kHz
  - Band **Sub/Low:** 40 – 200 Hz
- Modi:
  1. **Senden & messen:** Das Gerät spielt das Signal einmal ab (z. B. per Kabel ins Pult) und nimmt gleichzeitig auf.
  2. **Nur messen:** Ein zweites Gerät spielt im Signalgenerator „Polarität“ mit demselben Band. Das messende Gerät nimmt jeweils 1,6 s auf.
- Dauermessung: wiederholt die Messung, bis gestoppt wird.
- Bewertung:
  - **Signalabstand:** Korrelationsspitze zu Hintergrund. Unter 20 dB gilt „kein Signal“; reines Rauschen erreicht ca. 13 dB.
  - **Eindeutigkeit:** Hauptspitze zu größter gegenpoliger Spitze im Fenster 1/f_min. Unter 1,3 gilt „nicht eindeutig“.
- **Mikrofon-Referenz:** Die Polarität von Handy-Mikrofonen ist unbekannt. Deshalb wird zuerst ein bekannt korrekter Lautsprecher gemessen und das Ergebnis pro Band als Referenz gespeichert. Danach zeigt die App „wie Referenz“ oder „verdreht gegenüber Referenz“. Ohne Referenz zeigt sie nur „positiv/negativ (ohne Referenz)“.
- Grenzen (in der App erklärt): Frequenzweichen, Phasendrehungen und Subwoofer mit Tiefpass können das Ergebnis verfälschen. Bei Mehrwegesystemen dominiert im Band Mitte/Hoch meist der Hochtöner.
- Getestet mit synthetischen Signalen (Bandpass, Echo, Rauschen, Sub-Tiefpass) und Ende-zu-Ende im Browser mit simuliertem Mikrofon.

## 3. Roadmap nach V1

| Phase | Tools |
|---|---|
| 2 – Audio | Schallgeschwindigkeit/Wellenlänge ↔ Frequenz · BPM ↔ ms · dB-Addition, SPL über Distanz (Punkt/Linie) · Pegel dBu/dBV/V/dBFS · Verstärkerleistung ↔ Spannung · Lautsprecherkabel (Spannungsfall, Verlust, Dämpfungsfaktor) · Impedanz parallel/seriell · Sub-Arrays: Cardioid, End-Fire · Raummoden |
| 3 – Licht & Netz | Art-Net Net/Subnet/Universe ↔ fortlaufend · sACN-Multicast-Adresse · IP-/Subnetzrechner · Dante-Bandbreite · Patch-Export CSV/PDF |
| 4 – Video | LED-Wand (eigene Panel-Profile, Import/Export per Datei/AirDrop; Auflösung, Gewicht, Leistung, Betrachtungsabstand) · Projektion (Throw Ratio ↔ Abstand/Bildbreite) · Timecode (Frames ↔ Zeit, Frameraten, Drop Frame) · Bandbreiten SDI/HDMI/NDI |
| 5 – Strom & Rigging | Lastverteilung auf 3 Phasen (CEE 16/32/63/125 A) · Spannungsfall · Aggregatgröße · Bridle-Rechner (Schenkellängen, -kräfte) · Punktlasten · später Traversen-Lasttabellen als eigene Profile |
| 6 – Funk | Intermodulation (IM3) für Funkfrequenzen |
| Optional | RTA-Kalibrierung (dB SPL), A/C-Bewertung, Transferfunktion (2 Kanäle über USB-Interface) |

Gestrichen: MAC-Herstellerlookup, Akkulaufzeit Funkstrecken.

**Querschnitt** (ab V1 vorbereitet, schrittweise umgesetzt):
- Einheiten metrisch/imperial
- Roter Nachtmodus
- Favoriten
- Projekte, d. h. gespeicherte Berechnungen pro Veranstaltung
- Synchronisation zwischen Geräten ist offen (Export/Import als Datei als einfache Lösung)

## 4. UI-Grundsätze

- Startseite: Kategorien (Audio, Messen, Licht, Video, Netzwerk, Strom, Rigging) mit Tool-Liste und Suche. Favoriten folgen.
- Große Touch-Ziele (≥ 44 px), numerische Tastatur, Komma und Punkt als Dezimaltrenner, Einheit immer sichtbar am Feld.
- Ergebnis sofort beim Tippen, ohne „Berechnen“-Button.
- Jede Ergebnisansicht hat eine aufklappbare Box „Formel & Annahmen“.
- Hell/Dunkel nach System, dazu ein roter Nachtmodus per Knopf in der Kopfzeile.
- Letzte Eingaben bleiben pro Tool lokal erhalten; „Über → Gespeicherte Eingaben löschen“.
- Update-Hinweis „Neue Version verfügbar – Neu laden“, kein automatisches Neuladen mitten in einer Messung.

## 5. Datenschutz und Recht

- Keine Datenerhebung, keine Cookies, keine Drittanbieter, keine externen Ressourcen.
- Content Security Policy im Build: `connect-src 'self'` u. a., d. h. technisch keine Verbindungen zu fremden Servern.
- Hosting GitHub Pages: GitHub protokolliert IP-Adressen beim Laden und bei Update-Prüfungen. Das steht in der Datenschutzerklärung.
- `localStorage` nur für die letzten Eingaben, eigene Geräte und Favoriten, als technisch erforderlich nach § 25 Abs. 2 Nr. 2 TDDDG; jederzeit löschbar.
- Mikrofon nur nach Freigabe und während der Messung, Auswertung nur im Arbeitsspeicher.
- Datenschutzerklärung: `public/datenschutz.html`, offline verfügbar und in „Über“ verlinkt. Verantwortlicher mit Name und E-Mail (av_tools@icloud.com), ohne Postanschrift.
- Lizenzen: MIT für den eigenen Code; Open Fixture Library (MIT) mit Hinweis in „Über“, sobald enthalten.

## 6. Haftung (Rigging/Strom)

- Beim ersten Öffnen eines Rigging- oder Strom-Tools erscheint ein Bestätigungsdialog: „Die Ergebnisse sind Richtwerte für die Vorplanung. Keine Gewähr für Richtigkeit. Die Verantwortung für Planung und Ausführung liegt beim Nutzer bzw. einer fachkundigen Person.“
  - Die Bestätigung wird mit der Version des Hinweistexts gespeichert. Ändert sich der Text, wird erneut gefragt.
- Am Ergebnis steht immer: „Richtwert für die Vorplanung – keine Gewähr“.
- Die App gibt nur Zahlen aus, keine Bewertung wie „sicher“ oder „zulässig“. Formel und Annahmen sind sichtbar, z. B. statisch, ohne dynamische Faktoren, ohne Eigengewicht der Anschlagmittel.
- Plausibilitätswarnungen bei kritischen Eingaben, z. B. Bridle-Winkel > 120° oder unrealistische Lasten.

## 7. Qualität

- Rechenkern `src/lib/core` mit Vitest-Tests, dazu ein Ende-zu-Ende-Test im Browser (Playwright, simuliertes Mikrofon) vor Releases. Referenzwerte stammen aus Handrechnung, Herstellerunterlagen oder Robins Excel-Prealignment-Rechner; die Quelle steht im Test.
- Öffentliches Changelog (`CHANGELOG.md`).
- Gemeldete Rechenfehler haben Vorrang vor neuen Features.

## 8. Entscheidungslog

| Datum | Entscheidung |
|---|---|
| 2026-10-10 | Open Source (MIT), kostenlos, kein Trader |
| 2026-10-10 | Datenbanken lokal gebündelt, keine Online-Updates |
| 2026-10-10 | Rigging-Tools rein, mit Bestätigungsdialog und Hinweis |
| 2026-10-10 | ~~Native iOS-App (Swift)~~ → **Web-App (PWA)**, weil App Store/TestFlight 99 €/Jahr kosten |
| 2026-10-10 | Rechenlogik als reines TypeScript in `src/lib/core`, getrennt von der UI |
| 2026-10-10 | Datenschutzerklärung über GitHub Pages; ~~Verantwortlicher mit eigener Anschrift~~ → siehe unten |
| 2026-10-10 | Verteilung per Link (GitHub Pages) an Kollegen und Freunde, keine aktive Werbung |
| 2026-10-10 | Signalgenerator, RTA und Polaritätscheck gehören zu V1 |
| 2026-10-10 | Zahnlücken-Rechner = Sub-Abstand aus Gehäusemaß und Übergangsfrequenz, Arc-Delay integriert |
| 2026-10-10 | Sub-Abstand immer Mitte–Mitte; λ/2 fest, λ/4 anpassbar; Arc-Delay: Mitte T0, nach außen steigend |
| 2026-10-10 | Datenschutzerklärung ohne Postanschrift, nur Name und E-Mail (kein kostenpflichtiger Anschriftenservice); bei kommerzieller Nutzung oder Impressumspflicht neu bewerten |
| 2026-10-10 | DMX: eigene Geräte und Favoriten lokal im Browser (localStorage); Hinweis darauf und auf die Aktualisierung der Datenbank nur mit App-Updates in der App; Kanalnamen pro Modus in der Datenbank |
