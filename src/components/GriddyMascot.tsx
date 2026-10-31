/**
 * Griddy's face: the GridIronVault "G" with the football in it, in his own
 * lighter cyan (public/brand/griddy.webp; griddy-96.webp is the 96 px copy the
 * badge loads, since it never shows bigger than 48 px). When he dances (a play he drew
 * lands in the Vault) the badge does the Griddy — a quick bob, tilt and
 * side-to-side kick. The dance stops for coaches who turn motion off.
 */
export function GriddyMascot({ size = 32, dancing = false }: { size?: number; dancing?: boolean }) {
  return (
    <img
      className={`gm${dancing ? " is-dancing" : ""}`}
      src="/brand/griddy-96.webp"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
