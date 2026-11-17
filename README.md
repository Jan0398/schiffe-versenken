# Schiffe versenken ⚓

Online 1 gegen 1 (per Link) oder gegen den Computer (Leicht / Normal / Schwer).
7 Marinen mit eigenen Schiffs-Draufsichten: Deutschland, USA, Großbritannien, Frankreich, Japan, Russland, Italien.

## Lokal starten
```
npm install
npm start
```
→ http://localhost:3000

## Kostenlos online stellen (Render)
1. Neues **privates** GitHub-Repository anlegen und diesen Ordner hochladen (ohne `node_modules`).
2. Auf https://render.com → **New → Web Service** → Repository auswählen.
3. Einstellungen: Runtime **Node**, Build `npm install`, Start `npm start`, Plan **Free**.
   (Alternativ **New → Blueprint** – die `render.yaml` setzt alles automatisch.)
4. Nach dem Deploy bekommst du eine Adresse wie `https://schiffe-versenken-xxxx.onrender.com`.

Spielen: Seite öffnen → Name + Marine wählen → **Raum erstellen & Link teilen** → Link an Freund schicken.

Spielmodi: **Klassisch** oder **Mit Power-ups** (EMP, Artilleriebeschuss, Nuke, Radar – je Spieler eines, einmal einsetzbar).

**Turnier:** „🏆 Turnier erstellen“ → Link an alle schicken → Host startet. Paarungen werden jede Runde neu ausgelost (K.-o.-System); bei ungerader Spielerzahl kommt automatisch ein Bot (Normal) dazu.

**3 Spieler:** Jeder gegen jeden – pro Schuss frei wählbar, auf welchen Gegner. Gegen 2 Computer oder online (fehlender 3. Platz per Bot auffüllbar). Mit Power-ups: 2 pro Spieler.

**Zufallsereignisse** (optional): Eisberg (beschädigt ein Schiff), Piratenangriff (kapert ein gegnerisches Schiff), Orkanböen (versetzt unbeschädigte Schiffe), Durchfall vom Kapitän (3 Schüsse gehen daneben), Kraken (versenkt ein Schiff). Ca. 2–3 pro Partie.

Die gesamte Spiellogik läuft auf dem Server – auch Spiele gegen den Computer.

Hinweis Free-Plan: Nach ca. 15 Minuten ohne Besucher schläft der Server ein; der erste Aufruf dauert dann etwa 30–60 Sekunden.

## Regeln (klassisch, wie das Hasbro-Brettspiel)
- Feld 10×10 (A–J / 1–10), Flotte 5 · 4 · 3 · 3 · 2 Felder, Schiffe dürfen sich berühren.
- Wer trifft, darf nochmal schießen; bei Wasser ist der Gegner dran.
- Versenkte Schiffe werden angesagt und aufgedeckt.
- Verbindung weg / Seite neu geladen? Einfach im selben Tab neu laden – das Spiel wird wiederhergestellt (bis zu 2 Minuten).
