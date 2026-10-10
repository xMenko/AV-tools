# Changelog

Alle relevanten Änderungen, insbesondere Korrekturen an Berechnungen, werden hier dokumentiert.

## [Unreleased]
### Geändert
- Plattform: Web-App (PWA) statt nativer iOS-App

### Hinzugefügt
- Delay-Rechner: mehrere Linien, Felder pro Linie, Bezug Quelle oder Hörposition, Temperatur, Offset, Latenz
- Zahnlücken-Rechner: Sub-Abstand (λ/2 fest, Empfehlung λ/N), Lücke Kante–Kante, Arc-Delay (Mitte T0)
- Signalgenerator: Sinus, rosa/weißes Rauschen, Sweep, Polaritätssignal; Pegel nach AES17; Kanalwahl
- RTA: 1/1-, 1/3-, 1/6-Oktavbänder, Spitzenwert halten, dBFS-Skala
- Polaritätscheck: Kreuzkorrelation mit Sweep, zwei Modi, Mikrofon-Referenz, Dauermessung
- Roter Nachtmodus, Offline-Betrieb, Datenschutzerklärung
- DIP-Schalter-Rechner: Adresse ↔ Schalterstellung, Schalter antippen, Geräteprofile (Schalter 1 = 1 oder 256, invertiert, Summe oder Summe + 1, 9/10 Schalter)
- DMX-Adressrechner: Gerätesuche in der Open Fixture Library (647 Geräte, offline), Gruppen mit Modus und Anzahl, feste oder automatische Startadressen (drei Platzierungsarten), Lücken, Raster x01/x11, reservierte Bereiche, Rückfrage bei auf mehrere Universes verteilten Gruppen, Konflikte, Belegung pro Universe, Patch-Liste mit DIP-Kurzform und Art-Net-Adresse
- Über: Stand der Gerätedatenbank und Lizenz der Open Fixture Library

### Korrigiert
- RTA: Umschalten von Bandbreite und Mittelung wirkt jetzt auch während einer laufenden Messung; Raster und Bänder auch ohne Messung sichtbar; 1/6-Oktave beschriftet mit 20, 40, 80 … (Bandkanten)
