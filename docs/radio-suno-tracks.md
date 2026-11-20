# Rhyflitzer FM: Suno-Tracks und ihre Vorbilder

Eigene Instrumentals für Rhyflitzer FM (`radio.js`, `assets/music/`), erzeugt mit Suno auf einem bezahlten Plan.
Jeder Prompt beschreibt nur den **Stil** eines Vorbilds: Instrumente, Tempo, Aufbau, Stimmung. Suno blockt
Künstler- und Songnamen im Prompt, und Melodie, Riff und Text des Vorbilds sind geschützt (Content ID).
Klingt ein Ergebnis wiedererkennbar nach dem Original, wird es verworfen und neu erzeugt.

In Suno: Modus **Custom**, **Instrumental** an, der Prompt kommt ins Feld **Style of Music**. Jeder Prompt
verlangt zusätzlich ausdrücklich nur Instrumental (kein Gesang, kein Rap), weil Suno sonst manchmal Stimmen einbaut.
Die Tracks im Spiel entstanden mit derselben Beschreibung, noch ohne diese Ergänzung.
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
| Justice feat. Tame Impala / SZA / King Gizzard & the Lizard Wizard – Flower in a Hurricane | Hurricane Bloom | `hurricane-bloom.mp3` (Suno-Titel «Untitled») |
| Metallica – Whiskey in the Jar | Celtic Jig of Iron | `celtic-jig-of-iron.mp3` |
| Linkin Park – New Divide (Live in Red Square 2011) | Stadium Scale | `stadium-scale.mp3` |
| Linkin Park – Heavy Is the Crown (Live) | Unison Riff | `unison-riff.mp3` |
| WRC Theme Song (2022 – heute) | Motores Relentless | `motores-relentless.mp3` (59 s) |

### Prompts

**Gritty Riffing** (wie Elbow – Grounds For Divorce):

```text
instrumental only, no vocals, no singing, no rap, British art rock, stomping half-time drum groove with handclaps, deep fuzzy bass riff, dark bluesy minor key, dry close-mic'd room sound, slow build, then a raw overdriven slide guitar solo, gritty and loud, 90 bpm, purely instrumental
```

**Fuzz Riff Breakdown** (wie Beastie Boys – Sabotage):

```text
instrumental only, no vocals, no singing, no rap, raw 90s punk-funk rock, heavily distorted fuzz bass riff driving the whole track, frantic live drums with crashing cymbals, scratchy DJ turntable cuts, siren-like distorted guitar stabs, lo-fi garage recording, explosive stop-start breaks, 150 bpm, aggressive and chaotic energy, purely instrumental
```

**Rising Tension** (wie Linkin Park – Heavy Is the Crown):

```text
instrumental only, no vocals, no singing, no rap, modern nu-metal anthem, dark cinematic synth intro, heavy downtuned drop-D guitar riffs, punchy electronic drums layered with live kit, glitchy stuttering synth hits, huge wide chorus with soaring lead synth, half-time breakdown, polished arena-rock production, 85 bpm, epic and defiant, purely instrumental
```

**Pulsing Arpeggio** (wie Linkin Park – Up From the Bottom):

```text
instrumental only, no vocals, no singing, no rap, alternative rock with electronic elements, pulsing arpeggiated synth riff, tight driving rock drums, crunchy rhythm guitars, deep sub bass, bright melodic lead synth hook in the chorus, uplifting build from quiet verse to big chorus, 2020s rock production, 120 bpm, hopeful and determined, purely instrumental
```

**Night Drive** (wie Faithless – Insomnia):

```text
instrumental only, no vocals, no singing, no rap, mid-90s progressive trance house, hypnotic staccato pizzicato string-synth riff, deep rolling bassline, four-on-the-floor kick with crisp offbeat hi-hats, dark atmospheric pads, long tension build, big breakdown and euphoric drop, club anthem, 127 bpm, night-drive mood, purely instrumental
```

