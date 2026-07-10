import SongCreator from "@/components/SongCreator";

export const metadata = {
  title: "יצירת שיר | SongAI",
};

export default function CreatePage() {
  return (
    <div className="px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-2">יצירת שיר חדש</h1>
        <p className="text-white/50">מלא את הפרטים וה-AI יצור לך שיר מקורי</p>
      </div>
      <SongCreator />
    </div>
  );
}
