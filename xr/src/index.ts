import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ExperienceSystem } from './experience.js';

// One VR button, ours ("Enter VR" in the HUD). Offering the session as well makes the browser or the emulator
// show a second "Enter XR" button, so the offer is only kept on the dev server, whose tools enter through it.
const xr = projectOptions.xr;
const options = import.meta.env.DEV || !xr ? projectOptions : { ...projectOptions, xr: { ...xr, offer: 'none' as const } };

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  options,
).then((world) => {
  world.registerSystem(ExperienceSystem);
});
