import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center text-center gap-6 py-10">
      <h1 className="text-3xl md:text-5xl font-extrabold leading-tight">
        Pick Your <span className="text-court-orange">Fantasy Five</span>.
        <br />
        Dominate Liberia&apos;s Hardwood.
      </h1>
      <p className="text-gray-400 max-w-xl">
        Build your dream lineup from real Liberian basketball players every week,
        rack up fantasy points from real game performances, and climb the national
        leaderboard. Free to play. Bragging rights guaranteed.
      </p>
      <div className="flex gap-3">
        <Link href="/register" className="btn-primary">
          Create Free Account
        </Link>
        <Link href="/login" className="px-4 py-2 rounded-lg border border-[#2a3441]">
          Login
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10 w-full">
        <div className="card p-5 text-left">
          <p className="text-2xl mb-2">🧺</p>
          <h3 className="font-bold mb-1">Pick 5 Players</h3>
          <p className="text-sm text-gray-400">
            Choose your starting five from real Liberian league players every gameweek.
          </p>
        </div>
        <div className="card p-5 text-left">
          <p className="text-2xl mb-2">⭐</p>
          <h3 className="font-bold mb-1">Choose a Captain</h3>
          <p className="text-sm text-gray-400">
            Your captain's fantasy points are doubled. Choose wisely.
          </p>
        </div>
        <div className="card p-5 text-left">
          <p className="text-2xl mb-2">🏆</p>
          <h3 className="font-bold mb-1">Climb the Leaderboard</h3>
          <p className="text-sm text-gray-400">
            Compete weekly for the top spot and sponsor-backed prizes.
          </p>
        </div>
      </div>
    </div>
  );
}
