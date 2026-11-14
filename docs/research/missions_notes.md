# Notes for missions.csv (lunar soft-landing attempts)

Compiled 14 November 2026. 41 rows: every soft-landing attempt that reached the Moon, plus Peregrine Mission One (did not reach the Moon, no coordinates).

## Sources and method

- Coordinates and dates for almost every row come from the NASA NSSDCA table "Lunar Artifact Impacts and Landings" (last updated 13 August 2025, DE 421 frame, dates in UTC): https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html. NSSDCA gives longitude as 0..360 east; I converted to -180..180 (west negative).
- NSSDCA marks rows imaged by LROC with note "d". Those rows are `measured`.
- Outcome details and lessons were checked against the NSSDCA catalogue pages for Surveyor 2 and 4 and against the English Wikipedia article for each mission (fetched 14 November 2026). The NSSDCA catalogue pages for the Soviet Luna craft returned errors, so Luna failure causes rest on Wikipedia.
- The LROC featured-image page for IM-2 (https://lroc.im-ldi.com/images/1408) was only seen through a search-result summary, not opened directly; its coordinates match NSSDCA.
- Lessons for Apollo 12, 16, 17, Luna 21 and Luna 24 are general statements that were not checked in detail against a source; treat them as editorial.

## Rows where coords_quality is not `measured`

| id | quality | why |
|---|---|---|
| luna5 | approximate | Impact never located. NSSDCA: 1.35 S, 25.48 W, with a note that several alternative sites are reported. Wikipedia gives 8 N, 23 W (near Copernicus) and an originally announced 31 S, 8 W. The spread is hundreds of km. |
| luna7 | approximate | NSSDCA 9 N, 49 W; Wikipedia 9.8 N, 47.8 W. Not located. |
| luna8 | approximate | 9.1 N, 63.3 W in both sources. Not located. |
| luna9 | approximate | NSSDCA 7.13 N, 64.37 W, with a note that this does not match LROC images and the lander is probably at least 10 km away. A January 2026 paper (npj Space Exploration, Pinault et al.) proposed a machine-learning candidate near 7.03 N, 64.33 W; another proposal puts it about 25 km from the Soviet position. Neither is confirmed. |
| surveyor2 | approximate | NSSDCA catalogue estimate 5.5 N, 12.0 W; Wikipedia infobox 4.0 S, 11.0 W and says the precise site is unknown. Not located. |
| luna13 | approximate | 18.87 N, 62.05 W from 1960s tracking. Not located in orbital imagery. |
| surveyor4 | target | 0.43 N, 1.62 W is the NSSDCA predicted soft-landing point (alternatives 0.37 N, 1.55 W; ballistic crash 0.47 N, 1.44 W; NSSDCA table rounds to 0.5 N, 1.5 W). Never located. |
| luna15 | approximate | 17 N, 60 E, a rounded figure. Not located. |
| luna18 | approximate | NSSDCA 3.76 N, 56.66 E, with a note that an object in an LROC image may be the lander but it is unconfirmed. Wikipedia gives 3.57 N, 56.50 E. |
| peregrine1 | (blank) | Never reached the Moon. lat, lon, landing_date_utc and coords_quality are left empty on purpose; this breaks the "one of three values" rule for that one row. Re-entry over the South Pacific was 18 January 2024. Intended site was the Gruithuisen Domes (Sinus Viscositatis); I did not find published target coordinates on the page I read. |

## Other conflicts and judgment calls

- **Surveyor 2 date.** Contact was lost at about 09:35 UT on 22 September 1966 (the date NSSDCA lists). The calculated impact was 03:18 UTC on 23 September 1966 (Wikipedia). The CSV uses 1966-09-23 as the impact date.
- **Surveyor 4 outcome.** Listed as `lost before landing` because contact ended 2.5 minutes before touchdown and nobody knows whether it exploded or landed silently. Date is that of contact loss.
- **Luna 25 outcome.** Listed as `crashed`. It was lost during a pre-landing orbit burn, not during the descent itself, so `lost before landing` is defensible too.
- **SLIM outcome.** Listed as `tipped over` (came to rest about 90 degrees from its intended attitude) although JAXA counts the mission as a success and the pinpoint-landing goal was met.
- **IM-1 outcome.** Listed as `tipped over` (about 30 degrees, resting on a tank); NASA payloads still returned data.
- **Chang'e 4 coordinates.** NSSDCA/LROC 45.4561 S, 177.5885 E (used). Wikipedia infobox gives 45.444 S, 177.599 E, about 0.4 km away.
- **Chandrayaan-3.** NSSDCA 69.3741 S, 32.32 E (used); Wikipedia 69.373 S, 32.319 E. Same place.
- **Chang'e 6 date.** 22:23 UTC on 1 June 2024, which is 2 June in Beijing time.
- **Hakuto-R Mission 2.** NSSDCA impact point 60.4445 N, 4.588 W (LROC-imaged). The target was 60.5 N, 4.6 W.
- **Luna 16 and Luna 20.** NSSDCA/LROC positions used; older Soviet figures quoted in Wikipedia body text differ by up to about 0.2 degrees.
- **Luna 24 date.** 18 August 1976 per NSSDCA and Wikipedia; one Planetary Society caption says 22 August, which is the date the sample returned to Earth.

## Left out on purpose

- **Luna 4 (1963) and Luna 6 (1965):** landing attempts that missed the Moon after failed course corrections; never reached the surface.
- **Soviet lander launches that failed at launch or never left Earth orbit:** E-6 No.2, No.3, No.5, No.6, No.8, Kosmos 60, E-8 No.201 (Lunokhod), E-8-5 No.402, Kosmos 300, Kosmos 305, E-8-5 No.405, E-8-5M No.412.
- **Apollo 13:** landing aborted after the oxygen tank failure; no landing attempt.
- **Impactors and orbiters:** Ranger, Luna 2, LCROSS, Chandrayaan-1 MIP, etc.
- Rovers (Lunokhod 1 and 2, Yutu, Yutu-2, Pragyan) are covered by their lander's row.

## 2025-2026 status (checked 14 November 2026)

Landing attempts that have actually happened in 2025: Blue Ghost Mission 1 (2 March, landed), IM-2 Athena (6 March, tipped over), Hakuto-R Mission 2 Resilience (5 June, crashed).

I found **no lunar landing attempt in 2026** up to today. Searches for October and November 2026 returned no touchdown, and the Wikipedia mission list shows nothing after Resilience. Most of this status comes from secondary sources and search summaries, the latest dated mid-October 2026, so the last four weeks are not independently confirmed.

### Planned, not yet attempted

| Mission | Operator | Expected | Target | Confidence |
|---|---|---|---|---|
| Griffin Mission 1 (with Astrolab FLIP rover) | Astrobotic, United States | Launch no earlier than November 2026 on Falcon Heavy by most recent sources (one listing shows 30 November 2026); Wikipedia says no earlier than January 2027. Not launched as far as I could find. | South pole region near Nobile crater; no coordinates confirmed | Date uncertain |
| Blue Moon Mark 1 pathfinder ("Endurance") | Blue Origin, United States | Early 2027 (no earlier than Q1), delayed after a New Glenn pad explosion reported in May 2026 | South pole region; coordinates not confirmed | Secondary sources only |
| IM-3 | Intuitive Machines, United States | Slipped to early 2027 (NASA statement reported September 2026) | Reiner Gamma per earlier plans; not re-verified | Secondary sources only |
| Blue Ghost Mission 2 | Firefly Aerospace, United States | No earlier than 2027 | Far side; coordinates not confirmed | Secondary sources only |
| Chang'e 7 | CNSA, China | Postponed out of 2026 (reported August 2026); 2027 expected | Near Shackleton crater, south pole | Secondary sources only |
| ispace Mission 3 (ULTRA lander) | ispace, Japan | 2028 | Not confirmed | Wikipedia list |
| Chandrayaan-4 | ISRO, India | 2027-2028 | Not confirmed | Wikipedia list |
| Starship HLS uncrewed demo | SpaceX, United States | 2027 | Not confirmed | Wikipedia list |

None of these has published touchdown coordinates that I verified, so none is given a lat/lon here.
