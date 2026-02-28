export default function TextureOverlay() {
  return (
    <div
      className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden rounded-[inherit]"
      style={{ zIndex: 10 }}
      aria-hidden
    >
      <img
        src="/textures/Vignette.jpg"
        alt=""
        className="absolute inset-0 w-full h-full object-fill opacity-20"
      />
    </div>
  );
}
