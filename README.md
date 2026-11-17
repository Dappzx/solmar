# SOLMAR — Open-World 2D Crime Game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Dappzx/solmar/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Dappzx/solmar/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**SOLMAR** is a 2D open-world crime game set in the fictional coastal city of
Solmar. You play **Jax Moreno**, a driver-for-hire who takes fares, steals
cars, dodges the police, and climbs from street hustler to King of Solmar.

All characters, places, and story content are original. No Rockstar / GTA
names or assets are used.

## Run it

```sh
node serve.ts
```

Then open <http://localhost:8080> in a desktop browser. The game runs fully
offline — no network requests, no external libraries.

## Controls

| Input | Action |
| --- | --- |
| W / A / S / D or arrows | Walk / drive |
| E | Enter or exit a car, start a mission, accept a taxi fare |
| Mouse + click | Aim / shoot |
| 1 / 2 | Fists / pistol |
| Space | Handbrake |
| M | Toggle music |
| Esc | Pause |

## Missions

1. **First Fare** — pick up a client and drop them at Hotel Meridian. ($150)
2. **Hot Wheels** — steal the red coupe at the dock, deliver it to Rico's garage. ($300)
3. **Heat Wave** — stir up 2 wanted stars, then lose the heat. ($200)
4. **The Drop** — pick up a package at the market and deliver it across town while hunted. ($450)
5. **King of Solmar** — draw 3 stars and escape to the yacht at the dock. ($800)

Side work: drive a taxi to pick up passengers (fares $20–$60), and grab the
10 cash stashes hidden around the city. Progress auto-saves when a mission
ends; a finished save can be continued from the main menu.

## Screenshots

Run the game with `?shot=1` … `?shot=4` in the URL to stage the four
showcase scenes (downtown police chase, Hotel Meridian, south coastal road,
yacht dock).

## Layout

- `game/src/missions.js` — story missions, taxi fares, cash stashes
- `game/src/hud.js` — HUD + minimap
- `game/src/audio.js` — synthesised WebAudio sound + music
- `game/src/save.js` — localStorage save / load
- `game/src/shots.js` — `?shot=N` screenshot staging
- `game/src/` (other modules) — world, player, cars, traffic, police, combat

## License

MIT — see [LICENSE](LICENSE).
