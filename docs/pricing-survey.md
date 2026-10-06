# Operator pricing survey

The planner's budget estimate uses the rates in `src/lib/destinations.ts`, which are
currently developer guesses. Before launch, collect real prices from 5–10 Kashmir
operators, take the median for each row, and update the file (then set
`PRICING_META.status = "validated"` and `reviewedOn`).

Ask for **typical B2C prices they quote to tourists**, per season, not their net cost.

| Season | Months |
| --- | --- |
| Peak winter | late Dec – Feb |
| Spring / tulip | Mar – Apr |
| Summer peak | May – Jul |
| Shoulder | Aug – Nov |

## Hotels — per room per night (twin sharing, breakfast)

| Place | Standard | 3-star | 4-star | 5-star/luxury | Houseboat (deluxe) |
| --- | --- | --- | --- | --- | --- |
| Srinagar | | | | | |
| Gulmarg | | | | | — |
| Pahalgam | | | | | — |
| Sonamarg | | | | | — |

## Transport — per vehicle per day (incl. driver, fuel, parking)

| Vehicle | Srinagar local | Day trip (Gulmarg/Sonamarg/Pahalgam) | Multi-day tour per day |
| --- | --- | --- | --- |
| Sedan (Dzire/Etios) | | | |
| SUV (Innova/Crysta) | | | |
| Tempo Traveller (12) | | | |

Also ask: are local union taxis compulsory in Gulmarg / Pahalgam / Sonamarg, and what do they cost?

## Activities — per person

| Activity | Price | Notes |
| --- | --- | --- |
| Shikara (1 hr, per boat) | | |
| Gulmarg Gondola Phase 1 | | |
| Gulmarg Gondola Phase 2 | | |
| Pony ride (typical, per route) | | |
| Ski lesson (half day) | | |
| Sledge ride | | |
| Thajiwas glacier pony | | |
| Rafting (Pahalgam) | | |

## Meals — per person per day (lunch + dinner, if not included)

| Standard | 3-star | 4-star | Luxury |
| --- | --- | --- | --- |
| | | | |

## Typical packages (sanity check for the estimate)

For each operator, ask what they would charge for:

1. 2 adults, 5N/6D, Srinagar 2N + Gulmarg 2N + Pahalgam 1N, 3-star, sedan, mid-January.
2. 4 adults + 2 kids, 6N/7D, Srinagar 3N + Gulmarg 2N + Pahalgam 1N, 4-star, Innova, May.

Then compare with the planner's estimate for the same trip, which should land inside the quoted range.
