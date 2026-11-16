# Rhyflitzer FM: Suno-Tracks und ihre Vorbilder

Eigene Instrumentals für Rhyflitzer FM (`radio.js`, `assets/music/`), erzeugt mit Suno auf einem bezahlten Plan.
Jeder Prompt beschreibt nur den **Stil** eines Vorbilds: Instrumente, Tempo, Aufbau, Stimmung. Suno blockt
Künstler- und Songnamen im Prompt, und Melodie, Riff und Text des Vorbilds sind geschützt (Content ID).
Klingt ein Ergebnis wiedererkennbar nach dem Original, wird es verworfen und neu erzeugt.

In Suno: Modus **Custom**, **Instrumental** an, der Prompt kommt ins Feld **Style of Music**.
Neue Tracks kommen mit `<id>.LICENSE.md` (Suno-ID aus dem ID3-Kommentar, Datum) und Lautstärkeprüfung
(`ffmpeg -af volumedetect`, `gainDb`) ins Spiel, siehe die bestehenden Lizenzdateien.

## Im Spiel

Die Zuordnung Vorbild → Track bei «Sabotage», den zwei Linkin-Park-Songs, «Insomnia» und «On My Way in L.A.»
ist aus der Erstellungszeit der Suno-Dateien abgeleitet (2026-11-15), nicht notiert.

| Vorbild (Interpret – Lied) | Track im Spiel | Datei(en) |
|---|---|---|
| Elbow – Grounds For Divorce (Gitarrensolo ab ca. 1:15) | Gritty Riffing | `gritty-riffing.mp3` (Version 1; Version 2 nicht im Spiel) |
| Beastie Boys – Sabotage | Fuzz Riff Breakdown | `fuzz-riff-breakdown.mp3` |
| Linkin Park – Heavy Is the Crown | Rising Tension | `rising-tension.mp3` |
| Linkin Park – Up From the Bottom | Pulsing Arpeggio, Pulsing Arpeggio (Take 2) | `pulsing-arpeggio.mp3`, `pulsing-arpeggio-take-2.mp3` |
| Faithless – Insomnia | Night Drive | `night-drive.mp3` |
| Phil Carmen – On My Way in L.A. | Open Road | `open-road.mp3` |

### Prompts

**Gritty Riffing** (wie Elbow – Grounds For Divorce):

```text
British art rock, stomping half-time drum groove with handclaps, deep fuzzy bass riff, dark bluesy minor key, dry close-mic'd room sound, slow build, then a raw overdriven slide guitar solo, gritty and loud, 90 bpm, instrumental
```

**Fuzz Riff Breakdown** (wie Beastie Boys – Sabotage):

```text
raw 90s punk-funk rap-rock instrumental, heavily distorted fuzz bass riff driving the whole track, frantic live drums with crashing cymbals, scratchy DJ turntable cuts, siren-like distorted guitar stabs, lo-fi garage recording, explosive stop-start breaks, 150 bpm, aggressive and chaotic energy
```

**Rising Tension** (wie Linkin Park – Heavy Is the Crown):

```text
modern nu-metal anthem instrumental, dark cinematic synth intro, heavy downtuned drop-D guitar riffs, punchy electronic drums layered with live kit, glitchy stuttering synth hits, huge wide chorus with soaring lead synth, half-time breakdown, polished arena-rock production, 85 bpm, epic and defiant
```

**Pulsing Arpeggio** (wie Linkin Park – Up From the Bottom):

```text
alternative rock with electronic elements, instrumental, pulsing arpeggiated synth riff, tight driving rock drums, crunchy rhythm guitars, deep sub bass, bright melodic lead synth hook in the chorus, uplifting build from quiet verse to big chorus, 2020s rock production, 120 bpm, hopeful and determined
```

**Night Drive** (wie Faithless – Insomnia):

```text
mid-90s progressive trance house instrumental, hypnotic staccato pizzicato string-synth riff, deep rolling bassline, four-on-the-floor kick with crisp offbeat hi-hats, dark atmospheric pads, long tension build, big breakdown and euphoric drop, club anthem, 127 bpm, night-drive mood
```

**Open Road** (wie Phil Carmen – On My Way in L.A.):

```text
mid-80s soft rock AOR ballad instrumental, melancholic piano intro, warm Rhodes and lush synth pads, clean chorus electric guitar, gated reverb drums, melodic bass, soaring emotional guitar solo, wide open highway feeling, longing and hopeful, 96 bpm, polished 1985 production
```

## Todo

[ ] **1.** Wie **Justice feat. Tame Impala / SZA / King Gizzard & the Lizard Wizard – Flower in a Hurricane** erzeugen.
Der Prompt beschreibt die Stile der beteiligten Künstler, nicht den Song selbst:

```text
French touch electro-disco instrumental with psychedelic rock, distorted compressed synth bass, funky slap bass and four-on-the-floor disco drums, dramatic orchestral string stabs, dreamy phased analog synths with heavy reverb, fuzzy wah psych-rock guitar lead, swirling build into a stormy euphoric climax, 118 bpm, glossy and wild
```

[ ] **2.** Wie **Metallica – Whiskey in the Jar** erzeugen.
Die Volksmelodie ist gemeinfrei, das Gitarrenriff der Thin-Lizzy- und Metallica-Fassung nicht. Der Prompt
verlangt deshalb ein eigenes Riff:

```text
late-90s heavy hard rock instrumental with Irish folk flavour, original harmonized twin lead guitar melody in a Celtic jig feel, chunky palm-muted rhythm guitars, driving bass, big tight rock drums, sing-along drinking-song swagger, rousing guitar solo, live pub-rock energy, 120 bpm, rowdy and proud
```
