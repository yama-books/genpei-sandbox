# SIM-02 sensitivity

Synthetic game experiments, not historical probabilities. 128 paired fixed seeds per cell; gravity 0/50/100; 240 ticks; replay and tick-30 JSON resume checked in every run.

|Scenario|Gravity|Arrived / 128|At resolution|Before departure|Postponed|Endings|Changed vs control|Replay/resume|Invalid/stalled/unaffordable|
|---|---|---|---|---|---|---|---|---|---|
|control|0|128|125|75|0|{"empty":50,"upper_hand":66,"stalemate":9,"missed":3}|0|0/0|0/0/0|
|control|50|128|128|128|0|{"upper_hand":44,"stalemate":84}|0|0/0|0/0/0|
|control|100|128|128|128|0|{"stalemate":87,"upper_hand":41}|0|0/0|0/0/0|
|departure-60-only|0|128|125|2|0|{"empty":123,"missed":3,"upper_hand":2}|73|0/0|0/0/0|
|departure-60-only|50|128|128|127|0|{"upper_hand":43,"stalemate":84,"empty":1}|1|0/0|0/0/0|
|departure-60-only|100|128|128|128|0|{"stalemate":87,"upper_hand":41}|0|0/0|0/0/0|
|departure-100-only|0|128|125|116|0|{"stalemate":20,"upper_hand":96,"empty":9,"missed":3}|41|0/0|0/0/0|
|departure-100-only|50|128|128|128|0|{"upper_hand":44,"stalemate":84}|0|0/0|0/0/0|
|departure-100-only|100|128|128|128|0|{"stalemate":87,"upper_hand":41}|0|0/0|0/0/0|
|closing-90-only|0|128|101|75|0|{"missed":27,"upper_hand":66,"empty":24,"stalemate":9,"withdrawal":2}|26|0/0|0/0/0|
|closing-90-only|50|128|128|128|0|{"upper_hand":44,"stalemate":84}|0|0/0|0/0/0|
|closing-90-only|100|128|128|128|0|{"stalemate":87,"upper_hand":41}|0|0/0|0/0/0|
|closing-150-only|0|128|128|75|0|{"empty":53,"upper_hand":66,"stalemate":9}|3|0/0|0/0/0|
|closing-150-only|50|128|128|128|0|{"upper_hand":44,"stalemate":84}|0|0/0|0/0/0|
|closing-150-only|100|128|128|128|0|{"stalemate":87,"upper_hand":41}|0|0/0|0/0/0|
|grace-5-only|0|128|125|75|0|{"empty":50,"upper_hand":66,"stalemate":9,"missed":3}|0|0/0|0/0/0|
|grace-5-only|50|128|128|128|0|{"upper_hand":44,"stalemate":84}|0|0/0|0/0/0|
|grace-5-only|100|128|128|128|0|{"stalemate":87,"upper_hand":41}|0|0/0|0/0/0|
|grace-30-only|0|128|125|75|0|{"empty":50,"upper_hand":66,"stalemate":9,"missed":3}|0|0/0|0/0/0|
|grace-30-only|50|128|128|128|0|{"upper_hand":44,"stalemate":84}|0|0/0|0/0/0|
|grace-30-only|100|128|128|128|0|{"stalemate":87,"upper_hand":41}|0|0/0|0/0/0|
|decision-start-50-only|0|128|125|75|0|{"empty":50,"upper_hand":72,"missed":3,"stalemate":3}|6|0/0|0/0/0|
|decision-start-50-only|50|128|128|128|0|{"withdrawal":73,"upper_hand":30,"empty":9,"stalemate":16}|96|0/0|0/0/0|
|decision-start-50-only|100|128|128|128|0|{"upper_hand":122,"stalemate":6}|81|0/0|0/0/0|
|stress|0|128|127|121|121|{"withdrawal":121,"empty":6,"missed":1}|123|0/0|0/0/0|
|stress|50|128|128|128|128|{"withdrawal":115,"empty":12,"retreat":1}|128|0/0|0/0/0|
|stress|100|128|128|127|127|{"retreat":105,"empty":23}|128|0/0|0/0/0|
|stress-grace-5|0|128|127|121|121|{"withdrawal":121,"empty":6,"missed":1}|123|0/0|0/0/0|
|stress-grace-5|50|128|128|128|128|{"withdrawal":106,"retreat":11,"empty":11}|128|0/0|0/0/0|
|stress-grace-5|100|128|128|127|127|{"retreat":113,"empty":15}|128|0/0|0/0/0|
|stress-grace-30|0|128|127|121|121|{"withdrawal":121,"empty":6,"missed":1}|123|0/0|0/0/0|
|stress-grace-30|50|128|128|128|128|{"withdrawal":115,"empty":12,"retreat":1}|128|0/0|0/0/0|
|stress-grace-30|100|128|128|127|127|{"retreat":79,"empty":49}|128|0/0|0/0/0|

Control: default resources, four synthetic POIs near Yashima, no intervention. Resource changes affect only C036. Window scenarios shift departure and closing together (30-tick gap); *-only scenarios override one clock and hold the others fixed. See scenarios in JSON for exact overrides. Decision interval changes only periodic reconsideration; arrival-triggered decisions remain. POI translations change only abstract x/y, keeping relative spacing/effects/costs fixed; modernLocation stays fixture metadata and is not a route. Stress scenarios are explicit interactions. Changed endings count paired per-seed differences, not statistical significance. Facility counts cover all three agents through tick 240, including after chapter resolution. Arrived includes late visits; at-resolution excludes them. Finite stalls are not a proof of perpetual liveness. Source hashes use normalized UTF-8 text encoded as a JSON string before SHA-256.
