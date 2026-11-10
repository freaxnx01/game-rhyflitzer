# Car selection hides the helicopter (#693) — design

## Problem

While flying (`FLY.on`), **Pause → Change vehicle** shows the helicopter on the turntable instead of the car.

- `stepCamera` sets the visibility of car and heli each frame (`index.html:4760`: `… heli.visible = FLY.on;`).
- While the car selection is open, it returns before that line (`index.html:4759`: `if (CARSEL.on) { stepTurntable(dt); camTail(); return; }`). So `heli.visible` stays `true`.
- `stepTurntable` (`index.html:4780`) only sets `car.visible = true`.
- The car sits at the heli's position P, and the heli cabin hides it.

## Design

1. **`stepTurntable`** sets `heli.visible = false` next to `car.visible = true`. As long as the turntable owns the camera, the heli is hidden.
2. **`leaveVehicleSwap`** (`index.html:5043`) restores `heli.visible = FLY.on`. It is the common exit of both swap paths:
   - **Drive on** goes through `applyVehicleSwap` (`:5051`), which calls `leaveVehicleSwap` and then `closePause`.
   - **Back**, Esc and every other cancel go through `restoreVehicleSwap` (`:5044–5049`), which calls `leaveVehicleSwap`.

   After **Back**, the pause stays open. The paused loop (`index.html:5563`) calls `stepCamera` only while `CARSEL.on`, so the `:4760` line would not run until the pause closes. Without this step, the heli would stay invisible behind the pause menu.

The player stays in flight after a swap (change-vehicle spec, A3). Only the ground car changes.

## Out of scope

On foot (`FOOT`) and in the train (`TRAIN`), the turntable centres on P (the walker or the loco), not on the parked car. This is a different cause and is not verified here. It can become its own issue if it is visible.

## Testing

Add one Playwright test in `tests/test_carselect.py`, using the existing helpers `open_page`, `open_swap`, `CLICK` and `wait_frames`:

- Start a race and take off with F.
- Pause and open Change vehicle. Assert `heliVisible === false` and `carVisible === true`.
- Press Esc (Back). The pause is still open. Assert `heliVisible === true` and `fly().on === true`.
- Open Change vehicle again and click Drive on. After the pause closes, assert `heliVisible === true` and `fly().on === true`.

Run only that test file, not the full suite.
