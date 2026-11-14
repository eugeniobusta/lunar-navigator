import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.scene.background = null; // sky #000000
  world.renderer.setClearColor(0x000000, 1);
});
