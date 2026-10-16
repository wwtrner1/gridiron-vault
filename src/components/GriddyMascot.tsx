/**
 * Griddy's face: the GridIronVault "G" with the football in it, in his own
 * lighter cyan (public/brand/griddy.webp). When he dances (a play he drew
 * lands in the Vault) the badge does the Griddy — a quick bob, tilt and
 * side-to-side kick. The dance stops for coaches who turn motion off.
 */
export function GriddyMascot({ size = 32, dancing = false }: { size?: number; dancing?: boolean }) {
  return (
    <img
      className={`gm${dancing ? " is-dancing" : ""}`}
      src="/brand/griddy.webp"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
