# 🍪 Cookie Clicker Light

Ein süchtig machendes Klick-Spiel im Stil von *Cookie Clicker* – als Single Page App in reinem HTML, CSS und JavaScript. Keine Frameworks, keine Abhängigkeiten, kein Build-Schritt.

## Spielen

`index.html` im Browser öffnen – fertig. Das klappt auch direkt per Doppelklick (`file://`), weil keine ES-Module verwendet werden.

Alternativ mit einem lokalen Server (praktisch zum Testen auf dem Handy im selben WLAN):

```bash
npx serve .
# oder
python3 -m http.server 8080
```

Das Spiel läuft auch auf **GitHub Pages**: Einstellungen → Pages → Branch auswählen, Ordner `/ (root)`.

## Features

| Bereich | Was drin ist |
| --- | --- |
| **Klicken** | Großer Keks mit Drück-Animation, schwebenden „+1“-Zahlen, Krümel-Partikeln und Keksregen im Hintergrund. Multi-Touch auf dem Handy, ohne Klick-Verzögerung. |
| **Gebäude** | 9 Gebäude von Cursor bis Prisma, die automatisch Kekse backen. Jedes weitere Exemplar kostet 15 % mehr. Kauf in Paketen (×1 / ×10 / ×100). Unentdeckte Gebäude erscheinen als „???“-Silhouette. |
| **Upgrades** | 58 Upgrades: stärkere Klicks, Klicks, die einen Anteil der Kekse/Sek. bringen, Rezepte (+% Produktion), 5 Stufen pro Gebäude (×2) und Upgrades für goldene Kekse. |
| **Goldene Kekse** | Tauchen zufällig auf: *Glücksfall* (Sofort-Kekse), *Raserei* (Produktion ×7) oder *Klick-Rausch* (Klicks ×777). |
| **Erfolge** | 37 Erfolge mit Benachrichtigung. Jeder Erfolg erhöht die Produktion dauerhaft um 1 %. |
| **News-Ticker** | Erzählt die Geschichte deiner Bäckerei und reagiert auf deinen Fortschritt. |
| **Statistik** | Alle Zahlen und die Liste der Erfolge (freigeschaltet und noch offen). |
| **Speichern** | Automatisch alle 10 Sekunden sowie beim Schließen oder Wechseln des Tabs (`localStorage`). |
| **Offline-Fortschritt** | Während das Spiel geschlossen ist, backen die Gebäude mit 50 % weiter (max. 24 Std.). |
| **Neues Spiel** | Setzt nach einer Sicherheitsabfrage alles zurück. |
| **Bäckerei-Name** | Auf den Namen in der Kopfzeile tippen, um die Bäckerei umzubenennen. |

## Gebäude

| Gebäude | Preis | Kekse/Sek. |
| --- | ---: | ---: |
| 👆 Cursor | 10 | 0,1 |
| 👵 Oma | 100 | 1 |
| 🌾 Farm | 1.000 | 8 |
| 🏦 Bank | 10.000 | 47 |
| 🧙 Zauberturm | 100.000 | 260 |
| 🌀 Portal | 1 Mio. | 1.400 |
| ⏳ Zeitmaschine | 10 Mio. | 7.800 |
| ⚛️ Antimaterie-Kondensator | 100 Mio. | 44.000 |
| 🌈 Prisma | 1 Mrd. | 260.000 |

## Projektstruktur

```
index.html      Aufbau der Seite (Header, Backstube, Shop, Footer, Dialoge)
css/style.css   Dunkles, responsives Design inkl. aller Animationen
js/config.js    Spieldaten & Balancing: Gebäude, Upgrades, Erfolge, News
js/game.js      Spiellogik, Game-Loop, Speichern/Laden, UI und Effekte
```

**Balancing anpassen oder Inhalte ergänzen:** Alles steht in `js/config.js`. Ein neues Gebäude ist ein weiterer Eintrag in `BUILDINGS`; die fünf Upgrade-Stufen und der Erfolg fürs erste Exemplar entstehen automatisch. IDs, die schon in Spielständen gespeichert sind, sollten nicht umbenannt werden.

## Technik

- **Game-Loop** mit `requestAnimationFrame`: Der Zähler läuft flüssig mit. Shop, Erfolge und goldene Kekse werden viermal pro Sekunde aktualisiert.
- **Zeitbasierte Produktion:** Kekse werden anhand der vergangenen Zeit gutgeschrieben. Ein Tab im Hintergrund verliert also nichts.
- **DOM-schonend:** Gebäude-Karten werden einmal angelegt und danach nur noch aktualisiert, Texte nur bei Änderungen neu geschrieben.
- **Responsive:** Zwei Spalten auf dem Desktop. Auf dem Handy liegen Keks und Shop übereinander, sodass man klicken und kaufen kann, ohne zu scrollen. Safe-Area-Unterstützung für Geräte mit Notch.
- **Barrierearm:** Bedienbar per Tastatur (Enter/Leertaste auf dem Keks), ARIA-Labels, und `prefers-reduced-motion` schaltet Animationen ab.
