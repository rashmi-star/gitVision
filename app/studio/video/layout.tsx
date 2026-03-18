export default function StudioVideoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-[#0c0c0c]">
      {children}
    </div>
  );
}
