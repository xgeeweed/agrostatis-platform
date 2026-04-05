import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import HexagonBackground from "@/components/map/HexagonBackground";

export default function LoginPage() {
  const { login } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row font-sans text-slate-900">
      {/* Left Panel - Branding & Animation */}
      <div className="relative hidden lg:flex lg:w-1/2 bg-[#0B1320] text-white flex-col justify-between p-12 overflow-hidden">
        <HexagonBackground />

        {/* Content Overlay */}
        <div className="relative z-10 flex flex-col h-full justify-between pointer-events-none">
          {/* SwissSoil Logo */}
          <div className="flex items-center">
            <svg width="160" height="24" viewBox="0 0 210 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M26.2675 2.60492L32.0705 22.6133L37.6686 2.6116L42.3588 2.60789L48.201 22.3996L53.7918 2.60492H58.5991L50.8391 29.345L46.0006 29.3702L40.0478 10.1513L33.9971 29.3821L29.3367 29.3702L21.4253 2.60492H26.2675Z" fill="white"/>
              <path d="M91.4901 5.46188L91.4864 5.61396L89.1718 8.57923C88.5886 8.304 88.0307 7.90784 87.4172 7.64744C85.2532 6.73048 80.8531 6.19262 79.5682 8.72538C78.609 10.6164 79.9184 11.9125 81.5037 12.7055C84.9995 14.4534 90.1102 14.7041 91.6236 18.964C92.804 22.2876 91.6311 25.9599 88.6732 27.8687C84.0825 30.8303 77.2684 29.3784 73.3431 25.9161L76.0918 22.5465C78.514 24.3811 82.4014 26.1564 85.3904 24.7276C86.8356 24.0369 87.7555 22.3217 87.1197 20.7615C86.2109 18.5315 80.5133 17.6279 78.4198 16.4297C72.743 13.1803 73.2897 5.82985 79.2737 3.30302C83.2612 1.61971 88.2466 2.73401 91.4901 5.46114V5.46188Z" fill="white"/>
              <path d="M113.638 5.46188C113.708 5.5828 113.53 5.77124 113.462 5.87288C112.849 6.79132 111.98 7.68008 111.32 8.57923C110.737 8.304 110.179 7.90784 109.565 7.64744C107.382 6.72232 103.027 6.19337 101.718 8.72686C100.695 10.7084 102.161 11.9829 103.795 12.7768C107.472 14.5632 112.833 14.8236 113.969 19.622C114.893 23.528 113.087 27.0608 109.424 28.6069C104.892 30.5194 99.1017 29.0742 95.4918 25.9161L98.2404 22.5465C100.649 24.3611 104.331 26.0697 107.336 24.8099C108.908 24.1512 109.995 22.3247 109.224 20.6636C108.236 18.5337 102.692 17.6197 100.614 16.455C95.1713 13.4044 95.2692 6.33135 100.886 3.55007C104.974 1.52549 110.227 2.60789 113.639 5.46114L113.638 5.46188Z" fill="white"/>
              <path d="M136.564 2.55447C139.892 2.29259 143.336 3.34383 145.829 5.55906L143.438 8.57923C143.341 8.60446 142.392 7.96496 142.182 7.86036C139.981 6.77054 135.115 6.0487 133.811 8.77212C132.896 10.6817 134.236 11.9399 135.819 12.7278C139.643 14.6307 145.122 14.7672 146.16 19.9047C146.935 23.7394 145.096 27.1009 141.541 28.6061C136.998 30.5313 131.243 29.0527 127.607 25.922L130.358 22.5472C132.772 24.3915 136.797 26.1973 139.761 24.6905C141.3 23.9078 142.216 21.7653 141.096 20.2697C139.633 18.3163 134.885 17.6932 132.686 16.4305C125.546 12.3324 128.733 3.17097 136.566 2.55447H136.564Z" fill="white"/>
              <path d="M8.87726 2.55447C12.1333 2.28146 15.7544 3.3186 18.144 5.56945L15.8242 8.58146C15.2774 8.33961 14.7737 7.96719 14.2084 7.71866C11.9946 6.74606 7.27111 6.10508 6.11082 8.90343C4.95052 11.7018 8.38614 12.8762 10.3684 13.6232C12.117 14.282 14.0711 14.7138 15.6365 15.7613C19.8741 18.5953 19.607 24.8077 15.5645 27.6847C11.0769 30.8785 3.89632 29.4608 0 25.9139L2.66629 22.5472C3.66337 23.2127 4.65081 23.8804 5.75917 24.3559C8.22516 25.4131 12.6341 26.0288 13.767 22.8262C15.135 18.9573 8.6955 18.004 6.25622 17.0232C-1.99935 13.7034 0.22553 3.28003 8.87726 2.55447Z" fill="white"/>
              <path d="M198.962 2.60492V24.6067H210V29.3777H194.191V2.60492H198.962Z" fill="white"/>
              <path d="M162.429 0.753946L160.552 1.47579C150.808 5.92332 149.371 19.3824 158.205 25.6616C165.767 31.0372 176.291 27.7396 179.502 19.1413L180.089 17.2725C179.518 23.9249 174.505 29.5401 167.984 30.9081C157.497 33.1085 148.128 24.2654 149.622 13.6878C150.554 7.09029 155.847 1.75399 162.428 0.753204L162.429 0.753946Z" fill="white"/>
              <path d="M68.4972 2.60492H63.3701V29.3777H68.4972V2.60492Z" fill="white"/>
              <path d="M188.493 2.60492H183.366V29.3777H188.493V2.60492Z" fill="white"/>
              <path d="M177.456 21.2601C177.879 20.1858 178.246 19.0738 178.432 17.9283C179.013 14.3414 178.542 11.0378 176.346 8.0933C171.739 1.91869 162.293 1.72283 157.671 7.99315C152.806 14.5943 156.099 24.4813 163.853 26.8857C163.87 27.0141 163.699 26.9503 163.622 26.9384C162.344 26.7396 160.537 25.9035 159.444 25.2054C153.454 21.378 151.557 13.4244 155.278 7.30914C159.072 1.07369 167.224 -0.86779 173.461 3.00108C179.599 6.80912 181.551 15.2361 177.456 21.2586V21.2601Z" fill="white" fillOpacity="0.6"/>
              <path d="M158.869 22.8269L160.227 23.7825C167.656 28.3413 177.076 21.7445 175.142 13.2137C173.482 5.89587 164.255 3.02037 158.761 8.15859C158.645 8.08663 158.785 8.00131 158.832 7.94493C163.347 2.47584 171.679 3.13314 175.733 8.77731C179.9 14.5795 177.665 22.953 171.094 25.7588C166.963 27.523 161.919 26.566 159.01 23.0762C158.944 22.9961 158.837 22.9612 158.869 22.8269Z" fill="white" fillOpacity="0.4"/>
              <path d="M164.067 26.9569H163.925V27.0267H164.067V26.9569Z" fill="white"/>
            </svg>
          </div>

          {/* Main Copy */}
          <div className="max-w-md mt-24">
            <h1 className="text-6xl font-extrabold tracking-tight mb-4">
              AGROSTATIS<span className="text-sm align-top font-normal text-slate-400">™</span>
            </h1>
            <p className="text-slate-400 text-sm tracking-widest uppercase mb-12">
              Precision Soil Intelligence Platform
            </p>
            <p className="text-xl text-slate-300 font-light">
              H3 hexagonal spatial indexing for precision sampling
            </p>
          </div>

          {/* Stats */}
          <div className="flex space-x-12 mt-24">
            <div>
              <div className="text-2xl font-bold">14,825</div>
              <div className="text-xs text-slate-500 tracking-wider uppercase mt-1">Parcels Indexed</div>
            </div>
            <div>
              <div className="text-2xl font-bold">3,800 ha</div>
              <div className="text-xs text-slate-500 tracking-wider uppercase mt-1">Total Coverage</div>
            </div>
            <div>
              <div className="text-2xl font-bold">H3 Res 11</div>
              <div className="text-xs text-slate-500 tracking-wider uppercase mt-1">~25m Precision</div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-auto pt-12">
            <div className="flex items-center text-xs text-slate-500">
              <div className="w-1 h-4 bg-green-500 mr-3"></div>
              Powered and built by <span className="text-white ml-1 font-medium">SwissSoil</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile header */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-2xl font-extrabold tracking-tight">
              AGROSTATIS<span className="text-[8px] align-super text-slate-400">™</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">by SwissSoil</p>
          </div>

          <div className="mb-10">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Welcome back</h2>
            <p className="text-slate-500">Sign in to access the platform</p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email address</label>
              <input
                type="email"
                placeholder="you@swisssoil.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-4 py-3 rounded-lg border border-green-500 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-60 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 cursor-pointer"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-16 text-center">
            <p className="text-xs text-slate-400 mb-1">AGROSTATIS™ Precision Soil Intelligence</p>
            <p className="text-xs text-slate-400">Powered and built by SwissSoil</p>
          </div>
        </div>
      </div>
    </div>
  );
}