**Open Road** (wie Phil Carmen – On My Way in L.A.):

```text
instrumental only, no vocals, no singing, no rap, mid-80s soft rock AOR ballad, melancholic piano intro, warm Rhodes and lush synth pads, clean chorus electric guitar, gated reverb drums, melodic bass, soaring emotional guitar solo, wide open highway feeling, longing and hopeful, 96 bpm, polished 1985 production, purely instrumental
```

**Hurricane Bloom** (wie Justice feat. Tame Impala / SZA / King Gizzard & the Lizard Wizard – Flower in a Hurricane;
der Prompt beschreibt die Stile der beteiligten Künstler, nicht den Song selbst):

```text
instrumental only, no vocals, no singing, no rap, French touch electro-disco with psychedelic rock, distorted compressed synth bass, funky slap bass and four-on-the-floor disco drums, dramatic orchestral string stabs, dreamy phased analog synths with heavy reverb, fuzzy wah psych-rock guitar lead, swirling build into a stormy euphoric climax, 118 bpm, glossy and wild, purely instrumental
```

**Celtic Jig of Iron** (wie Metallica – Whiskey in the Jar; die Volksmelodie ist gemeinfrei, das Gitarrenriff der
Thin-Lizzy- und Metallica-Fassung nicht, darum verlangt der Prompt eine eigene Melodie):

```text
instrumental only, no vocals, no singing, no rap, late-90s heavy hard rock with Irish folk flavour, original harmonized twin lead guitar melody in a Celtic jig feel, chunky palm-muted rhythm guitars, driving bass, big tight rock drums, rowdy drinking-song swagger, rousing guitar solo, live pub-rock energy, 120 bpm, proud and wild, purely instrumental
```

**Stadium Scale** (wie Linkin Park – New Divide, Live in Red Square 2011):

```text
instrumental only, no vocals, no singing, no rap, late-2000s alternative rock with electronic layers, shimmering synth arpeggio intro, massive distorted wall-of-guitars chorus, punchy tight drums, deep pulsing bass, cinematic blockbuster scale, soaring melodic lead guitar replacing the vocal line, big stadium live sound with crowd ambience, 115 bpm, epic and defiant, purely instrumental
```

**Unison Riff** (wie Linkin Park – Heavy Is the Crown, live; eine Live-Variante zu Rising Tension):

```text
instrumental only, no vocals, no singing, no rap, 2020s nu-metal anthem played live in an arena, heavy downtuned riffs, glitchy distorted synth stabs, thunderous live drums with big fills, sub bass drops, call-and-response guitar hooks, roaring crowd ambience, raw stadium mix, explosive breakdown before the last chorus, 150 bpm half-time feel, dark and triumphant, purely instrumental
```

**Motores Relentless** (wie die WRC-Titelmusik 2022 – heute; der Prompt entstand nach Titel und Genre, ohne Anhören):

```text
instrumental only, no vocals, no singing, no rap, modern motorsport TV broadcast theme, hybrid of epic cinematic orchestra and aggressive electronic rock, pounding big drums and taiko hits, gritty distorted synth bass pulse, heavy palm-muted guitar chugs, bold brass stabs, sweeping string ostinato, whooshes and risers like a car flying past, short punchy intro into a high-octane main theme, gravel-and-dust rally energy, 128 bpm, triumphant and relentless, purely instrumental
```

## Todo

[ ] **1.** Wie **Loud Luxury feat. Brando – Body** erzeugen (für Rhyflitzer FM Cruise). Das Original lebt vom Gesang,
ohne Stimme trägt der gezupfte Synth-Hook:

```text
instrumental only, no vocals, no singing, no rap, late-2010s deep progressive house, bouncy plucked synth lead hook, warm rolling bassline, four-on-the-floor kick with crisp claps and shakers, airy filtered pads, sunny summer festival vibe, long filter-sweep build into a feel-good drop, 122 bpm, carefree and groovy, purely instrumental
```
