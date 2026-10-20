# SIM-01 fixed-seed batch

Synthetic game statistics, not historical probabilities.

Seeds: 128; ticks: 240; cells: 12; replay + JSON-save resume checked for every run.

|Gravity|POI|Intervention|Arrived / runs|In window|Battle|Parley|Retreat|Not arrived|Late empty|Leisure|Rest|Supply|Shortage|Cash limited ticks|Exhausted agents|Stalled|Invalid|Replay / resume mismatches|
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
|0|false|false|125/128|0|0|0|0|128|0|807|955|702|3|40341|0|0|0|0/0|
|0|false|true|92/128|5|3|2|0|123|0|918|1132|808|1|32227|0|0|0|0/0|
|0|true|false|128/128|75|75|0|0|3|50|3638|1002|1197|115|54457|0|0|0|0/0|
|0|true|true|128/128|13|5|8|0|36|79|3859|1206|1400|77|51492|0|0|0|0/0|
|50|false|false|128/128|124|124|0|0|0|4|711|992|739|1|34206|0|0|0|0/0|
|50|false|true|128/128|116|29|87|0|1|11|820|1139|826|1|24891|0|0|0|0/0|
|50|true|false|128/128|128|128|0|0|0|0|3551|956|1242|88|55125|0|0|0|0/0|
|50|true|true|128/128|128|30|98|0|0|0|3821|1115|1482|73|52296|0|0|0|0/0|
|100|false|false|128/128|128|128|0|0|0|0|621|1004|791|0|21978|0|0|0|0/0|
|100|false|true|128/128|128|21|107|0|0|0|589|1146|777|0|14845|0|0|0|0/0|
|100|true|false|128/128|128|128|0|0|0|0|5401|1133|1217|144|53229|0|0|0|0/0|
|100|true|true|128/128|128|21|107|0|0|0|5563|1336|1442|137|50635|0|0|0|0/0|

Arrived means leader arrived by the horizon (may be after chapter expiry); in window means first arrival before tick 82.
Retreat groups retreat + withdrawal; late empty is kept separate. Detailed endings, hashes and per-seed observations are in JSON/CSV.
Cash limited ticks count agent-ticks with money < 9 (the supply price), not free money or income. Resource bounds count agent-tick violations.
Shortage counts emitted payment failures; exhaustion counts each agent once at simultaneous zero energy/food.
Stalled counts 60 consecutive ticks at identical coordinates while targeting elsewhere. Zero does not prove indefinite liveness.
Leisure/rest/supply count successful facility arrivals, not durations. All ticks through the horizon are counted, including post-chapter activity.
