export type DisposableScene = {
  destroy: (removeCanvas: boolean) => void;
};

export type SceneParent = {
  remove: () => void;
};

/**
 * Destroy a mounted Phaser scene and detach its host exactly once.
 * The parent is removed even if Phaser throws during teardown.
 */
export function createCommonsSceneCleanup(game: DisposableScene, parent: SceneParent) {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    try {
      game.destroy(true);
    } finally {
      parent.remove();
    }
  };
}
